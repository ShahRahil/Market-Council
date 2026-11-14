import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {signalCounts,handoffCounts,exposureMetrics,runOutcomeCounts} from '../src/visualMetrics.js';

test('signal donut counts only saved result states',()=>{
  assert.deepEqual(signalCounts([{signal:'BUY'},{signal:'HOLD'},{signal:'SELL'},{signal:'UNAVAILABLE'},{signal:'BUY'}]),
    {BUY:2,HOLD:1,SELL:1,UNAVAILABLE:1});
});
test('handoff flow counts only actual messages from selected agents',()=>{
  const items=[{from:'market-agent'},{from:'market-agent'},{from:'portfolio-agent'},{from:'orchestrator'}];
  assert.deepEqual(handoffCounts(items,['market-agent','risk-agent','portfolio-agent']),
   {'market-agent':2,'risk-agent':0,'portfolio-agent':1});
});
test('portfolio exposure includes held positions and buy reservations, not unsettled sells',()=>{
 const metrics=exposureMetrics({totalValue:10000,positions:[{symbol:'AAPL',value:1500}],reservations:[
  {symbol:'AAPL',side:'BUY',notionalUsd:400},{symbol:'MSFT',side:'BUY',notionalUsd:500},{symbol:'AAPL',side:'SELL',notionalUsd:300}
 ]},{maxPositionPct:20});
 assert.equal(metrics.positions[0].symbol,'AAPL');
 assert.equal(metrics.positions[0].held,1500);
 assert.equal(metrics.positions[0].reserved,400);
 assert.equal(metrics.positions[0].exposure,19);
 assert.equal(metrics.positions[1].symbol,'MSFT');
 assert.equal(metrics.positions[1].exposure,5);
 assert.equal(metrics.limit,20);
});
test('empty account produces an empty chart with no synthetic positions',()=>{
 const metrics=exposureMetrics(null,null);
 assert.equal(metrics.total,0);
 assert.equal(metrics.positions.length,0);
});
test('activity outcome bars represent actual returned run statuses',()=>{
 const counts=runOutcomeCounts([{status:'COMPLETE'},{status:'DENIED'},{status:'WAITING_APPROVAL'},{status:'STOPPED'},{status:'RECONCILE_REQUIRED'}]);
 assert.deepEqual(counts,{complete:1,denied:1,waiting:1,stopped:1,other:1});
});
