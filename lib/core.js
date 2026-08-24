'use strict';
const bank = (()=>{ const module={exports:{}}; const exports=module.exports;
const crypto=require('crypto');
const API='https://api.enablebanking.com';
function b64url(v){return Buffer.from(v).toString('base64url')}
function jwt(){const app=process.env.ENABLE_BANKING_APP_ID,key=(process.env.ENABLE_BANKING_PRIVATE_KEY||'').replace(/\\n/g,'\n');if(!app||!key)throw new Error('Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_PRIVATE_KEY');const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({typ:'JWT',alg:'RS256',kid:app})),body=b64url(JSON.stringify({iss:'enablebanking.com',aud:'api.enablebanking.com',iat:now,exp:now+3600})),input=`${header}.${body}`,sig=crypto.sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');return `${input}.${sig}`}
async function eb(path,options={}){const r=await fetch(API+path,{...options,headers:{Authorization:`Bearer ${jwt()}`,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});const txt=await r.text();let data;try{data=JSON.parse(txt)}catch{data={message:txt}}if(!r.ok)throw new Error(`Enable Banking ${r.status}: ${data.detail||data.message||data.error||'Request failed'}`);return data}
function supabaseBase(){let url=String(process.env.SUPABASE_URL||'').trim();if(!url)throw new Error('Missing SUPABASE_URL');return url.replace(/\/+$/,'').replace(/\/rest\/v1$/i,'')}
function serviceKey(){const k=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!k)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');return k}
async function supa(path,options={}){const key=serviceKey(),clean=String(path||'').replace(/^\/+/, '').replace(/^rest\/v1\//i,''),headers={apikey:key,'Content-Type':'application/json',Prefer:options.prefer||'return=representation',...(options.headers||{})};if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;const r=await fetch(`${supabaseBase()}/rest/v1/${clean}`,{...options,headers});const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data={message:txt}}if(!r.ok)throw new Error(`Supabase ${r.status}: ${data?.message||data?.details||data?.hint||'Request failed'}`);return data}
async function requireUser(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('Not signed in');const k=serviceKey(),r=await fetch(`${supabaseBase()}/auth/v1/user`,{headers:{apikey:k,Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Invalid session');return r.json()}
async function userContext(req){const user=await requireUser(req),p=(await supa(`user_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=active_workspace_id`))?.[0];if(!p?.active_workspace_id)throw new Error('No active workspace');const w=(await supa(`workspaces?id=eq.${p.active_workspace_id}&select=id,status`))?.[0];if(!w||w.status!=='active')throw new Error('Workspace is suspended');return{user,workspaceId:w.id}}
async function ownedConnection(req,id){const ctx=await userContext(req),c=(await supa(`bank_connections?id=eq.${id}&workspace_id=eq.${ctx.workspaceId}&select=*`))?.[0];if(!c)throw new Error('Bank connection not found in this workspace');return{...ctx,connection:c}}
async function ownedAccount(req,id){const ctx=await userContext(req),a=(await supa(`bank_accounts?id=eq.${id}&workspace_id=eq.${ctx.workspaceId}&select=*`))?.[0];if(!a)throw new Error('Bank account not found in this workspace');return{...ctx,account:a}}
async function authUserById(id){const k=serviceKey(),r=await fetch(`${supabaseBase()}/auth/v1/admin/users/${encodeURIComponent(id)}`,{headers:{apikey:k,Authorization:`Bearer ${k}`}});if(!r.ok)return null;return r.json()}
async function workspaceBankAutoEnabled(workspaceId){const w=(await supa(`workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=owner_user_id,status`))?.[0];if(!w||w.status!=='active')return false;const u=await authUserById(w.owner_user_id);return Boolean(u?.user_metadata?.mr4u_bank_auto_check)}

function stateSignature(id,workspaceId,nonce){return crypto.createHmac('sha256',serviceKey()).update(`${id}.${workspaceId}.${nonce}`).digest('hex').slice(0,32)}
function makeState(id,workspaceId){const nonce=crypto.randomBytes(12).toString('hex');return `${id}.${workspaceId}.${nonce}.${stateSignature(id,workspaceId,nonce)}`}
function verifyState(state){const [id,workspaceId,nonce,sig]=String(state||'').split('.');if(!/^\d+$/.test(id)||!workspaceId||!nonce||!sig)return null;const expected=stateSignature(id,workspaceId,nonce);try{if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null}catch{return null}return{id,workspaceId}}
module.exports={eb,supa,requireUser,userContext,ownedConnection,ownedAccount,workspaceBankAutoEnabled,makeState,verifyState};

return module.exports; })();
const messages = (()=>{ const module={exports:{}}; const exports=module.exports;
const crypto=require('crypto');
function base(){let u=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/i,'');if(!u)throw new Error('Missing SUPABASE_URL');return u}
function key(){const k=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!k)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');return k}
async function supa(path,options={}){const k=key(),clean=String(path||'').replace(/^\/+/, '').replace(/^rest\/v1\//i,'');const headers={apikey:k,'Content-Type':'application/json',Prefer:options.prefer||'return=representation',...(options.headers||{})};if(!k.startsWith('sb_secret_'))headers.Authorization=`Bearer ${k}`;const r=await fetch(`${base()}/rest/v1/${clean}`,{...options,headers});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={message:text}}if(!r.ok)throw new Error(data?.message||data?.details||`Supabase ${r.status}`);return data}
async function requireUser(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('Not signed in');const k=key();const r=await fetch(`${base()}/auth/v1/user`,{headers:{apikey:k,Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Invalid session');return r.json()}
function appUrl(){return String(process.env.BANK_APP_URL||process.env.APP_BASE_URL||'').replace(/\/+$/,'')}
function trackingUrl(type,token){return `${appUrl()}/api/messages/${type}?token=${encodeURIComponent(token)}`}
function replyAddress(token){const domain=String(process.env.REMINDER_REPLY_DOMAIN||'').trim();return domain?`reply+${token}@${domain}`:(process.env.REMINDER_REPLY_TO||'')}
async function event(message_id,event_type,metadata={}){const m=(await supa(`tenant_messages?id=eq.${message_id}&select=workspace_id`))?.[0];return supa('tenant_message_events',{method:'POST',body:JSON.stringify({workspace_id:m?.workspace_id||null,message_id,event_type,metadata})})}
function verifySvix(raw,headers){const secret=String(process.env.RESEND_WEBHOOK_SECRET||'');if(!secret)return true;const id=headers['svix-id'],ts=headers['svix-timestamp'],sig=headers['svix-signature'];if(!id||!ts||!sig)return false;const b64=secret.startsWith('whsec_')?secret.slice(6):secret;const key=Buffer.from(b64,'base64');const expected=crypto.createHmac('sha256',key).update(`${id}.${ts}.${raw}`).digest('base64');return String(sig).split(' ').some(part=>{const v=part.split(',')[1];if(!v)return false;try{return crypto.timingSafeEqual(Buffer.from(v),Buffer.from(expected))}catch{return false}})}
module.exports={supa,requireUser,appUrl,trackingUrl,replyAddress,event,verifySvix};

return module.exports; })();
module.exports = Object.assign({}, bank, messages);
