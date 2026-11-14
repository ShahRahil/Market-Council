import { randomUUID } from 'node:crypto';
import { database } from './db.js';
import {validateRequest} from './securities.js';
import {getAccount,policyAccount,reserve,release} from './account.js';
import { audit, sendMessage } from './audit.js';
import { research } from './agents.js';
import { evaluatePolicy } from './policy.js';
import { config } from './config.js';
import { submitPaperOrder, fetchPaperOrder, cancelPaperOrder } from './brokerClient.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pendingStatuses = ['CREATED','RESEARCHING','WAITING_APPROVAL','PENDING_EXECUTION','GATEWAY_CHECKING'];

function coll(name) { return database().collection(name); }
async function policyInputs(proposal) {
  const [policy, control, identity] = await Promise.all([
    coll('policies').findOne({ _id:'primary' }),
    coll('control').findOne({ _id:'global' }),
    coll('agent_identities').findOne({ agentId: proposal.proposerId })
  ]);
  return { policy, control, identity };
}
async function updateRunIfActive(id, updates) {
  const result = await coll('runs').updateOne(
    { id, status: { $in: pendingStatuses } },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}
async function denyRun(id, decision, stage) {
  const status = decision.reasons.includes('GLOBAL_KILL_SWITCH_ACTIVE') ? 'STOPPED' : 'DENIED';
  const updated = await updateRunIfActive(id, { status, decision, step: stage });
  if (updated) await audit(id, 'POLICY_BLOCK', 'execution-gateway', { stage, decision });
}
export async function startRun(request) {
  const input = validateRequest(request);
  const id = randomUUID();
  await coll('runs').insertOne({
    id, scenario:'custom', input:{symbol:input.security.symbol,side:input.side,notionalUsd:input.notionalUsd,proposerId:input.proposerId,recommendationId:input.recommendationId}, status:'CREATED', step:'RUN_CREATED',
    createdAt:new Date(), updatedAt:new Date(), approved:false, cancelRequested:false
  });
  await audit(id, 'RUN_CREATED', 'operator', { request:{symbol:input.security.symbol,side:input.side,notionalUsd:input.notionalUsd,proposerId:input.proposerId,recommendationId:input.recommendationId},mode:'SIMULATED_PAPER_ONLY' });
  setImmediate(() => processRun(id, input).catch(err => failRun(id, err)));
  return { id };
}
async function failRun(id, err) {
  console.error('Run error', id, err);
  const uncertain = await coll('runs').updateOne({id,status:'SUBMITTING'}, {
    $set: {status:'RECONCILE_REQUIRED',step:'BROKER_VERIFICATION_ERROR',updatedAt:new Date()}
  });
  if (uncertain.modifiedCount) {
    await audit(id,'BROKER_OUTCOME_UNKNOWN','execution-gateway',{error:err.message.slice(0,180)});
    return;
  }
  const disabled = /^Agent ([a-z-]+) is disabled in Atlas\.$/.exec(err.message);
  if(disabled){
    const decision={allowed:false,reasons:['AGENT_DISABLED'],agentId:disabled[1]};
    const changed=await updateRunIfActive(id,{status:'DENIED',step:'AGENT_PERMISSION_DENIED',decision});
    if(changed)await audit(id,'POLICY_BLOCK','orchestrator',{stage:'RESEARCH_AGENT_DISABLED',decision});
    return;
  }
  const changed = await updateRunIfActive(id, { status:'ERROR', step:'WORKFLOW_ERROR', error:'Research or governance service failed' });
  if (changed) await audit(id, 'RUN_ERROR', 'orchestrator', { error:err.message.slice(0,180) });
}
async function processRun(id, input) {
  if (!await updateRunIfActive(id, { status:'RESEARCHING', step:'AGENTS_COLLABORATING' })) return;
  await sendMessage(id, 'orchestrator', 'market-agent', 'START_RESEARCH', {symbol:input.security.symbol,notionalUsd:input.notionalUsd});
  await delay(350);
  const proposal = await research(id, input);
  const latest = await coll('runs').findOne({ id });
  if (latest?.cancelRequested || latest?.status === 'STOPPED') return;
  await audit(id, 'TRADE_PROPOSED', proposal.proposerId, { proposal });
  if (!await updateRunIfActive(id, { proposal, step:'PRE_ACTION_AUTHORIZATION' })) return;
  const inputs = await policyInputs(proposal);
  const decision = evaluatePolicy({ proposal, account:policyAccount(await getAccount()), ...inputs });
  await audit(id, 'POLICY_CHECK_BEFORE_APPROVAL', 'execution-gateway', { decision, proposal });
  if (!decision.allowed) return denyRun(id, decision, 'PREFLIGHT_DENIED');
  if (!await updateRunIfActive(id, { status:'WAITING_APPROVAL', step:'HUMAN_APPROVAL_REQUIRED', decision })) return;
  await audit(id, 'APPROVAL_REQUESTED', 'execution-gateway', { proposedNotionalUsd:proposal.notionalUsd, symbol:proposal.symbol, policyVersion:decision.policyVersion });
}
export async function approveRun(id) {
  const changed = await coll('runs').findOneAndUpdate(
    { id, status:'WAITING_APPROVAL', cancelRequested:false },
    { $set: { status:'PENDING_EXECUTION', step:'APPROVED_WAITING_FOR_FINAL_GATE', approved:true, approvedBy:'operator', approvedAt:new Date(), updatedAt:new Date() } },
    { returnDocument:'after' }
  );
  if (!changed) throw Object.assign(new Error('Run is not awaiting approval or was stopped'), { statusCode:409 });
  await audit(id, 'HUMAN_APPROVED', 'operator', { proposal:changed.proposal, note:'Approval does not bypass final policy gate' });
  setImmediate(() => executeRun(id).catch(err => failRun(id,err)));
  return { id, status:changed.status };
}
export async function executeRun(id) {
  // Deliberate waiting period demonstrates runtime revocation before a tool call.
  await delay(config.executionDelayMs);
  let claimed = await coll('runs').findOneAndUpdate(
    { id, status:'PENDING_EXECUTION', approved:true, cancelRequested:false },
    { $set: { status:'GATEWAY_CHECKING', step:'FINAL_POLICY_GATE', updatedAt:new Date() } },
    { returnDocument:'after' }
  );
  if (!claimed) return;
  const inputs = await policyInputs(claimed.proposal);
  const gatewayIdentity = await coll('agent_identities').findOne({ agentId:'execution-gateway' });
  const decision = evaluatePolicy({ proposal:claimed.proposal, account:policyAccount(await getAccount()), ...inputs, approved:claimed.approved, requireApproval:true });
  if (!gatewayIdentity?.enabled || !gatewayIdentity?.allowedActions?.includes('EXECUTE_AUTHORIZED_PAPER_ORDER')) {
    decision.allowed = false; decision.reasons.push('EXECUTION_GATEWAY_NOT_AUTHORIZED');
  }
  await audit(id, 'FINAL_POLICY_EVALUATED', 'execution-gateway', { decision });
  if (!decision.allowed) return denyRun(id,decision,'EXECUTION_BLOCKED');
  // Atomically reserve notional exposure against the latest portfolio version BEFORE sending a broker request.
  // Concurrent runs cannot both claim the same available cash without one re-evaluating.
  const clientOrderId=`paper-${id}`;
  const reservation=await reserve({clientOrderId,symbol:claimed.proposal.symbol,side:claimed.proposal.side,notionalUsd:claimed.proposal.notionalUsd,
    validate:async account=>{
      const [policy,control,identity,gateway]=await Promise.all([
        coll('policies').findOne({_id:'primary'}),coll('control').findOne({_id:'global'}),
        coll('agent_identities').findOne({agentId:claimed.proposal.proposerId}),coll('agent_identities').findOne({agentId:'execution-gateway'})]);
      const decision=evaluatePolicy({proposal:claimed.proposal,account,policy,control,identity,approved:true,requireApproval:true});
      if(!gateway?.enabled||!gateway?.allowedActions?.includes('EXECUTE_AUTHORIZED_PAPER_ORDER')){
        decision.allowed=false;decision.reasons.push('EXECUTION_GATEWAY_NOT_AUTHORIZED');
      }
      return decision;
    }});
  if(!reservation.reserved)return denyRun(id,reservation.decision,'LAST_MOMENT_REVOKED');
  const rechecked=reservation.decision||decision;
  const moved = await coll('runs').updateOne(
    { id, status:'GATEWAY_CHECKING', cancelRequested:false },
    { $set: { status:'SUBMITTING', step:'BROKER_REQUEST_IN_FLIGHT', updatedAt:new Date() } }
  );
  if (!moved.modifiedCount) {await release(clientOrderId); return;}
  // Authorization proof is persisted before contacting the simulated external broker.
  await audit(id, 'ORDER_AUTHORIZED', 'execution-gateway', {
    decision:rechecked, policyVersion:rechecked.policyVersion, identityId:inputs.identity.agentId, approvedBy:claimed.approvedBy,
    clientOrderId
  });
  const order = { clientOrderId, symbol:claimed.proposal.symbol, side:claimed.proposal.side, notionalUsd:claimed.proposal.notionalUsd, accountId:claimed.proposal.accountId };
  let receipt;
  try {
    await submitPaperOrder(order);
    // Do not count a sent request as a successful order: verify it in the broker's records.
    receipt = await fetchPaperOrder(order.clientOrderId);
  } catch(err) {
    await coll('runs').updateOne({ id, status:'SUBMITTING' }, { $set:{status:'RECONCILE_REQUIRED',step:'BROKER_RECEIPT_UNCERTAIN',updatedAt:new Date()} });
    await audit(id,'BROKER_OUTCOME_UNKNOWN','execution-gateway',{ clientOrderId:order.clientOrderId,error:err.message });
    return;
  }
  if (receipt.clientOrderId !== order.clientOrderId || receipt.symbol !== order.symbol || receipt.side !== order.side ||
      receipt.notionalUsd !== order.notionalUsd || receipt.accountId !== order.accountId ||
      !['ACCEPTED','FILLED'].includes(receipt.status)) {
    throw new Error('Broker verification mismatch');
  }
  await coll('broker_receipts').updateOne({ clientOrderId:order.clientOrderId }, { $set: { ...receipt, runId:id, verifiedAt:new Date() } }, { upsert:true });
  await audit(id, 'BROKER_ORDER_VERIFIED', 'execution-gateway', { receipt, verification:'BROKER_GET_BY_CLIENT_ORDER_ID' });
  await coll('runs').updateOne({ id, status:'SUBMITTING' }, { $set:{ status:'COMPLETE',step:'VERIFIED_PAPER_ORDER',receipt,updatedAt:new Date() } });
}
export async function stopPendingRuns(source='operator') {
  const targets = await coll('runs').find({ status: { $in:pendingStatuses } }).project({id:1,status:1}).toArray();
  if (!targets.length) return 0;
  let stopped = 0;
  for (const target of targets) {
    const changed = await coll('runs').updateOne({ id:target.id, status:{ $in:pendingStatuses } }, {
      $set: {status:'STOPPED',step:'KILL_SWITCH_REVOKED',cancelRequested:true,updatedAt:new Date()}
    });
    if (changed.modifiedCount) {
      stopped++;
      await audit(target.id, 'RUN_STOPPED_BY_KILL_SWITCH', 'execution-gateway', { source, previousStatus:target.status });
    }
  }
  return stopped;
}
export async function setKillSwitch(enabled) {
  const ctl = await coll('control').findOneAndUpdate({ _id:'global' }, {
    $set:{ killSwitch:enabled, updatedAt:new Date() }, $inc:{ revision:1 }
  }, { returnDocument:'after' });
  await audit('system',enabled ? 'KILL_SWITCH_ACTIVATED' : 'KILL_SWITCH_RESET','operator', { revision:ctl.revision });
  if (enabled) await stopPendingRuns('operator');
  return ctl;
}
export async function setPolicy({ maxPositionPct, maxOrderUsd }) {
  if (!Number.isFinite(maxPositionPct) || maxPositionPct < 1 || maxPositionPct > 80 ||
      !Number.isFinite(maxOrderUsd) || maxOrderUsd < 100 || maxOrderUsd > 10000) {
    throw Object.assign(new Error('Policy limits are out of range'), { statusCode:400 });
  }
  const result = await coll('policies').findOneAndUpdate({ _id:'primary' }, {
    $set: { maxPositionPct, maxOrderUsd, updatedAt:new Date() }, $inc: { version:1 }
  }, { returnDocument:'after' });
  await audit('system','POLICY_VERSION_CHANGED','operator', {
    maxPositionPct, maxOrderUsd, version:result.version
  });
  return result;
}
export async function cancelVerifiedOrder(id) {
  const run = await coll('runs').findOne({ id });
  if (!run?.receipt) throw Object.assign(new Error('No verified order for this run'),{statusCode:409});
  const clientOrderId = run.receipt.clientOrderId;
  const result = await cancelPaperOrder(clientOrderId);
  const verified = await fetchPaperOrder(clientOrderId);
  await coll('broker_receipts').updateOne({ clientOrderId },{ $set:{...verified,runId:id,verifiedAt:new Date()} },{upsert:true});
  if(verified.status==='CANCELLED') await release(clientOrderId);
  await audit(id,'PAPER_ORDER_CANCELLATION_VERIFIED','operator',{ result,verified });
  await coll('runs').updateOne({id},{$set:{receipt:verified,step:'PAPER_ORDER_CANCELLED',updatedAt:new Date()}});
  return verified;
}
export async function reconcileRun(id) {
  const run = await coll('runs').findOne({id,status:'RECONCILE_REQUIRED'});
  if (!run) throw Object.assign(new Error('Run does not require reconciliation'),{statusCode:409});
  const clientOrderId=`paper-${id}`;
  try {
    const receipt=await fetchPaperOrder(clientOrderId);
    if (receipt.clientOrderId !== clientOrderId || receipt.symbol !== run.proposal.symbol ||
        receipt.notionalUsd !== run.proposal.notionalUsd || receipt.side !== run.proposal.side || receipt.accountId !== run.proposal.accountId ||
        !['ACCEPTED','FILLED','CANCELLED'].includes(receipt.status)) throw new Error('Broker receipt does not match request');
    await coll('broker_receipts').updateOne({clientOrderId},{$set:{...receipt,runId:id,verifiedAt:new Date()}},{upsert:true});
    if(receipt.status==='CANCELLED')await release(clientOrderId);
    await audit(id,'BROKER_RECONCILIATION_VERIFIED','execution-gateway',{receipt});
    await coll('runs').updateOne({id,status:'RECONCILE_REQUIRED'},{$set:{status:'COMPLETE',step:'VERIFIED_PAPER_ORDER',receipt,updatedAt:new Date()}});
    return receipt;
  } catch {
    await audit(id,'BROKER_RECONCILIATION_INCONCLUSIVE','execution-gateway',{clientOrderId});
    return {clientOrderId,status:'UNVERIFIED',message:'No new order was submitted. Investigate broker before retry.'};
  }
}
export async function markInterruptedRuns() {
  // On restart, fail closed rather than silently replaying a paper order.
  const active=await coll('runs').find({status:{$in:['CREATED','RESEARCHING','PENDING_EXECUTION','GATEWAY_CHECKING','SUBMITTING']}}).project({id:1,status:1}).toArray();
  for(const run of active) {
    const status = run.status === 'SUBMITTING' ? 'RECONCILE_REQUIRED' : 'INTERRUPTED';
    await coll('runs').updateOne({id:run.id,status:run.status},{$set:{status,step:'RESTART_FAIL_CLOSED',updatedAt:new Date()}});
    await audit(run.id,'RESTART_INTERRUPTED','orchestrator',{previousStatus:run.status,status,note:'No automatic order replay'});
  }
}
