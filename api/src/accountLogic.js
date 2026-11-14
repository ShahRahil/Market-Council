export function accountView(a){
 const reservations=a.reservations||[];
 const reservedTotal=reservations.filter(r=>r.side!=='SELL').reduce((s,r)=>s+r.notionalUsd,0);
 const reservedSales=reservations.filter(r=>r.side==='SELL').reduce((s,r)=>s+r.notionalUsd,0);
 return {accountId:a.accountId,currency:a.currency,totalValue:a.totalValue,cash:a.cash,availableCash:Math.max(0,a.cash-reservedTotal),
   positions:a.positions,reservations,reservedTotal,reservedSales,version:a.version};
}
export function policyAccount(a){
 const v=accountView(a);
 const pos=new Map(v.positions.map(p=>[p.symbol,p.value]));
 for(const r of v.reservations.filter(r=>r.side!=='SELL')) pos.set(r.symbol,(pos.get(r.symbol)||0)+r.notionalUsd);
 const sales=new Map(v.positions.map(p=>[p.symbol,p.value]));
 for(const r of v.reservations.filter(r=>r.side==='SELL')) sales.set(r.symbol,(sales.get(r.symbol)||0)-r.notionalUsd);
 return {totalValue:v.totalValue,cash:v.availableCash,positions:[...pos].map(([symbol,value])=>({symbol,value})),
   availableSellPositions:[...sales].map(([symbol,value])=>({symbol,value}))};
}
