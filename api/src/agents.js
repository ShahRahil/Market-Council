import {config} from './config.js';
import {sendMessage,audit} from './audit.js';
import {getQuote,getNews} from './marketData.js';
import {database} from './db.js';
let llmClient;
async function rationale(role,facts,fallback){
 if(!config.llmEnabled) return {rationale:fallback,reasoningMode:'RULE_BASED_SUMMARY'};
 try{
  if(!llmClient){const {default:OpenAI}=await import('openai');llmClient=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:10000,maxRetries:0});}
  const answer=await llmClient.responses.create({model:config.llmModel,
    instructions:`You are ${role}, a specialist in a PAPER-ONLY investment research workflow. Summarize the supplied evidence in one short sentence. Never invent news, prices, or broker actions. You cannot approve orders.`,
    input:JSON.stringify(facts),max_output_tokens:100});
  const text=answer.output_text?.trim();return {rationale:text||fallback,reasoningMode:text?'LLM_ASSISTED':'FALLBACK'};
 }catch(e){console.warn('LLM unavailable',e.message);return {rationale:fallback,reasoningMode:'FALLBACK'};}
}
async function emit(runId,from,to,kind,facts,summary){
 const agent=await database().collection('agent_identities').findOne({agentId:from});
 if(!agent?.enabled){
   await audit(runId,'AGENT_NOT_ENABLED','orchestrator',{agentId:from,kind});
   throw new Error(`Agent ${from} is disabled in Atlas.`);
 }
 const response=await rationale(from,facts,summary);
 const body={...facts,...response};
 await sendMessage(runId,from,to,kind,body);
 await audit(runId,'AGENT_FINDING',from,{kind,source:facts.source||null,reasoningMode:response.reasoningMode,rationale:response.rationale});
 return body;
}
export async function research(runId,input){
 const {security,notionalUsd,proposerId,side}=input;
 const quote=await getQuote(security);
 const news=await getNews(security);
 const market=await emit(runId,'market-agent','news-agent','MARKET_SNAPSHOT',{security,quote,source:quote.source},
  `Reviewed ${security.symbol}: ${quote.changePercentage.toFixed(2)}% quoted change; source ${quote.source}.`);
 const newsResult=await emit(runId,'news-agent','quant-agent','NEWS_REVIEW',{symbol:security.symbol,articles:news.articles,note:news.note||'',source:news.source,previous:market.rationale},
  news.articles.length?`Identified ${news.articles.length} provider headlines; they require human interpretation.`:'No verified headlines are available for this review.');
 const quant=await emit(runId,'quant-agent','risk-agent','PRICE_RISK',{symbol:security.symbol,changePercentage:quote.changePercentage,
   volatilityFlag:Math.abs(quote.changePercentage)>=3,source:quote.source,previous:newsResult.rationale},
  `Daily percentage movement is ${quote.changePercentage.toFixed(2)}%; no calibrated return forecast is claimed.`);
 const risk=await emit(runId,'risk-agent','portfolio-agent','RISK_NOTE',{symbol:security.symbol,notionalUsd,previous:quant.rationale,
   riskLevel:Math.abs(quote.changePercentage)>=3?'ELEVATED':'STANDARD'},
  'Review concentration, available cash, current permissions, and human approval before paper submission.');
 const proposal={symbol:security.symbol,side,notionalUsd,proposerId,accountId:'PAPER-001',quoteSource:quote.source,
   currency:security.currency,priceReference:quote.price,quoteAsOf:quote.asOf};
 await emit(runId,proposerId,'execution-gateway','ORDER_PROPOSAL',{proposal,previous:risk.rationale,source:quote.source},
  `Requested a ${side} $${notionalUsd.toFixed(2)} USD paper order review for ${security.symbol}.`);
 return proposal;
}
