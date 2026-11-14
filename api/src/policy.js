/** Deterministic Atlas-backed policy; no AI approval. Paper BUY and SELL only. */
export function evaluatePolicy({proposal,account,policy,control,identity,requireApproval=false,approved=false}) {
  const reasons=[];
  const side=proposal.side;
  const base=Number(account.positions.find(p=>p.symbol===proposal.symbol)?.value||0);
  const sellAvailable=Number(account.availableSellPositions?.find(p=>p.symbol===proposal.symbol)?.value??base);
  const postValue=side==='SELL'?base-proposal.notionalUsd:base+proposal.notionalUsd;
  const pct=Number((100*postValue/account.totalValue).toFixed(2));
  if(!policy || !control) reasons.push('POLICY_UNAVAILABLE');
  if(control?.killSwitch) reasons.push('GLOBAL_KILL_SWITCH_ACTIVE');
  if(!identity?.enabled || !identity?.allowedActions?.includes('PROPOSE_PAPER_ORDER')) reasons.push('AGENT_NOT_AUTHORIZED');
  if(proposal.proposerId!==identity?.agentId) reasons.push('ACTOR_MISMATCH');
  if(!Number.isFinite(proposal.notionalUsd) || proposal.notionalUsd<=0 || !['BUY','SELL'].includes(side) ||
    !/^[A-Z]{1,6}(\.[A-Z]{2})?$/.test(proposal.symbol)) reasons.push('INVALID_ORDER');
  if(policy && proposal.notionalUsd>policy.maxOrderUsd) reasons.push('MAX_ORDER_EXCEEDED');
  if(side==='BUY') {
    if(proposal.notionalUsd>account.cash) reasons.push('INSUFFICIENT_CASH');
    if(policy && pct>policy.maxPositionPct+1e-8) reasons.push('POSITION_CONCENTRATION_LIMIT');
  }
  if(side==='SELL' && proposal.notionalUsd>sellAvailable+1e-8) reasons.push('INSUFFICIENT_SELLABLE_HOLDINGS');
  if(requireApproval && policy?.humanApprovalRequired && !approved) reasons.push('HUMAN_APPROVAL_REQUIRED');
  return {allowed:reasons.length===0,reasons,evaluatedPositionPct:pct,maxPositionPct:policy?.maxPositionPct??null,
    policyVersion:policy?.version??null,side,executionMode:'SIMULATED_PAPER_ONLY'};
}
