'use strict';
const {supa}=require('./core');
async function postBankAllocation(workspace,body,amountForTenant,refresh){
 const txId=String(body.transaction_id||''),tenantId=String(body.tenant_id||''),scope=encodeURIComponent(workspace);
 if(!txId)throw Error('Bank transaction is required.');
 const tx=(await supa(`bank_transactions?id=eq.${encodeURIComponent(txId)}&workspace_id=eq.${scope}&select=*`))?.[0];
 if(!tx)throw Error('Bank transaction not found.');
 if(tx.match_status==='matched')return {ok:true,already_posted:true};
 const total=Math.round(Number(tx.amount||0)*100);if(!Number.isSafeInteger(total)||total<=0)throw Error('Only incoming payments can be allocated.');
 const requested=body.allocations===undefined?[{payment_id:body.payment_id,amount:total/100}]:body.allocations;
 if(!Array.isArray(requested)||!requested.length||requested.length>2)throw Error('Choose one or two monthly accounts.');
 const cents=requested.map(a=>Math.round(Number(a.amount)*100));if(cents.some(n=>!Number.isSafeInteger(n)||n<=0)||cents.reduce((a,n)=>a+n,0)!==total)throw Error('Allocation amounts must equal the bank payment.');
 let resolvedTenant=tenantId;const plans=[];
 // Validate every account and tenant before creating accounts or payment entries.
 for(let i=0;i<requested.length;i++){
  const a=requested[i];let p;
  if(a.payment_id){p=(await supa(`payments?id=eq.${encodeURIComponent(a.payment_id)}&workspace_id=eq.${scope}&select=*`))?.[0];if(!p)throw Error('Monthly account not found.');}
  else{const year=Number(a.year),month=Number(a.month),now=new Date();if(!resolvedTenant||year!==now.getUTCFullYear()||month!==now.getUTCMonth()+1)throw Error('Only the current monthly account can be created.');p=(await supa(`payments?tenant_id=eq.${encodeURIComponent(resolvedTenant)}&workspace_id=eq.${scope}&year=eq.${year}&month=eq.${month}&select=*`))?.[0]||{tenant_id:resolvedTenant,year,month};}
  if(!resolvedTenant)resolvedTenant=String(p.tenant_id);if(String(p.tenant_id)!==resolvedTenant)throw Error('Tenant and monthly account do not match.');plans.push({p,amount:cents[i]/100});
 }
 const keys=plans.map(({p})=>p.id?'id:'+p.id:'month:'+p.year+'-'+p.month);if(new Set(keys).size!==keys.length)throw Error('Choose different monthly accounts for a split.');
 const tenant=(await supa(`tenants?id=eq.${encodeURIComponent(resolvedTenant)}&workspace_id=eq.${scope}&select=*`))?.[0];if(!tenant)throw Error('Tenant not found.');
 const marker=`Bank transaction #${txId} · `;
 const prior=await supa(`payment_entries?workspace_id=eq.${scope}&notes=like.${encodeURIComponent(marker+'*')}&select=*`);
 let entries=prior||[];
 if(entries.length){if(Math.round(entries.reduce((n,e)=>n+Number(e.amount||0),0)*100)!==total)throw Error('This bank payment has an incomplete allocation. Please review its entries.');}
 else{
  for(const plan of plans){if(plan.p.id)continue;const payload={workspace_id:workspace,tenant_id:tenant.id,year:plan.p.year,month:plan.p.month,expected_amount:amountForTenant(tenant),paid_amount:0,status:'pending'};
   try{plan.p=(await supa('payments',{method:'POST',body:JSON.stringify(payload)}))?.[0];}catch(e){const found=(await supa(`payments?tenant_id=eq.${encodeURIComponent(tenant.id)}&workspace_id=eq.${scope}&year=eq.${payload.year}&month=eq.${payload.month}&select=*`))?.[0];if(!found)throw e;plan.p=found;}if(!plan.p?.id)throw Error('Current monthly account could not be created.');
  }
  const payload=plans.map(({p,amount})=>({workspace_id:workspace,payment_id:p.id,amount,payment_date:tx.booking_date||new Date().toISOString().slice(0,10),method:'bank',reference:tx.remittance_information||tx.external_transaction_id||'',notes:marker+`${tx.counterparty_name||''} · ${tx.counterparty_iban||''}`}));
  entries=await supa('payment_entries',{method:'POST',body:JSON.stringify(payload)});if(!Array.isArray(entries)||entries.length!==plans.length)throw Error('Payment allocation was not confirmed.');
 }
 for(const id of new Set(entries.map(e=>e.payment_id)))await refresh(workspace,id);
 await supa(`bank_transactions?id=eq.${encodeURIComponent(tx.id)}&workspace_id=eq.${scope}`,{method:'PATCH',body:JSON.stringify({match_status:'matched',matched_tenant_id:tenant.id,matched_payment_id:entries[0].payment_id,matched_at:new Date().toISOString()})});
 return {ok:true,entries};
}
module.exports={postBankAllocation};
