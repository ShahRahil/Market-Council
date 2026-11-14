import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/policy.js';
const portfolio={accountId:'PAPER-001',totalValue:10000,cash:7450,positions:[{symbol:'AAPL',value:1500},{symbol:'MSFT',value:700},{symbol:'NVDA',value:350}]};
const base={
  account:portfolio,
  policy:{version:1,maxOrderUsd:2500,maxPositionPct:20,humanApprovalRequired:true},
  control:{killSwitch:false},
  identity:{agentId:'portfolio-agent',enabled:true,allowedActions:['PROPOSE_PAPER_ORDER']}
};
const proposal={symbol:'AAPL',side:'BUY',notionalUsd:400,proposerId:'portfolio-agent'};
function evalWith(o={}) {return evaluatePolicy({...base,proposal,...o});}
test('allows within position cap before final approval gate',()=>assert.equal(evalWith().allowed,true));
test('blocks concentration BEFORE any broker request',()=>assert.ok(evalWith({proposal:{...proposal,notionalUsd:1750}}).reasons.includes('POSITION_CONCENTRATION_LIMIT')));
test('blocks globally revoked trading permissions',()=>assert.ok(evalWith({control:{killSwitch:true}}).reasons.includes('GLOBAL_KILL_SWITCH_ACTIVE')));
test('blocks an unauthorized agent even if its idea looks good',()=>assert.ok(evalWith({identity:{agentId:'news-agent',enabled:true,allowedActions:[]},proposal:{...proposal,proposerId:'news-agent'}}).reasons.includes('AGENT_NOT_AUTHORIZED')));
test('binds action to proposer identity',()=>assert.ok(evalWith({proposal:{...proposal,proposerId:'different-agent'}}).reasons.includes('ACTOR_MISMATCH')));
test('requires explicit human approval at final gate',()=>assert.ok(evalWith({requireApproval:true,approved:false}).reasons.includes('HUMAN_APPROVAL_REQUIRED')));
test('allows the same authorized order after approval',()=>assert.equal(evalWith({requireApproval:true,approved:true}).allowed,true));
test('enforces maximum order size',()=>assert.ok(evalWith({proposal:{...proposal,notionalUsd:2600}}).reasons.includes('MAX_ORDER_EXCEEDED')));
test('enforces cash availability',()=>assert.ok(evalWith({proposal:{...proposal,notionalUsd:8000}}).reasons.includes('INSUFFICIENT_CASH')));
test('fails closed when policy is missing',()=>assert.ok(evalWith({policy:null}).reasons.includes('POLICY_UNAVAILABLE')));
test('rejects invalid order details',()=>assert.ok(evalWith({proposal:{...proposal,side:'SELL',symbol:'bad',notionalUsd:-1}}).reasons.includes('INVALID_ORDER')));
test('does not confuse order approval with trade execution',()=>assert.equal(evalWith({requireApproval:true,approved:true}).executionMode,'SIMULATED_PAPER_ONLY'));
