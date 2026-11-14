// This is a SEPARATE, SIMULATED brokerage service. It cannot connect to a live broker.
import express from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { timingSafeEqual, randomUUID } from 'node:crypto';
const port = Number(process.env.PORT || 3002);
const filepath = process.env.ORDERS_PATH || '/data/orders.json';
const secret = process.env.BROKER_SHARED_SECRET;
if (!secret || secret.length < 16 || secret.startsWith('REPLACE_')) throw new Error('Configure BROKER_SHARED_SECRET');
mkdirSync(dirname(filepath), {recursive:true});
let state = existsSync(filepath) ? JSON.parse(readFileSync(filepath, 'utf8')) : { orders:[] };
function save() {
  const temp = `${filepath}.tmp`;
  writeFileSync(temp, JSON.stringify(state,null,2), { mode:0o600 });
  renameSync(temp,filepath);
}
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'16kb'}));
app.use((req,res,next)=>{
  const supplied=Buffer.from(req.header('x-broker-secret') || '');
  const expected=Buffer.from(secret);
  if(supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return res.status(401).json({error:'Unauthorized gateway'});
  next();
});
app.post('/orders',(req,res)=>{
  const {clientOrderId,symbol,side,notionalUsd,accountId}=req.body || {};
  if (!/^paper-[a-f\d-]{36}$/.test(clientOrderId || '') || !/^[A-Z]{1,6}(\.[A-Z]{2})?$/.test(symbol || '') || !['BUY','SELL'].includes(side) ||
      !Number.isFinite(notionalUsd) || notionalUsd <= 0 || notionalUsd > 10000 || accountId !== 'PAPER-001') return res.status(400).json({error:'Invalid simulated order'});
  const found=state.orders.find(x=>x.clientOrderId === clientOrderId);
  if(found) {
    if(found.symbol !== symbol || found.notionalUsd !== notionalUsd || found.side !== side) return res.status(409).json({error:'Idempotency key reused with different parameters'});
    return res.json(found);
  }
  const receipt = { id:randomUUID(), clientOrderId, symbol, side, notionalUsd, accountId, status:'ACCEPTED', isRealMoney:false, acceptedAt:new Date().toISOString(), provider:'MARKET_COUNCIL_SIMULATED_BROKER' };
  state.orders.push(receipt); save();
  res.status(201).json(receipt);
});
app.get('/orders/:id',(req,res)=>{
  const result=state.orders.find(x=>x.clientOrderId === req.params.id);
  if(!result) return res.status(404).json({error:'Paper order not found'});
  res.json(result);
});
app.post('/orders/:id/cancel',(req,res)=>{
  const result=state.orders.find(x=>x.clientOrderId === req.params.id);
  if(!result) return res.status(404).json({error:'Paper order not found'});
  if(result.status === 'CANCELLED') return res.json(result);
  if(result.status !== 'ACCEPTED') return res.status(409).json({error:'Order cannot be cancelled in current status'});
  result.status='CANCELLED';result.cancelledAt=new Date().toISOString();save();
  res.json(result);
});
app.listen(port,'0.0.0.0',()=>console.log(`Simulated broker ready on port ${port}. No live trading capability.`));
