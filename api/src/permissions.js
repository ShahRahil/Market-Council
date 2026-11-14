const proposer='PROPOSE_PAPER_ORDER';
const executor='EXECUTE_AUTHORIZED_PAPER_ORDER';
export function validatePermissions(agentId,payload){
 const {enabled,allowedActions}=payload||{};
 if(typeof enabled!=='boolean'||!Array.isArray(allowedActions)||allowedActions.length>2||
   allowedActions.some(a=>![proposer,executor].includes(a))||new Set(allowedActions).size!==allowedActions.length)
   throw Object.assign(new Error('Select a valid enabled state and allowed actions.'),{statusCode:400});
 if(agentId!=='execution-gateway'&&allowedActions.includes(executor))
   throw Object.assign(new Error('Only the execution gateway may execute approved paper orders.'),{statusCode:400});
 if(agentId==='execution-gateway'&&allowedActions.includes(proposer))
   throw Object.assign(new Error('Execution gateway cannot propose an order.'),{statusCode:400});
 return {enabled,allowedActions};
}
