'use strict';
const handlers = {};

handlers["account"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {supa,ownedAccount,requireBankPermission}=require('../lib/core');module.exports=async(req,res)=>{try{if(req.method!=='POST')return res.status(405).json({error:'POST required'});const id=String(req.query.account_id||'');if(!/^\d+$/.test(id))return res.status(400).json({error:'Invalid account'});const perm=await requireBankPermission(req);const {workspaceId}=await ownedAccount(req,id);if(String(perm.workspaceId)!==String(workspaceId))throw new Error('Bank account is outside this workspace.');const body=req.body||{},patch={};if(Object.prototype.hasOwnProperty.call(body,'active'))patch.active=Boolean(body.active);if(Object.prototype.hasOwnProperty.call(body,'owner_bank_account_id')){const oid=body.owner_bank_account_id==null?null:Number(body.owner_bank_account_id);if(oid){const x=(await supa(`owner_bank_accounts?id=eq.${oid}&workspace_id=eq.${workspaceId}&select=id`))?.[0];if(!x)throw new Error('Owner IBAN is outside this workspace')}patch.owner_bank_account_id=oid}if(!Object.keys(patch).length)return res.status(400).json({error:'Nothing to update'});await supa(`bank_accounts?id=eq.${id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify(patch)});res.status(200).json({ok:true,...patch})}catch(e){res.status(400).json({error:e.message})}}

return module.exports; })();

handlers["aspsps"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {eb,requireBankPermission}=require('../lib/core');module.exports=async(req,res)=>{try{await requireBankPermission(req);const country=String(req.query.country||'BE').toUpperCase(),psu=String(req.query.psu_type||'business');const d=await eb(`/aspsps?country=${encodeURIComponent(country)}&psu_type=${encodeURIComponent(psu)}`);res.status(200).json(d)}catch(e){res.status(401).json({error:e.message})}}

return module.exports; })();

handlers["callback"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {eb,supa,verifyState,workspaceBankAutoEnabled}=require('../lib/core');
function firstIban(d){if(!d||typeof d!=='object')return'';if(typeof d.iban==='string')return d.iban;if(d.account_id&&typeof d.account_id.iban==='string')return d.account_id.iban;const ids=d.identifications||d.account_identifications||[],hit=ids.find(x=>String(x?.scheme_name||x?.schemeName||x?.scheme||'').toLowerCase()==='iban');return hit?.identification||hit?.value||''}
function accountName(d){return d?.name||d?.product||d?.details||d?.display_name||'Account'}
function accountUid(x){if(!x||typeof x!=='object')return'';const a=x.account_id,b=x.accountId;return x.uid||(typeof a==='string'?a:a?.uid||a?.id)||(typeof b==='string'?b:b?.uid||b?.id)||x.id||''}
function mergeAccountMeta(session){const all=[];for(const src of [session?.accounts_data,session?.accounts]){for(const x of Array.isArray(src)?src:[]){const item=typeof x==='string'?{uid:x}:{...x};const uid=accountUid(item);if(!uid)continue;const prev=all.find(a=>String(accountUid(a))===String(uid));if(prev)Object.assign(prev,item);else all.push(item)}}return all}
function balanceFrom(d){const list=d?.balances||[];const rank={ITAV:1,CLAV:2,ITBD:3,CLBD:4,OPBD:5};const b=[...list].sort((a,z)=>(rank[String(a?.balance_type||'').toUpperCase()]||99)-(rank[String(z?.balance_type||'').toUpperCase()]||99))[0];if(!b)return null;const box=b.balance_amount||b.balanceAmount||b.amount||{};const raw=typeof box==='object'?(box.amount??box.value):box;const n=Number(raw);return Number.isFinite(n)?{amount:n,currency:(typeof box==='object'?(box.currency||box.currency_code):null)||b.currency||null,type:String(b.balance_type||'').toUpperCase()}:null}
module.exports=async(req,res)=>{const base=process.env.BANK_APP_URL||`https://${req.headers.host}`;try{const code=String(req.query.code||''),st=verifyState(req.query.state);if(!code||!st)throw new Error('Invalid bank callback');if(!(await workspaceBankAutoEnabled(st.workspaceId)))throw new Error('Bank connections are not enabled for this account');const c=(await supa(`bank_connections?id=eq.${st.id}&workspace_id=eq.${st.workspaceId}&select=*`))?.[0];if(!c)throw new Error('Connection no longer exists');const session=await eb('/sessions',{method:'POST',body:JSON.stringify({code})}),sessionId=session.session_id||session.sessionId;if(!sessionId)throw new Error('Enable Banking did not return a session ID');await supa(`bank_connections?id=eq.${st.id}&workspace_id=eq.${st.workspaceId}`,{method:'PATCH',body:JSON.stringify({status:'connected',external_session_id:sessionId,consent_expires_at:session.access?.valid_until||session.access?.validUntil||null,error_message:null,updated_at:new Date().toISOString()})});
let sessionFull=session;try{const refreshed=await eb(`/sessions/${encodeURIComponent(sessionId)}`);sessionFull={...session,...refreshed,accounts:[...(session.accounts||[]),...(refreshed.accounts||[])],accounts_data:[...(session.accounts_data||[]),...(refreshed.accounts_data||[])]}}catch(e){console.warn('session refresh',e.message)}const metas=mergeAccountMeta(sessionFull),existing=await supa(`bank_accounts?connection_id=eq.${st.id}&workspace_id=eq.${st.workspaceId}&select=*`);let discovered=0,newAccounts=0;
for(const meta of metas){const uid=accountUid(meta);if(!uid)continue;discovered++;let details=null,balances=null;try{details=await eb(`/accounts/${encodeURIComponent(uid)}/details`)}catch{}try{balances=await eb(`/accounts/${encodeURIComponent(uid)}/balances`)}catch{}const bal=balanceFrom(balances);const prev=(existing||[]).find(a=>String(a.external_account_id)===String(uid));const row={workspace_id:st.workspaceId,connection_id:Number(st.id),external_account_id:String(uid),identification_hash:meta?.identification_hash||meta?.identificationHash||null,bank_name:session.aspsp?.name||c.display_name||'Bank',account_name:accountName(details)||accountName(meta),iban:firstIban(details)||firstIban(meta),currency:bal?.currency||details?.currency||details?.account_currency||'EUR',active:true};if(bal){row.balance=bal.amount;row.balance_updated_at=new Date().toISOString()}if(prev){await supa(`bank_accounts?id=eq.${prev.id}&workspace_id=eq.${st.workspaceId}`,{method:'PATCH',body:JSON.stringify(row)})}else{newAccounts++;await supa('bank_accounts',{method:'POST',body:JSON.stringify(row)})}}
// A reconnect can return new provider account IDs. Deactivate any old IDs that were not returned
// by the current authorization so Financials never queries stale Enable Banking accounts again.
const currentIds=new Set(metas.map(accountUid).filter(Boolean).map(String));
for(const old of existing||[]){if(old.external_account_id&&!currentIds.has(String(old.external_account_id))&&old.active!==false){await supa(`bank_accounts?id=eq.${old.id}&workspace_id=eq.${st.workspaceId}`,{method:'PATCH',body:JSON.stringify({active:false})})}}
const params=new URLSearchParams({bank:'connected',bank_connection_id:String(st.id),bank_accounts_found:String(discovered),bank_new_accounts:String(newAccounts)});if(c.owner_id)params.set('owner_id',String(c.owner_id));res.writeHead(302,{Location:`${base}/?${params.toString()}`});res.end()}catch(e){res.writeHead(302,{Location:`${base}/?bank_error=${encodeURIComponent(e.message)}`});res.end()}}

return module.exports; })();


handlers["create"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {supa,requireBankPermission}=require('../lib/core');
module.exports=async(req,res)=>{try{
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const ctx=await requireBankPermission(req);
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const provider=String(body.provider||'enable_banking').trim().slice(0,80);
  const displayName=String(body.display_name||'Bank').trim().slice(0,160);
  const ownerId=body.owner_id==null||body.owner_id===''?null:Number(body.owner_id);
  if(ownerId!==null){
    if(!Number.isInteger(ownerId)||ownerId<=0)return res.status(400).json({error:'Invalid owner'});
    const owner=(await supa(`owners?id=eq.${ownerId}&workspace_id=eq.${encodeURIComponent(ctx.workspaceId)}&select=id`))?.[0];
    if(!owner)return res.status(403).json({error:'Owner is outside this workspace'});
  }
  const rows=await supa('bank_connections',{method:'POST',body:JSON.stringify({workspace_id:ctx.workspaceId,provider,display_name:displayName,status:'pending',read_only:true,owner_id:ownerId})});
  const connection=Array.isArray(rows)?rows[0]:rows;
  if(!connection?.id)throw new Error('Could not create bank connection');
  res.status(200).json({ok:true,connection});
}catch(e){res.status(400).json({error:e.message})}}
return module.exports; })();

handlers["remove_account"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {supa,ownedAccount}=require('../lib/core');module.exports=async(req,res)=>{try{if(req.method!=='POST')return res.status(405).json({error:'POST required'});const id=String(req.query.account_id||'');if(!/^\d+$/.test(id))return res.status(400).json({error:'Invalid account'});const {workspaceId}=await ownedAccount(req,id);await supa(`bank_accounts?id=eq.${id}&workspace_id=eq.${workspaceId}`,{method:'DELETE'});res.status(200).json({ok:true})}catch(e){res.status(400).json({error:e.message})}}
return module.exports; })();

handlers["disconnect"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {eb,supa,ownedConnection}=require('../lib/core');module.exports=async(req,res)=>{try{if(req.method!=='POST')return res.status(405).json({error:'POST required'});const id=String(req.query.connection_id||'');if(!/^\d+$/.test(id))return res.status(400).json({error:'Invalid connection'});const {workspaceId,connection:c}=await ownedConnection(req,id);let providerClosed=false;if(c.external_session_id){try{await eb(`/sessions/${encodeURIComponent(c.external_session_id)}`,{method:'DELETE'});providerClosed=true}catch(e){console.warn(e.message)}}await supa(`bank_accounts?connection_id=eq.${id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({active:false})});await supa(`bank_connections?id=eq.${id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({status:'disconnected',updated_at:new Date().toISOString()})});res.status(200).json({ok:true,providerClosed})}catch(e){res.status(400).json({error:e.message})}}

return module.exports; })();

handlers["start"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {eb,ownedConnection,makeState,workspaceBankAutoEnabled,requireBankPermission}=require('../lib/core');module.exports=async(req,res)=>{try{const id=String(req.query.connection_id||''),name=String(req.query.name||'').trim(),country=String(req.query.country||'BE').toUpperCase(),psuType=['personal','business'].includes(String(req.query.psu_type||'personal'))?String(req.query.psu_type||'personal'):'personal';if(!/^\d+$/.test(id)||!name)return res.status(400).json({error:'Invalid bank or connection'});const perm=await requireBankPermission(req);const {workspaceId}=await ownedConnection(req,id);if(String(perm.workspaceId)!==String(workspaceId))throw new Error('Bank connection is outside this workspace.');const base=process.env.BANK_APP_URL||`https://${req.headers.host}`;const data=await eb('/auth',{method:'POST',body:JSON.stringify({access:{valid_until:new Date(Date.now()+89*86400000).toISOString(),balances:true,transactions:true},aspsp:{name,country},state:makeState(id,workspaceId),redirect_url:`${base}/api/bank/callback`,psu_type:psuType,language:'nl'})});res.status(200).json({url:data.url})}catch(e){res.status(400).json({error:e.message})}}

return module.exports; })();

handlers["sync"] = (() => { const module = {exports:{}}; const exports = module.exports;
const {eb,supa,ownedConnection,workspaceBankMatchSettings,requireBankPermission}=require('../lib/core');
const clean=v=>String(v||"").replace(/\s+/g,"").toLowerCase();
const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const refDigits=v=>String(v||"").replace(/\D/g,"");
const structuredRef=v=>{const d=refDigits(v);if(d.length<12)return '';for(let i=0;i<=d.length-12;i++){const x=d.slice(i,i+12),base=Number(x.slice(0,10)),check=Number(x.slice(10));if(check===(base%97||97))return x}return d.length===12?d:''};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const textOf=v=>arr(v).map(x=>typeof x==='string'?x:(x?.text||x?.value||x?.reference||'')).filter(Boolean).join(' · ');
const accountIban=x=>String(x?.iban||x?.identification||x?.account_id?.iban||x?.accountId?.iban||x?.other?.identification||'');
function txReference(t){return [t?.reference_number,textOf(t?.remittance_information),textOf(t?.remittance_information_unstructured),t?.additional_information,t?.note].filter(Boolean).join(' · ')}
function txStatus(t){return String(t?.status||'BOOK').toUpperCase()}
async function suggestionFor(tx,workspaceId){
 if(Number(tx.amount||0)<=0)return null;
 const tenants=await supa(`tenants?workspace_id=eq.${workspaceId}&active=eq.true&select=id,name,iban,payment_reference`);
 const txText=[tx.counterparty_name,tx.counterparty_iban,tx.remittance_information].filter(Boolean).join(' ');
 const text=norm(txText), iban=clean(tx.counterparty_iban), txStructured=structuredRef(tx.remittance_information);
 let matches=[];
 for(const t of tenants||[]){
  let score=0;const reasons=[];
  const ref=norm(t.payment_reference),tenantStructured=structuredRef(t.payment_reference),ti=clean(t.iban),name=norm(t.name);
  // Belgian structured references are identity keys. Formatting such as +++123/4567/89012+++ is ignored.
  const refMatched=Boolean((tenantStructured&&txStructured&&tenantStructured===txStructured)||(ref&&text.includes(ref)));
  if(refMatched){score+=30;reasons.push('reference')}
  if(ti&&iban&&ti===iban){score+=14;reasons.push('iban')}
  if(name&&text.includes(name)){score+=7;reasons.push('name')}
  const ps=await supa(`payments?workspace_id=eq.${workspaceId}&tenant_id=eq.${t.id}&select=*&order=year.asc,month.asc`);
  const open=[];
  for(const p of ps||[]){
   const es=await supa(`payment_entries?workspace_id=eq.${workspaceId}&payment_id=eq.${p.id}&select=amount`);
   const paid=(es||[]).reduce((a,x)=>a+Number(x.amount||0),0);
   const due=Math.max(0,Number(p.expected_amount||0)-paid);
   if(due>.005)open.push({p,due});
  }
  if(!open.length)continue;
  const exact=open.find(x=>Math.abs(Number(tx.amount)-x.due)<.01);
  const chosen=exact||open[0];
  const candidateReasons=[...reasons];
  let candidateScore=score;
  if(exact){candidateScore+=6;candidateReasons.push('amount')}
  // A unique structured/reference match must remain reviewable even when payer/amount differs.
  // This supports partial payments, combined payments, spouse/company payers, etc. Auto-post stays stricter below.
  if(refMatched||candidateReasons.includes('iban')||candidateReasons.includes('name')||exact){
   matches.push({t,p:chosen.p,score:candidateScore,reasons:candidateReasons,due:chosen.due,amount_mismatch:!exact});
  }
 }
 matches.sort((a,b)=>b.score-a.score);
 const b=matches[0],second=matches[1];
 if(!b)return null;
 // Reference/IBAN identities can win even without exact amount. Weak name/amount-only ambiguity stays unmatched.
 if(second&&b.score-second.score<5&&!b.reasons.includes('reference')&&!b.reasons.includes('iban'))return null;
 if(!b.reasons.some(r=>r!=='amount'))return null;
 return b;
}

async function autoPost(tx,workspaceId){
 const b=await suggestionFor(tx,workspaceId);if(!b)return {posted:false,suggested:false};
 // Pending/held bank items are useful suggestions but are never posted until booked.
 if(txStatus(tx.raw)!=='BOOK')return {posted:false,suggested:true};
 const settings=await workspaceBankMatchSettings(workspaceId);if(settings.mode==='review_only')return {posted:false,suggested:true};
 if(!b.reasons.includes('amount'))return {posted:false,suggested:true};
 if(settings.mode==='strict'){if(!['reference','iban','name','amount'].every(r=>b.reasons.includes(r)))return {posted:false,suggested:true};}
 else if(!b.reasons.includes('reference'))return {posted:false,suggested:true};
 await supa('payment_entries',{method:'POST',body:JSON.stringify({workspace_id:workspaceId,payment_id:b.p.id,amount:Number(tx.amount),payment_date:tx.booking_date||new Date().toISOString().slice(0,10),method:'bank',reference:tx.remittance_information||tx.external_transaction_id||'',notes:`Auto-matched bank payment · ${b.reasons.join(', ')}`})});
 const entries=await supa(`payment_entries?workspace_id=eq.${workspaceId}&payment_id=eq.${b.p.id}&select=amount`),paid=(entries||[]).reduce((a,x)=>a+Number(x.amount||0),0),due=Number(b.p.expected_amount||0);
 await supa(`payments?id=eq.${b.p.id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({paid_amount:paid,status:paid>=due-.005?'paid':paid>0?'partial':'pending'})});
 await supa(`bank_transactions?id=eq.${tx.id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({match_status:'matched',matched_tenant_id:b.t.id,matched_payment_id:b.p.id,matched_at:new Date().toISOString()})});return {posted:true,suggested:true};
}
module.exports=async(req,res)=>{try{
 if(req.method!=="POST")return res.status(405).json({error:"POST required"});const id=String(req.query.connection_id||"");if(!/^\d+$/.test(id))return res.status(400).json({error:"Invalid connection"});
 const perm=await requireBankPermission(req);const {workspaceId,connection:c}=await ownedConnection(req,id);if(String(perm.workspaceId)!==String(workspaceId))throw new Error('Bank connection is outside this workspace.');if(!c?.external_session_id)throw new Error("Bank connection is not authorized");
 const accts=await supa(`bank_accounts?workspace_id=eq.${workspaceId}&connection_id=eq.${id}&active=eq.true&select=*`);let checked=0,newImported=0,autoMatched=0,suggested=0,staleAccounts=0,pendingImported=0;
 for(const a of accts||[]){if(!a.external_account_id)continue;let stale=false,apiBalance=null;
  try{const b=await eb(`/accounts/${encodeURIComponent(a.external_account_id)}/balances`);const rank={ITAV:1,CLAV:2,ITBD:3,CLBD:4,OPBD:5};const bal=[...(b.balances||[])].sort((x,y)=>(rank[String(x?.balance_type||'').toUpperCase()]||99)-(rank[String(y?.balance_type||'').toUpperCase()]||99))[0];if(bal){const box=bal.balance_amount||bal.balanceAmount||bal.amount||{};const raw=typeof box==='object'?(box.amount??box.value):box;const amount=Number(raw);if(Number.isFinite(amount)){apiBalance={amount,currency:(typeof box==='object'?(box.currency||box.currency_code):null)||bal.currency||a.currency||"EUR",at:bal.last_change_date_time||bal.reference_date||null,type:String(bal.balance_type||'').toUpperCase()};await supa(`bank_accounts?id=eq.${a.id}&workspace_id=eq.${workspaceId}`,{method:"PATCH",body:JSON.stringify({balance:apiBalance.amount,currency:apiBalance.currency,balance_updated_at:new Date().toISOString()})})}}}
  catch(e){if(/Enable Banking 404:|No account found matching provided id/i.test(String(e.message||''))){stale=true;staleAccounts++;await supa(`bank_accounts?id=eq.${a.id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({active:false})})}else console.error("balance",e.message)}if(stale)continue;
  const existingRows=await supa(`bank_transactions?workspace_id=eq.${workspaceId}&bank_account_id=eq.${a.id}&select=external_transaction_id`),existing=new Set((existingRows||[]).map(x=>String(x.external_transaction_id)));
  let continuation=null,loops=0,latestTxBalance=null;
  try{do{
   let path=`/accounts/${encodeURIComponent(a.external_account_id)}/transactions?date_from=${new Date(Date.now()-120*86400000).toISOString().slice(0,10)}&strategy=default`;if(continuation)path+=`&continuation_key=${encodeURIComponent(continuation)}`;
   const d=await eb(path);for(const t of d.transactions||[]){checked++;const status=txStatus(t);if(status==='CNCL'||status==='RJCT')continue;const isDebit=String(t.credit_debit_indicator||"").toUpperCase()==="DBIT",amount=Number(t.transaction_amount?.amount||0)*(isDebit?-1:1),cp=(isDebit?(t.creditor?.name||t.creditor_name):(t.debtor?.name||t.debtor_name))||(t.creditor?.name||t.debtor?.name||t.creditor_name||t.debtor_name||""),iban=(isDebit?(accountIban(t.creditor_account)||accountIban(t.creditor)):(accountIban(t.debtor_account)||accountIban(t.debtor)))||(accountIban(t.creditor_account)||accountIban(t.debtor_account)||""),remit=txReference(t),ext=t.entry_reference||t.transaction_id||`${a.external_account_id}-${t.booking_date||t.booking_date_time||t.transaction_date}-${amount}-${remit}`;
    const isNew=!existing.has(String(ext));await supa("bank_transactions?on_conflict=external_transaction_id",{method:"POST",prefer:"resolution=merge-duplicates,return=minimal",body:JSON.stringify({workspace_id:workspaceId,bank_account_id:a.id,external_transaction_id:String(ext),bank_name:a.bank_name,booking_date:String(t.booking_date||t.booking_date_time||t.transaction_date||new Date().toISOString()).slice(0,10),value_date:String(t.value_date||t.value_date_time||"").slice(0,10)||null,amount,currency:t.transaction_amount?.currency||a.currency||"EUR",counterparty_name:cp,counterparty_iban:iban,remittance_information:remit,raw:t})});if(isNew){existing.add(String(ext));newImported++;if(status==='PDNG'||status==='HOLD')pendingImported++;}
    if(t.balance_after_transaction?.amount!=null){const when=String(t.booking_date||t.booking_date_time||t.transaction_date||'');if(!latestTxBalance||when>latestTxBalance.when)latestTxBalance={when,amount:Number(t.balance_after_transaction.amount),currency:t.balance_after_transaction.currency||a.currency||'EUR'}}
   }
   continuation=d.continuation_key||null;loops++;
  }while(continuation&&loops<20)}catch(e){if(/Enable Banking 404:|No account found matching provided id/i.test(String(e.message||''))){staleAccounts++;await supa(`bank_accounts?id=eq.${a.id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({active:false})});continue}throw e}
  // Some banks expose a fresher balance on the newest booked transaction than on /balances.
  if(latestTxBalance&&!apiBalance){await supa(`bank_accounts?id=eq.${a.id}&workspace_id=eq.${workspaceId}`,{method:'PATCH',body:JSON.stringify({balance:latestTxBalance.amount,currency:latestTxBalance.currency,balance_updated_at:new Date().toISOString()})})}
 }
 const activeIds=(await supa(`bank_accounts?workspace_id=eq.${workspaceId}&connection_id=eq.${id}&active=eq.true&select=id`))||[];
 const fresh=await supa(`bank_transactions?workspace_id=eq.${workspaceId}&bank_account_id=in.(${activeIds.map(x=>x.id).join(',')||0})&match_status=eq.unmatched&amount=gt.0&select=*`);for(const tx of fresh||[])try{const r=await autoPost(tx,workspaceId);if(r.posted)autoMatched++;else if(r.suggested)suggested++;}catch(e){console.error('auto-match',tx.id,e.message)}
 await supa(`bank_connections?id=eq.${id}&workspace_id=eq.${workspaceId}`,{method:"PATCH",body:JSON.stringify({last_sync_at:new Date().toISOString(),status:"connected",error_message:null})});
 res.status(200).json({ok:true,checked,newImported,imported:newImported,autoMatched,suggested,pendingImported,staleAccounts,accountsChecked:(accts||[]).length});
}catch(e){res.status(500).json({error:e.message})}};

return module.exports; })();

module.exports = async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();
  const action = String(req.query.action || '').trim();
  const h = handlers[action];
  if(!h) return res.status(404).json({error:'Unknown bank action'});
  return h(req,res);
};
