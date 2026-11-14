import {randomUUID} from 'node:crypto';
import {database} from './db.js';
import {audit,sendMessage} from './audit.js';
import {getQuote,getNews} from './marketData.js';
import {findSecurity} from './securities.js';
import {getAccount} from './account.js';
import {scoreSecurity,validateScanSymbols} from './signalLogic.js';
import {startRun} from './orchestrator.js';

const coll = name => database().collection(name);
const AGENTS=['market-agent','news-agent','quant-agent','risk-agent','portfolio-agent'];
function asPublicScan(run) {return run;}
export async function startScan(body) {
  const symbols=validateScanSymbols(body?.symbols,findSecurity);
  const active=await coll('recommendation_scans').countDocuments({status:{$in:['QUEUED','RUNNING']}});
  if(active>=2) throw Object.assign(new Error('Two scans are already active; wait for one to finish.'),{statusCode:429});
  const id=randomUUID(), now=new Date();
  await coll('recommendation_scans').insertOne({id,symbols,status:'QUEUED',processed:0,total:symbols.length,failures:0,
    dataMode:process.env.DATA_MODE==='finnhub'?'FINNHUB':'SAMPLE_DATA',createdAt:now,updatedAt:now});
  await audit(id,'WATCHLIST_SCAN_REQUESTED','operator',{symbols,methodology:'SCREEN_V1_ONE_DAY_MOMENTUM_HEADLINE_KEYWORDS'});
  setImmediate(()=>executeScan(id,symbols).catch(async err=>{
    console.error('Recommendation scan failed:',id,err);
    await coll('recommendation_scans').updateOne({id},{$set:{status:'ERROR',error:'Research scan failed',updatedAt:new Date()}});
    await audit(id,'WATCHLIST_SCAN_ERROR','orchestrator',{error:String(err.message).slice(0,140)});
  }));
  return {id,status:'QUEUED'};
}
async function requireAgent(agentId) {
  const identity=await coll('agent_identities').findOne({agentId});
  if(!identity?.enabled) throw new Error(`Agent ${agentId} is disabled in Atlas`);
}
async function executeScan(id,symbols) {
  await coll('recommendation_scans').updateOne({id},{$set:{status:'RUNNING',updatedAt:new Date()}});
  let failures=0;
  for(const symbol of symbols) {
    const security=findSecurity(symbol);
    try {
      const quote=await getQuote(security);
      await requireAgent('market-agent');
      await sendMessage(id,'market-agent','news-agent','WATCHLIST_MARKET_OBSERVATION',{
        symbol,source:quote.source,asOf:quote.asOf,dayChangePct:quote.changePercentage,price:quote.price});
      const news=await getNews(security);
      await requireAgent('news-agent');
      await sendMessage(id,'news-agent','quant-agent','WATCHLIST_NEWS_REVIEW',{
        symbol,source:news.source,headlines:news.articles.slice(0,5).map(a=>({title:a.title,url:a.url,publisher:a.publisher})),note:news.note});
      const account=await getAccount();
      const rec=scoreSecurity({security,quote,news,account});
      await requireAgent('quant-agent');
      await sendMessage(id,'quant-agent','risk-agent','WATCHLIST_SCREENING_SCORE',{
        symbol,methodology:rec.methodology,score:rec.score,signals:rec.signals,warning:'Screening heuristic; not a forward-return prediction'});
      await requireAgent('risk-agent');
      await sendMessage(id,'risk-agent','portfolio-agent','WATCHLIST_RISK_REVIEW',{
        symbol,heldUsd:rec.heldUsd,caveats:rec.caveats,score:rec.score});
      await requireAgent('portfolio-agent');
      await sendMessage(id,'portfolio-agent','orchestrator','WATCHLIST_RECOMMENDATION',{
        symbol,signal:rec.signal,score:rec.score,explanations:rec.explanations,
        note:'A research signal does not authorize broker execution'});
      const now=new Date();
      await coll('recommendations').insertOne({id:randomUUID(),scanId:id,symbol:security.symbol,...rec,createdAt:now});
      await audit(id,'RESEARCH_RECOMMENDATION_SAVED','portfolio-agent',{
        symbol,signal:rec.signal,score:rec.score,source:quote.source,modelVersion:rec.modelVersion});
    } catch(err) {
      failures++;
      await coll('recommendations').insertOne({id:randomUUID(),scanId:id,symbol,security,
        signal:'UNAVAILABLE',error:String(err.message).slice(0,180),createdAt:new Date()});
      await audit(id,'RESEARCH_SECURITY_UNAVAILABLE','orchestrator',{
        symbol,error:String(err.message).slice(0,160)});
    }
    await coll('recommendation_scans').updateOne({id},{$inc:{processed:1},$set:{failures,updatedAt:new Date()}});
  }
  const status=failures===symbols.length?'ERROR':failures?'PARTIAL':'COMPLETE';
  await coll('recommendation_scans').updateOne({id},{$set:{status,finishedAt:new Date(),updatedAt:new Date()}});
  await audit(id,'WATCHLIST_SCAN_FINISHED','orchestrator',{status,processed:symbols.length,failures});
}
export async function markInterruptedScans() {
  // Fail closed after a service restart; users can request a fresh scan, not a partial replay.
  const running=await coll('recommendation_scans').find({status:{$in:['QUEUED','RUNNING']}}).toArray();
  for(const scan of running){
    await coll('recommendation_scans').updateOne({id:scan.id,status:{$in:['QUEUED','RUNNING']}},
      {$set:{status:'INTERRUPTED',updatedAt:new Date()}});
    await audit(scan.id,'WATCHLIST_SCAN_INTERRUPTED','orchestrator',{previousStatus:scan.status,note:'No automatic replay after process restart'});
  }
}
export async function listScans() {
  return coll('recommendation_scans').find({}).sort({createdAt:-1}).limit(15).toArray();
}
export async function getScan(id) {
  const scan=await coll('recommendation_scans').findOne({id});
  if(!scan) throw Object.assign(new Error('Scan not found'),{statusCode:404});
  const [recommendations,messages,auditEvents]=await Promise.all([
    coll('recommendations').find({scanId:id}).sort({symbol:1}).toArray(),
    coll('agent_messages').find({runId:id}).sort({createdAt:1}).limit(150).toArray(),
    coll('audit_events').find({runId:id}).sort({createdAt:1}).limit(150).toArray()]);
  return {scan:asPublicScan(scan),recommendations,messages,auditEvents};
}
export async function createReviewFromSignal(id,payload) {
  const rec=await coll('recommendations').findOne({id});
  if(!rec || !['BUY','SELL'].includes(rec.signal)) throw Object.assign(new Error('Only BUY and SELL signals can open paper order reviews.'),{statusCode:409});
  // Rescan before initiating a paper review: never turn stale stored opinions directly into a broker action.
  const age=Date.now()-new Date(rec.createdAt).getTime();
  if(age>30*60_000) throw Object.assign(new Error('The research signal is older than 30 minutes. Scan again before requesting a review.'),{statusCode:409});
  const n=Number(payload?.notionalUsd);
  if(!Number.isFinite(n) || n<=0 || !Number.isInteger(n*100)) throw Object.assign(new Error('Enter a valid USD amount.'),{statusCode:400});
  const result=await startRun({symbol:rec.symbol,side:rec.signal,notionalUsd:n,proposerId:'portfolio-agent',recommendationId:rec.id});
  await audit(rec.scanId,'PAPER_REVIEW_CREATED_FROM_SIGNAL','operator',{recommendationId:rec.id,runId:result.id,symbol:rec.symbol,side:rec.signal,notionalUsd:n});
  return result;
}
