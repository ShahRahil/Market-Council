import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config, checkConfig } from './config.js';
import { connectDb, database, closeDb } from './db.js';
import {SECURITIES,findSecurity} from './securities.js';
import {validatePermissions} from './permissions.js';
import {getQuote,getNews} from './marketData.js';
import {getAccount,accountView} from './account.js';
import { audit } from './audit.js';
import {
  startRun, approveRun, setKillSwitch, setPolicy, stopPendingRuns,
  cancelVerifiedOrder, reconcileRun, markInterruptedRuns
} from './orchestrator.js';
import { startControlWatcher } from './stream.js';
import {startScan,listScans,getScan,createReviewFromSignal,markInterruptedScans} from './recommendations.js';

checkConfig();
await connectDb();
await markInterruptedRuns();
await markInterruptedScans();
startControlWatcher({onKill:stopPendingRuns});
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'32kb'}));
function sameSecret(supplied, expected) {
  const a=Buffer.from(supplied || ''); const b=Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}
function guarded(handler) { return (req,res,next)=>Promise.resolve(handler(req,res)).catch(next); }
app.get('/api/health',guarded(async (_req,res)=>{
  await database().command({ ping:1 });
  res.json({ok:true,atlasConnected:true,mode:'SIMULATED_PAPER_ONLY',liveTradingEnabled:false,marketDataMode:config.dataMode});
}));
app.use('/api',(req,res,next)=>{
  const candidate = (req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (!sameSecret(candidate,config.adminToken)) return res.status(401).json({error:'Operator token required'});
  next();
});
app.get('/api/state',guarded(async(_req,res)=>{
  const [policy,control,runCount,blockedCount,completedCount,stoppedCount]=await Promise.all([
    database().collection('policies').findOne({_id:'primary'}),
    database().collection('control').findOne({_id:'global'}),
    database().collection('runs').countDocuments(),
    database().collection('runs').countDocuments({status:'DENIED'}),
    database().collection('runs').countDocuments({status:'COMPLETE'}),
    database().collection('runs').countDocuments({status:'STOPPED'})
  ]);
  res.json({portfolio:accountView(await getAccount()),policy,control,stats:{runCount,blockedCount,completedCount,stoppedCount},mode:'SIMULATED_PAPER_ONLY',marketDataMode:config.dataMode,llmEnabled:config.llmEnabled});
}));
app.get('/api/universe',(_req,res)=>res.json(SECURITIES));
app.get('/api/quote/:symbol',guarded(async(req,res)=>{
  const security=findSecurity(req.params.symbol);
  if(!security)return res.status(404).json({error:'Security not in supported universe'});
  res.json(await getQuote(security));
}));
app.get('/api/news/:symbol',guarded(async(req,res)=>{
  const security=findSecurity(req.params.symbol);
  if(!security)return res.status(404).json({error:'Security not in supported universe'});
  res.json(await getNews(security));
}));
app.get('/api/governance',guarded(async(_req,res)=>{
  const [identities, policy, control, recentSystemEvents]=await Promise.all([
    database().collection('agent_identities').find({})
      .project({_id:0,agentId:1,role:1,enabled:1,allowedActions:1}).sort({agentId:1}).toArray(),
    database().collection('policies').findOne({_id:'primary'}),
    database().collection('control').findOne({_id:'global'}),
    database().collection('audit_events').find({runId:'system'})
      .sort({createdAt:-1}).limit(25).toArray()
  ]);
  res.json({identities,policy,control,recentSystemEvents});
}));
app.get('/api/recommendations/scans',guarded(async(_req,res)=>res.json(await listScans())));
app.post('/api/recommendations/scans',guarded(async(req,res)=>res.status(202).json(await startScan(req.body))));
app.get('/api/recommendations/scans/:id',guarded(async(req,res)=>res.json(await getScan(req.params.id))));
app.post('/api/recommendations/:id/create-review',guarded(async(req,res)=>res.status(202).json(await createReviewFromSignal(req.params.id,req.body))));
app.get('/api/runs',guarded(async(_req,res)=>{
  const runs=await database().collection('runs').find({}).sort({createdAt:-1}).limit(30).toArray();
  res.json(runs);
}));
app.get('/api/runs/:id',guarded(async(req,res)=>{
  const id=req.params.id;
  const [run,auditEvents,messages]=await Promise.all([
    database().collection('runs').findOne({id}),
    database().collection('audit_events').find({runId:id}).sort({createdAt:1,_id:1}).limit(200).toArray(),
    database().collection('agent_messages').find({runId:id}).sort({createdAt:1,_id:1}).limit(100).toArray()
  ]);
  if(!run) return res.status(404).json({error:'Run not found'});
  res.json({run,auditEvents,messages});
}));
app.post('/api/runs',guarded(async(req,res)=>{
  const result=await startRun(req.body);
  res.status(202).json(result);
}));
app.post('/api/runs/:id/approve',guarded(async(req,res)=>res.json(await approveRun(req.params.id))));
app.post('/api/runs/:id/cancel-paper-order',guarded(async(req,res)=>res.json(await cancelVerifiedOrder(req.params.id))));
app.post('/api/runs/:id/reconcile',guarded(async(req,res)=>res.json(await reconcileRun(req.params.id))));
app.post('/api/control/kill',guarded(async(_req,res)=>res.json(await setKillSwitch(true))));
app.post('/api/control/reset',guarded(async(_req,res)=>res.json(await setKillSwitch(false))));
app.post('/api/policy',guarded(async(req,res)=>{
  const maxPositionPct=Number(req.body?.maxPositionPct),maxOrderUsd=Number(req.body?.maxOrderUsd);
  res.json(await setPolicy({maxPositionPct,maxOrderUsd}));
}));
app.patch('/api/agents/:id',guarded(async(req,res)=>{
  const id=req.params.id;
  const existing=await database().collection('agent_identities').findOne({agentId:id});
  if(!existing)return res.status(404).json({error:'Agent not found'});
  const {enabled,allowedActions}=validatePermissions(id,req.body);
  const next=await database().collection('agent_identities').findOneAndUpdate({agentId:id},
    {$set:{enabled,allowedActions,updatedAt:new Date()},$inc:{revision:1}},{returnDocument:'after'});
  await audit('system','AGENT_PERMISSIONS_CHANGED','operator',{agentId:id,before:{enabled:existing.enabled,allowedActions:existing.allowedActions},after:{enabled,allowedActions}});
  res.json({agentId:next.agentId,enabled:next.enabled,allowedActions:next.allowedActions});
}));
app.get('/api/system-audit',guarded(async(_req,res)=>{
  res.json(await database().collection('audit_events').find({runId:'system'}).sort({createdAt:-1}).limit(30).toArray());
}));
app.use((err,_req,res,_next)=>{
  console.error(err);
  const status=err.statusCode || 500;
  res.status(status).json({error:status === 500 ? 'Internal error. Inspect API logs.' : err.message});
});
const server=app.listen(config.port,'0.0.0.0',()=>console.log(`Governance API running on ${config.port}; live trading permanently disabled.`));
const shutdown=()=>server.close(async()=>{await closeDb();process.exit(0)});
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
