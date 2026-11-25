'use strict';
const crypto=require('crypto');
const actions=new Set(['whatsapp136_status','whatsapp136_connect','whatsapp136_disconnect','whatsapp136_send','whatsapp136_receipt']);
function config(){const url=String(process.env.WHATSAPP_GATEWAY_URL||'').trim(),secret=String(process.env.WHATSAPP_GATEWAY_SECRET||'').trim();if(!url||secret.length<32)return null;const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('The WhatsApp service must use a secure HTTPS address.');return {url:u.origin+u.pathname.replace(/\/$/,''),secret}}
function sessionId(user,workspace,scope,owner){return crypto.createHash('sha256').update(JSON.stringify([String(workspace),String(user.id),scope,scope==='owner'?String(owner):''])).digest('hex')}
async function handle(body,user,workspace,{supa,fetchImpl=fetch}){
 if(!actions.has(body.action))throw Error('Unknown WhatsApp action.');
 const scope=body.scope==='owner'?'owner':body.scope==='all'?'all':null;if(!scope)throw Error('Choose a WhatsApp connection.');
 const owner=String(body.owner_id||'');if(scope==='owner'){if(!/^[a-zA-Z0-9-]{1,100}$/.test(owner))throw Error('Choose an owner.');const found=await supa(`owners?workspace_id=eq.${encodeURIComponent(workspace)}&id=eq.${encodeURIComponent(owner)}&select=id`);if(!found?.length)throw Error('Owner not found in this workspace.');}
 const cfg=config();if(!cfg){if(body.action==='whatsapp136_status')return {ok:true,configured:false,status:'not_configured',message:'Connected sending needs the WhatsApp service setup. Manual WhatsApp remains available.'};throw Error('Set up the WhatsApp connection service first.');}
 const operation=body.action.replace('whatsapp136_',''),payload={operation,session:sessionId(user,workspace,scope,owner)};
 if(operation==='send'||operation==='receipt'){if(!/^[0-9a-f-]{36}$/i.test(String(body.request_id||'')))throw Error('Invalid message request.');payload.request_id=body.request_id;}
 if(operation==='send'){let to=String(body.to||'').trim().replace(/[\s().-]/g,'').replace(/^00/,'+');if(!/^\+?[1-9]\d{6,14}$/.test(to))throw Error('Enter the full recipient number with country code.');const text=String(body.text||'').trim();if(!text||text.length>8000)throw Error('Write a message of up to 8,000 characters.');payload.to=to.replace(/^\+/,'');payload.text=text;}
 const raw=JSON.stringify(payload),timestamp=String(Date.now()),nonce=crypto.randomBytes(16).toString('hex'),signature=crypto.createHmac('sha256',cfg.secret).update(timestamp+'\n'+nonce+'\n'+raw).digest('hex');
 try{const response=await fetchImpl(cfg.url+'/v1/command',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-MR-Time':timestamp,'X-MR-Nonce':nonce,'X-MR-Signature':signature},body:raw,signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw Error(result.error||'WhatsApp service unavailable.');return {...result,configured:true};}
 catch(e){if(operation==='status')return {ok:true,configured:true,status:'unavailable',message:'WhatsApp connection could not be checked. Sending is unavailable. Recheck the connection.'};throw Error(operation==='send'?'Sending could not be confirmed. Keep this window open and use Check sending result before retrying.':'WhatsApp service unavailable. Recheck the connection.');}
}
module.exports={handle,sessionId,actions};
