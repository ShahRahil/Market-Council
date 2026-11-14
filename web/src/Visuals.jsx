import React from 'react';
import {ArrowRight,Check,Clock3,Database,LockKeyhole,ShieldCheck} from 'lucide-react';
import {signalCounts,handoffCounts,exposureMetrics,outcomeDefinitions,runOutcomeCounts} from './visualMetrics.js';

const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const percentage = value => `${safeNumber(value).toFixed(1)}%`;

const SIGNALS = [
  {key:'BUY',label:'Buy',color:'#13826d'},
  {key:'HOLD',label:'Hold',color:'#e6a23d'},
  {key:'SELL',label:'Sell',color:'#c35c60'},
  {key:'UNAVAILABLE',label:'Unavailable',color:'#a8b3b9'}
];

/** Chart data is exclusively the recommendation documents for the selected Atlas scan. */
export function SignalDistribution({recommendations=[],scan}) {
  const counts=signalCounts(recommendations);
  const total=recommendations.length;
  const circumference=2*Math.PI*48;
  let offset=0;
  const arcs=SIGNALS.map(s=>{
    const length=total?counts[s.key]/total*circumference:0;
    const arc={...s,length,offset}; offset+=length; return arc;
  });
  return <section className="visual-panel signal-distribution" aria-label="Investment signal distribution">
    <div className="visual-head"><div><h3>Signal mix</h3><p>Recommendations saved in this scan</p></div><span className="visual-meta">{scan?.status||'No scan'}</span></div>
    <div className="distribution-body">
      <div className="donut-box">
        <svg viewBox="0 0 132 132" role="img" aria-label={`${counts.BUY} buy, ${counts.HOLD} hold, ${counts.SELL} sell, ${counts.UNAVAILABLE} unavailable`}>
          <circle cx="66" cy="66" r="48" fill="none" stroke="#eef2f3" strokeWidth="16"/>
          {total>0&&arcs.filter(a=>a.length>0).map(a=><circle key={a.key} cx="66" cy="66" r="48" fill="none" stroke={a.color} strokeWidth="16" strokeDasharray={`${Math.max(0,a.length-.8)} ${circumference}`} strokeDashoffset={-a.offset} transform="rotate(-90 66 66)"/>) }
        </svg>
        <div className="donut-center"><strong>{total}</strong><span>reported</span></div>
      </div>
      <div className="signal-legend">{SIGNALS.map(s=><div className="legend-item" key={s.key}><span className="legend-dot" style={{background:s.color}}/><span>{s.label}</span><strong>{counts[s.key]}</strong></div>)}</div>
    </div>
    <p className="visual-foot">{scan?.total!=null?`${total} of ${scan.total} selected securities have a stored result.`:'Start a watchlist scan to see the breakdown.'} Screening scores are not expected returns.</p>
  </section>;
}

const AGENT_STAGES=[
  {id:'market-agent',name:'Market',sub:'Price evidence'},
  {id:'news-agent',name:'News',sub:'Headlines'},
  {id:'quant-agent',name:'Quant',sub:'Screen score'},
  {id:'risk-agent',name:'Risk',sub:'Challenge'},
  {id:'portfolio-agent',name:'Portfolio',sub:'Signal'}
];

/** Each count is calculated from agent_messages retrieved for the selected scan. */
export function AgentHandoffs({messages=[]}) {
  const counts=handoffCounts(messages,AGENT_STAGES.map(a=>a.id));
  return <section className="visual-panel agent-flow-panel" aria-label="Recorded agent handoffs">
    <div className="visual-head"><div><h3>Research handoffs</h3><p>Messages persisted in MongoDB Atlas</p></div><span className="visual-meta"><Database size={13}/> {messages.length} messages</span></div>
    <div className="flow-steps">{AGENT_STAGES.map((a,i)=>{
      const count=counts[a.id];
      return <React.Fragment key={a.id}><div className={`flow-step ${count?'flow-done':''}`}><div className="flow-top"><span className="flow-number">{i+1}</span><span className="flow-counter">{count} sent</span></div><strong>{a.name}</strong><small>{a.sub}</small></div>{i<AGENT_STAGES.length-1&&<ArrowRight className="flow-arrow" size={15} aria-hidden="true"/>}</React.Fragment>;
    })}</div>
    <p className="visual-foot">Counts show actual stored messages per agent, not whether a separate agent process is running.</p>
  </section>;
}

/** Portfolio view is computed from the Atlas-backed paper_accounts state, not a real brokerage. */
export function PortfolioExposure({account,policy}) {
  const {total,limit,positions,scale}=exposureMetrics(account,policy);
  return <section className="visual-panel exposure-panel" aria-label="Paper portfolio exposure chart">
    <div className="visual-head"><div><h3>Exposure by security</h3><p>Holdings and reserved paper purchases</p></div><span className="visual-meta"><ShieldCheck size={14}/> Limit {limit?percentage(limit):'—'}</span></div>
    {positions.length && total>0 ? <div className="exposure-content">
      <div className="exposure-legend"><span><i className="exposure-key held"/> Current holding</span><span><i className="exposure-key reserved"/> Reserved buy</span><span><i className="exposure-key limit"/> Policy limit</span></div>
      {positions.slice(0,8).map(p=><div className="exposure-item" key={p.symbol}>
        <div className="exposure-label"><strong>{p.symbol}</strong><span className={limit&&p.exposure>limit?'over-limit':''}>{percentage(p.exposure)}</span></div>
        <div className="exposure-track" role="img" aria-label={`${p.symbol}: ${percentage(total?p.held/total*100:0)} currently held and ${percentage(total?p.reserved/total*100:0)} reserved purchases; limit ${percentage(limit)}`}>
          <span className="exposure-bar held" style={{width:`${p.held/total*100/scale*100}%`}} title={`Current holding: ${percentage(p.held/total*100)}`}/>
          <span className="exposure-bar reserved" style={{left:`${p.held/total*100/scale*100}%`,width:`${p.reserved/total*100/scale*100}%`}} title={`Reserved purchases: ${percentage(p.reserved/total*100)}`}/>
          {limit>0&&<span className="exposure-limit" style={{left:`${limit/scale*100}%`}}/>}
        </div>
      </div>)}
      <div className="exposure-scale"><span>0%</span><span>Chart scale {percentage(scale)}</span></div>
    </div> : <p className="visual-empty">No paper positions available yet.</p>}
    <p className="visual-foot">Virtual account · USD notional. Accepted paper orders reserve exposure; they are not confirmed fills. Sell reservations are not netted from this conservative chart.</p>
  </section>;
}

const STAGES=[
  {id:'request',label:'Requested',event:'RUN_CREATED'},
  {id:'research',label:'Research',event:'TRADE_PROPOSED'},
  {id:'policy',label:'Policy check',event:'POLICY_CHECK_BEFORE_APPROVAL'},
  {id:'approval',label:'Approved',event:'HUMAN_APPROVED'},
  {id:'final',label:'Final gate',event:'FINAL_POLICY_EVALUATED'},
  {id:'verified',label:'Broker verified',event:'BROKER_ORDER_VERIFIED'}
];

/** No stage is shown as completed unless a corresponding saved audit event exists. */
export function DecisionJourney({detail}) {
  const events=detail?.auditEvents||[];
  const run=detail?.run;
  if(!run)return null;
  const found=new Map(events.map(e=>[e.eventType,e]));
  const blocked=run.status==='DENIED'||run.status==='STOPPED';
  const interrupted=['ERROR','INTERRUPTED','RECONCILE_REQUIRED'].includes(run.status);
  return <div className="journey-box" aria-label="Recorded authorization and execution stages">
    <div className="journey-title"><h3>Decision path</h3><span>{blocked?'Stopped by control':interrupted?'Requires attention':run.status==='COMPLETE'?'Verified paper outcome':'In progress'}</span></div>
    <div className="journey-track">{STAGES.map((s,i)=>{
      const e=found.get(s.event);
      return <div className={`journey-stage ${e?'recorded':'not-reached'}`} key={s.id} title={e?`Evidence saved ${new Date(e.createdAt).toLocaleString()}`:'No completion event stored'}>
        <span className="journey-bubble">{e?<Check size={15}/>:i+1}</span><span className="journey-stage-label">{s.label}</span>
      </div>;
    })}</div>
    <div className="journey-note"><Database size={14}/><span>Green stages have a matching saved Atlas audit event. Gray stages were not verified.</span></div>
    {blocked&&<div className="journey-warning"><LockKeyhole size={15}/>{run.status==='STOPPED'?'Execution stopped before verification.':'Request denied; no verified broker submission.'}</div>}
    {interrupted&&<div className="journey-warning"><Clock3 size={15}/>Inspect the audit timeline for the last confirmed action before retrying.</div>}
  </div>;
}

export function RunOutcomes({runs=[]}) {
 const total=runs.length;
 const counts=runOutcomeCounts(runs);
 return <div className="run-outcomes" aria-label="Breakdown of recent research request statuses">
   <div className="outcomes-heading"><strong>Request outcomes</strong><span>Latest {total} requests loaded</span></div>
   <div className="outcome-meter" role="img" aria-label={outcomeDefinitions.map(o=>`${o.label}: ${counts[o.key]}`).join(', ')}>
     {outcomeDefinitions.map(o=>{const count=counts[o.key];return count>0?<span key={o.key} style={{background:o.color,width:`${100*count/Math.max(1,total)}%`}} title={`${o.label}: ${count}`}/>:null;})}
   </div>
   <div className="outcome-legend">{outcomeDefinitions.map(o=><span key={o.key}><i style={{background:o.color}}/>{o.label} <b>{counts[o.key]}</b></span>)}</div>
 </div>;
}

export function PermissionsOverview({identities=[]}) {
 return <section className="visual-panel permissions-overview" aria-label="Agent authority matrix">
   <div className="visual-head"><div><h3>Authority at a glance</h3><p>Permissions read from MongoDB Atlas</p></div><span className="visual-meta">{identities.length} identities</span></div>
   <div className="authority-scroll"><table className="authority-table"><thead><tr><th>Agent</th><th>Enabled</th><th>Propose</th><th>Execute</th></tr></thead><tbody>{identities.map(a=><tr key={a.agentId}><td><strong>{a.role}</strong><small>{a.agentId}</small></td><td><span className={`matrix-badge ${a.enabled?'yes':'no'}`}>{a.enabled?'Yes':'No'}</span></td><td><span className={`matrix-badge ${a.enabled&&a.allowedActions?.includes('PROPOSE_PAPER_ORDER')?'yes':'no'}`}>{a.enabled&&a.allowedActions?.includes('PROPOSE_PAPER_ORDER')?'Allowed':'—'}</span></td><td><span className={`matrix-badge ${a.enabled&&a.allowedActions?.includes('EXECUTE_AUTHORIZED_PAPER_ORDER')?'yes':'no'}`}>{a.enabled&&a.allowedActions?.includes('EXECUTE_AUTHORIZED_PAPER_ORDER')?'Allowed':'—'}</span></td></tr>)}</tbody></table></div>
   <p className="visual-foot">This overview is read-only. Edit and save each agent's permissions in the controls below; changes are audited.</p>
 </section>;
}
