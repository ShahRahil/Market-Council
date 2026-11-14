import {database} from './db.js';
const coll=()=>database().collection('paper_accounts');
export async function getAccount(){return coll().findOne({_id:'primary'});}
import {accountView,policyAccount} from './accountLogic.js';
export {accountView,policyAccount} from './accountLogic.js';
// Reserve exposure before crossing an external broker boundary, using versioned compare-and-swap.
// Reservation reflects a pending accepted order, NOT a filled trade or settled position.
export async function reserve({clientOrderId,symbol,side='BUY',notionalUsd,validate}){
 for(let attempt=0;attempt<5;attempt++){
   const doc=await getAccount();
   if(!doc) throw new Error('Paper account unavailable');
   if(doc.reservations?.some(r=>r.clientOrderId===clientOrderId)) return {reserved:true,alreadyReserved:true};
   const result=await validate(policyAccount(doc));
   if(!result.allowed) return {reserved:false,decision:result};
   const updated=await coll().updateOne({_id:'primary',version:doc.version,'reservations.clientOrderId':{$ne:clientOrderId}},
     {$push:{reservations:{clientOrderId,symbol,side,notionalUsd,createdAt:new Date()}},$inc:{version:1}});
   if(updated.modifiedCount) return {reserved:true,decision:result};
 }
 throw Object.assign(new Error('Portfolio changed concurrently; retry the review'),{statusCode:409});
}
export async function release(clientOrderId){
 const r=await coll().updateOne({_id:'primary','reservations.clientOrderId':clientOrderId},
   {$pull:{reservations:{clientOrderId}},$inc:{version:1}});
 return r.modifiedCount>0;
}
