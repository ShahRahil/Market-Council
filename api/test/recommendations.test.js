import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSecurity,headlineSignals,validateScanSymbols} from '../src/signalLogic.js';
import {findSecurity,validateRequest} from '../src/securities.js';
import {accountView,policyAccount} from '../src/accountLogic.js';
import {evaluatePolicy} from '../src/policy.js';
const account={totalValue:10000,cash:7450,accountId:'PAPER-001',currency:'USD',positions:[{symbol:'AAPL',value:1500},{symbol:'MSFT',value:700},{symbol:'NVDA',value:350}],reservations:[],version:1};
const quote=(symbol,change)=>({symbol,price:100,changePercentage:change,source:'SAMPLE_DATA',dayHigh:101,dayLow:99});
const sampleNews={source:'SAMPLE_DATA',articles:[],note:'No news connected'};
const evaluate=(side,symbol,amount,acct=account)=>evaluatePolicy({proposal:{side,symbol,notionalUsd:amount,proposerId:'portfolio-agent'},account:policyAccount(acct),policy:{maxPositionPct:20,maxOrderUsd:2500,version:1,humanApprovalRequired:true},control:{killSwitch:false},identity:{enabled:true,agentId:'portfolio-agent',allowedActions:['PROPOSE_PAPER_ORDER']}});
test('watchlist has 2–10 distinct supported symbols',()=>{
 assert.deepEqual(validateScanSymbols(['aapl','qqq'],findSecurity),['AAPL','QQQ']);
 assert.throws(()=>validateScanSymbols(['AAPL'],findSecurity),/2 and 10/);
 assert.throws(()=>validateScanSymbols(['AAPL','AAPL'],findSecurity),/unique/);
 assert.throws(()=>validateScanSymbols(['AAPL','FAKE'],findSecurity),/universe/);
 assert.throws(()=>validateScanSymbols(Array.from({length:11},()=> 'AAPL'),findSecurity),/2 and 10/);
});
test('sample data generates modest BUY, SELL for held stock, HOLD with weak data',()=>{
 const nvda=scoreSecurity({security:findSecurity('NVDA'),quote:quote('NVDA',2.3),news:sampleNews,account});
 assert.equal(nvda.signal,'BUY');assert.equal(nvda.dataGrade,'SAMPLE');
 const apple=scoreSecurity({security:findSecurity('AAPL'),quote:quote('AAPL',-1.1),news:sampleNews,account});
 assert.equal(apple.signal,'SELL');assert.equal(apple.heldUsd,1500);
 const microsoft=scoreSecurity({security:findSecurity('MSFT'),quote:quote('MSFT',0.7),news:sampleNews,account});
 assert.equal(microsoft.signal,'HOLD');
 assert(apple.caveats.some(s=>s.includes('NOT a validated prediction')));
});
test('no suggestion to sell a stock that the account does not hold',()=>{
 const result=scoreSecurity({security:findSecurity('QQQ'),quote:quote('QQQ',-10),news:sampleNews,account});
 assert.equal(result.signal,'HOLD');assert.equal(result.heldUsd,0);
});
test('news classification is transparent and only uses known phrases',()=>{
 const signals=headlineSignals([{title:'Company raises guidance and reports record revenue'}, {title:'Analyst downgrade after weak demand'}, {title:'Company announces event'}]);
 assert.equal(signals.positive,1);assert.equal(signals.negative,1);
 assert.equal(signals.matched.length,2);
});
test('unavailable provider quote fails rather than inventing a score',()=>{
 assert.throws(()=>scoreSecurity({security:findSecurity('QQQ'),quote:{price:0},news:sampleNews,account}),/No usable/);
});
test('BUY and SELL are user-defined review actions, default is BUY',()=>{
 assert.equal(validateRequest({symbol:'AAPL',notionalUsd:200}).side,'BUY');
 assert.equal(validateRequest({symbol:'AAPL',side:'SELL',notionalUsd:100}).side,'SELL');
 assert.throws(()=>validateRequest({symbol:'AAPL',side:'SHORT',notionalUsd:100}),/Only BUY and SELL/);
});
test('SELL requires an owned position and never allows over-selling',()=>{
 assert.equal(evaluate('SELL','AAPL',500).allowed,true);
 assert(evaluate('SELL','QQQ',200).reasons.includes('INSUFFICIENT_SELLABLE_HOLDINGS'));
 assert(evaluate('SELL','AAPL',1501).reasons.includes('INSUFFICIENT_SELLABLE_HOLDINGS'));
 assert.equal(evaluate('BUY','AAPL',600).allowed,false);
});
test('paper SELL reservations prevent double-selling but do not consume buying cash',()=>{
 const acct={...account,reservations:[{clientOrderId:'paper-123',symbol:'AAPL',side:'SELL',notionalUsd:1200}]};
 const v=accountView(acct);
 assert.equal(v.availableCash,7450);assert.equal(v.reservedSales,1200);
 assert.equal(policyAccount(acct).availableSellPositions.find(p=>p.symbol==='AAPL').value,300);
 assert(evaluate('SELL','AAPL',400,acct).reasons.includes('INSUFFICIENT_SELLABLE_HOLDINGS'));
 assert.equal(evaluate('SELL','AAPL',300,acct).allowed,true);
});
test('SELL still requires agent permission, maximum order, human approval, and kill switch',()=>{
 const base={proposal:{symbol:'AAPL',side:'SELL',notionalUsd:500,proposerId:'portfolio-agent'},account:policyAccount(account),
 policy:{version:1,maxPositionPct:20,maxOrderUsd:2500,humanApprovalRequired:true},control:{killSwitch:false},identity:{agentId:'portfolio-agent',enabled:true,allowedActions:['PROPOSE_PAPER_ORDER']}};
 assert(evaluatePolicy({...base,requireApproval:true}).reasons.includes('HUMAN_APPROVAL_REQUIRED'));
 assert(evaluatePolicy({...base,control:{killSwitch:true}}).reasons.includes('GLOBAL_KILL_SWITCH_ACTIVE'));
 assert(evaluatePolicy({...base,identity:{...base.identity,enabled:false}}).reasons.includes('AGENT_NOT_AUTHORIZED'));
 assert(evaluatePolicy({...base,proposal:{...base.proposal,notionalUsd:2600}}).reasons.includes('MAX_ORDER_EXCEEDED'));
});
