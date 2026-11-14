// Pure display calculations. No AI scores, market prices or policy decisions are invented here.
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function signalCounts(recommendations=[]) {
  const counts={BUY:0,HOLD:0,SELL:0,UNAVAILABLE:0};
  for(const r of recommendations) if(Object.prototype.hasOwnProperty.call(counts,r.signal)) counts[r.signal]++;
  return counts;
}

export function handoffCounts(messages=[],ids=[]) {
  return Object.fromEntries(ids.map(id=>[id,messages.filter(message=>message.from===id).length]));
}

export function exposureMetrics(account,policy) {
  const total=number(account?.totalValue);
  const limit=number(policy?.maxPositionPct);
  const map=new Map();
  for(const position of account?.positions||[]) {
    const held=number(position.value);
    map.set(position.symbol,{symbol:position.symbol,held,reserved:0});
  }
  for(const reservation of account?.reservations||[]) {
    if(reservation.side==='SELL') continue; // conservative: do not reduce displayed exposure by unsettled sells
    const position=map.get(reservation.symbol)||{symbol:reservation.symbol,held:0,reserved:0};
    position.reserved+=number(reservation.notionalUsd);
    map.set(reservation.symbol,position);
  }
  const positions=[...map.values()].map(p=>({...p,exposure:total>0?100*(p.held+p.reserved)/total:0})).sort((a,b)=>b.exposure-a.exposure);
  const scale=Math.max(30,limit+7,...positions.map(p=>p.exposure*1.12));
  return {total,limit,positions,scale};
}

export const outcomeDefinitions=[
 {key:'complete',label:'Verified',color:'#13826d',matches:['COMPLETE']},
 {key:'denied',label:'Denied',color:'#c35c60',matches:['DENIED']},
 {key:'waiting',label:'Awaiting / pending',color:'#e6a23d',matches:['CREATED','RESEARCHING','WAITING_APPROVAL','PENDING_EXECUTION','GATEWAY_CHECKING','SUBMITTING']},
 {key:'stopped',label:'Stopped',color:'#6885ae',matches:['STOPPED']},
 {key:'other',label:'Attention',color:'#a8b3b9',matches:['ERROR','RECONCILE_REQUIRED','INTERRUPTED']}
];
export function runOutcomeCounts(runs=[]) {
 return Object.fromEntries(outcomeDefinitions.map(o=>[o.key,runs.filter(r=>o.matches.includes(r.status)).length]));
}
