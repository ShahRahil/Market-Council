import React, {useCallback,useEffect,useMemo,useState} from 'react';
import {SignalDistribution,AgentHandoffs} from './Visuals.jsx';
import {ArrowRight,Check,ChevronDown,ChevronRight,Clock3,ExternalLink,FileCheck2,Info,LoaderCircle,RefreshCcw,Search,ShieldCheck,TrendingDown,TrendingUp} from 'lucide-react';
const starter=['AAPL','MSFT','NVDA','JPM','QQQ','SPY'];
const currency=(n,c='USD')=>Number.isFinite(Number(n))?new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(n)):'—';
const pct=n=>Number.isFinite(Number(n))?`${n>0?'+':''}${Number(n).toFixed(2)}%`:'—';
const date=s=>s?new Date(s).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
async function request(token,url,method='GET',data){
 const res=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 const out=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(out.error||`HTTP ${res.status}`);
 return out;
}
const styles={BUY:'buy',SELL:'sell',HOLD:'hold',UNAVAILABLE:'unavailable'};
function Signal({value}){return <span className={`signal-badge signal-${styles[value]||'hold'}`}>{value||'—'}</span>}
function SectionTitle({children,subtitle}){return <div className="signals-section-title"><h2>{children}</h2>{subtitle&&<p>{subtitle}</p>}</div>}
export default function SignalsPage({token,universe,account,onReview}){
 const [chosen,setChosen]=useState(starter);
 const [search,setSearch]=useState('');
 const [scans,setScans]=useState([]);
 const [scanId,setScanId]=useState(null);
 const [detail,setDetail]=useState(null);
 const [selected,setSelected]=useState(null);
 const [filter,setFilter]=useState('ALL');
 const [amount,setAmount]=useState('200');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [working,setWorking]=useState(false);
 const loadScans=useCallback(async()=>{
  try {const all=await request(token,'/api/recommendations/scans');setScans(all);setScanId(old=>old||all[0]?.id||null);}
  catch(e){setError(e.message)}
 },[token]);
 useEffect(()=>{loadScans();const timer=setInterval(loadScans,7000);return()=>clearInterval(timer)},[loadScans]);
 useEffect(()=>{if(!scanId){setDetail(null);return;}let alive=true;
  const update=()=>request(token,`/api/recommendations/scans/${scanId}`).then(d=>{if(alive)setDetail(d)}).catch(e=>{if(alive)setError(e.message)});
  update();const timer=setInterval(update,2500);return()=>{alive=false;clearInterval(timer)};
 },[token,scanId]);
 const recommendations=detail?.recommendations||[];
 const counts=useMemo(()=>Object.fromEntries(['BUY','HOLD','SELL','UNAVAILABLE'].map(k=>[k,recommendations.filter(r=>r.signal===k).length])),[recommendations]);
 useEffect(()=>{
  if(!recommendations.length)return;
  if(!selected || !recommendations.some(r=>r.id===selected))setSelected(recommendations.find(r=>r.signal!=='UNAVAILABLE')?.id||recommendations[0].id);
 },[recommendations,selected]);
 const rec=recommendations.find(x=>x.id===selected);
 const messages=(detail?.messages||[]).filter(m=>m.body?.symbol===rec?.symbol);
 const filteredItems=universe.filter(s=>(`${s.symbol} ${s.name}`).toLowerCase().includes(search.toLowerCase()));
 const shown=recommendations.filter(r=>filter==='ALL'||r.signal===filter).sort((a,b)=>(b.score??-1)-(a.score??-1));
 const toggle=s=>setChosen(old=>old.includes(s)?old.filter(x=>x!==s):old.length<10?[...old,s]:old);
 const start=async()=>{setError('');setMessage('');setWorking(true);
  try{const res=await request(token,'/api/recommendations/scans','POST',{symbols:chosen});setScanId(res.id);setDetail(null);setSelected(null);setFilter('ALL');setMessage('Scan started. Results will appear as each stock is analyzed.');await loadScans();}
  catch(e){setError(e.message)}finally{setWorking(false)};
 };
 const createReview=async()=>{if(!rec)return;setError('');setMessage('');setWorking(true);
  try{const result=await request(token,`/api/recommendations/${rec.id}/create-review`,'POST',{notionalUsd:Number(amount)});onReview(result.id);}
  catch(e){setError(e.message)}finally{setWorking(false)};
 };
 const selectRec=id=>{const next=recommendations.find(r=>r.id===id);setSelected(id);setAmount(String(next?.signal==='SELL'?Math.min(200,next.heldUsd||0):200));};
 return <div className="recommendations-page">
   <div className="page-heading signals-heading"><div><span className="overline">MULTI-STOCK RESEARCH</span><h1>Investment signals</h1><p>Ask your agents to review a watchlist. Every observation, score and handoff is saved to Atlas.</p></div><span className="signals-disclaimer"><Info size={16}/> Research signals, not investment advice</span></div>
   {error&&<div className="notice error"><Info size={16}/><span>{error}</span><button onClick={()=>setError('')}>Dismiss</button></div>}
   {message&&<div className="notice success"><Check size={16}/><span>{message}</span><button onClick={()=>setMessage('')}>Dismiss</button></div>}
   <section className="panel scan-panel"><div className="scan-top"><div><SectionTitle subtitle="Choose 2–10 securities. Each scan uses source-labelled quotes and available company headlines.">Watchlist</SectionTitle><span className="picked-count">{chosen.length}/10 selected</span></div><button className="primary" disabled={working||chosen.length<2} onClick={start}>{working?<LoaderCircle size={16} className="spin"/>:<RefreshCcw size={16}/>} {working?'Starting…':'Analyze watchlist'}</button></div>
    <div className="watchlist-toolbar"><div className="search watchlist-search"><Search size={16}/><input aria-label="Filter securities" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search stocks and ETFs"/></div><button className="text-link" onClick={()=>setChosen(starter)}>Reset to starter list</button></div>
    <div className="stock-picker">{filteredItems.map(s=><label className={`stock-chip ${chosen.includes(s.symbol)?'checked':''}`} key={s.symbol}><input type="checkbox" checked={chosen.includes(s.symbol)} onChange={()=>toggle(s.symbol)} disabled={!chosen.includes(s.symbol)&&chosen.length>=10}/><strong>{s.symbol}</strong><small>{s.market==='Canada'?'CA':s.type==='ETF'?'ETF':'US'}</small></label>)}</div>
    <div className="signal-help"><Info size={15}/> Data requests are sequential to help stay within Finnhub quotas. Some exchanges may not be covered by your API plan. Results with unavailable data are labelled, not fabricated.</div>
   </section>
   <section className="panel signals-results"><div className="scan-top"><SectionTitle subtitle="Click any security to inspect the evidence, agent messages and available actions.">Latest research</SectionTitle><div className="select-scan"><label htmlFor="scan-history">Scan</label><select id="scan-history" value={scanId||''} onChange={e=>{setScanId(e.target.value);setDetail(null);setSelected(null);setFilter('ALL')}}><option value="" disabled>No scan yet</option>{scans.map(s=><option key={s.id} value={s.id}>{date(s.createdAt)} · {s.status} · {s.symbols.length} symbols</option>)}</select></div></div>
    {!detail?<div className="scan-placeholder"><Clock3 size={23}/><p>{scanId?'Loading saved scan…':'Choose stocks and click Analyze watchlist to begin.'}</p></div>:<>
     <div className="scan-progress"><div><strong>{detail.scan.status==='RUNNING'?'Research in progress':detail.scan.status==='QUEUED'?'Queued':detail.scan.status==='COMPLETE'?'Research completed':detail.scan.status==='PARTIAL'?'Completed with data gaps':'Scan status: '+detail.scan.status}</strong><span>{detail.scan.processed}/{detail.scan.total} stocks analyzed · {detail.scan.failures} unavailable</span></div><span className="scan-origin">{detail.scan.dataMode==='FINNHUB'?'FINNHUB FEED':'SYNTHETIC SAMPLE'}</span></div>
     <div className="scan-meter"><span style={{width:`${100*detail.scan.processed/Math.max(1,detail.scan.total)}%`}}/></div>
     <div className="visual-grid signal-summary-grid"><SignalDistribution recommendations={recommendations} scan={detail.scan}/><AgentHandoffs messages={detail.messages||[]}/></div>
     <div className="signal-filter-row">{['ALL','BUY','HOLD','SELL','UNAVAILABLE'].map(x=><button key={x} className={filter===x?'chosen':''} onClick={()=>setFilter(x)}>{x==='ALL'?'All':x==='UNAVAILABLE'?'Unavailable':x} <span>{x==='ALL'?recommendations.length:counts[x]||0}</span></button>)}</div>
     <div className="signal-workspace"><div className="signal-list">{shown.map(r=><button className={`signal-list-row ${rec?.id===r.id?'selected':''}`} key={r.id} onClick={()=>selectRec(r.id)}><div><strong>{r.symbol}</strong><small>{r.security?.name||'Quote unavailable'}</small></div><div className="signal-measures"><Signal value={r.signal}/>{r.score!=null&&<small>Screen {r.score}/100</small>}</div><ChevronRight size={16}/></button>)}{!shown.length&&<div className="scan-placeholder"><p>{detail.scan.status==='RUNNING'?'Researching…':'No results in this filter.'}</p></div>}</div>
      <div className="signal-inspector">{rec?<>
       <div className="inspector-heading"><div><h2>{rec.security?.name||rec.symbol}</h2><span>{rec.symbol} · {rec.security?.type||'Security'} · {rec.security?.market||'Market data unavailable'}</span></div><Signal value={rec.signal}/></div>
       {rec.signal==='UNAVAILABLE'?<div className="signal-warning">{rec.error||'Market data unavailable. No recommendation generated.'}</div>:<>
        <div className="signal-highlights"><div><small>Screen score</small><strong>{rec.score}<em>/100</em></strong></div><div><small>Latest quote</small><strong>{currency(rec.quote?.price,rec.security?.currency)}</strong></div><div><small>Day change</small><strong className={rec.signals?.dayChangePct<0?'red':'green'}>{pct(rec.signals?.dayChangePct)}</strong></div></div>
        <p className="signal-source">{rec.quote?.source==='FINNHUB'?'Finnhub market data':'Synthetic sample prices'} · {rec.quote?.asOf?`Trade ${date(rec.quote.asOf)}`:'Quote timestamp unavailable'} · Evidence: {rec.dataGrade}</p>
        <div className="inspector-block"><h3>Why this signal?</h3><ul>{rec.explanations?.map((s,i)=><li key={i}>{s}</li>)}</ul></div>
        <div className="inspector-block"><h3>Company news</h3>{rec.articles?.length?<div className="signal-articles">{rec.articles.slice(0,4).map((n,i)=><div key={`${i}-${n.title}`}><span>{n.publisher} · {date(n.publishedDate)}</span>{n.url?<a href={n.url} rel="noopener noreferrer" target="_blank">{n.title} <ExternalLink size={13}/></a>:<strong>{n.title}</strong>}</div>)}</div>:<p className="muted-text">{rec.newsNote||'No company news available for this scan.'}</p>}</div>
        <details className="signal-evidence"><summary>Agent collaboration and evidence ({messages.length} handoffs)</summary><div className="agent-handoffs">{messages.map((m,i)=><div key={m._id||i}><strong>{m.from} → {m.to}</strong><span>{m.kind} · {date(m.createdAt)}</span><pre>{JSON.stringify(m.body,null,2)}</pre></div>)}</div></details>
        <div className="signal-warning"><Info size={16}/><div>{rec.caveats?.join(' ')}</div></div>
        {['BUY','SELL'].includes(rec.signal)?<div className="signal-action"><h3>{rec.signal==='BUY'?'Request paper purchase review':'Request paper sale review'}</h3><p>A signal is not execution permission. The proposal must pass current Atlas identity, portfolio policies and human approval.</p><label htmlFor="signal-amount">Paper order amount (USD)</label><div className="signal-order-row"><div className="amount-input"><span>$</span><input id="signal-amount" type="number" step="0.01" min="1" max={rec.signal==='SELL'?rec.heldUsd:100000} value={amount} onChange={e=>setAmount(e.target.value)}/></div><button className="primary" disabled={working||!(Number(amount)>0)||rec.signal==='SELL'&&Number(amount)>rec.heldUsd} onClick={createReview}>{working?'Creating…':'Create review'} <ArrowRight size={16}/></button></div>{rec.signal==='SELL'&&<small>Paper holding available: {currency(rec.heldUsd)}. The broker accepts paper orders only.</small>}</div>:<div className="signal-hold-box"><ShieldCheck size={17}/><div><strong>No order suggested</strong><p>HOLD is informational. Review stronger evidence before acting.</p></div></div>}
       </>}</>:<div className="scan-placeholder"><p>Select a security to view evidence.</p></div>}</div>
     </div>
    </>}
   </section>
   <p className="signals-bottom-note">Method: one-day movement and simple keyword matches in available news. This is a transparent, unvalidated screening rule—not a model of expected returns. No live brokerage connection exists. Only the existing Atlas policy gateway can authorize paper orders.</p>
 </div>;
}
