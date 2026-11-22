'use strict';
const crypto=require('crypto'),core=require('./core'),tracking=require('./recipient-tracking'),enc=encodeURIComponent;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function marker(body,name,fallback=[]){try{const v=String(body||'').match(new RegExp('__MR4U_'+name+':([A-Za-z0-9+/=]+)__'))?.[1];return v?JSON.parse(Buffer.from(v,'base64').toString('utf8')):fallback}catch{throw Error('The saved message details could not be read. Open a new message instead.')}}
function clean(body){return String(body||'').replace(/\n?__MR4U_[A-Z_0-9]+:[^\n]*?__/g,'').trim()}
function freshPayload(payload,original,copy){const p=structuredClone(payload);if(!p?.html||!Array.isArray(p.to)||!p.to.length)throw Error('The original email has no saved recipient or body. Open a new message instead.');for(const key of ['html','text','reply_to'])if(typeof p[key]==='string'&&original.tracking_token)p[key]=p[key].split(original.tracking_token).join(copy.tracking_token);delete p.tags;delete p.bcc;return p}
async function legacyPayload(source,m){const parsed=source==='tenant_message'?marker(m.body,'ATTACHMENTS'):m.attachments77||[],attachments=parsed.map(a=>({filename:a.name,content:a.content}));if(attachments.some(a=>!a.filename||!a.content))throw Error('An original attachment is unavailable. Download or restore it before resending.');let to=m.to_recipients,cc=m.cc_recipients?.length?m.cc_recipients:source==='tenant_message'?marker(m.body,'CC'):[];if(!to?.length){const table=source==='tenant_message'?'tenants':'owners',id=source==='tenant_message'?m.tenant_id:m.owner_id;const contact=(await core.supa(`${table}?workspace_id=eq.${enc(m.workspace_id)}&id=eq.${enc(id)}&select=email`))?.[0];to=[contact?.email].filter(Boolean)}const recipients=require('./mail-recipients').recipients(to,cc);const text=clean(m.body);return {from:core.propertyManagerFrom(process.env.RESEND_FROM_EMAIL||process.env.REMINDER_FROM_EMAIL),to:recipients.to,cc:recipients.cc,subject:m.subject||'ManageRent4U message',html:require('./email-design').frame({title:m.subject||'Property management',body:'<div style="font-size:15px;line-height:1.8">'+esc(text).replace(/\n/g,'<br>')+'</div>'}),...(attachments.length?{attachments}:{})}}
async function resend(req,b){
 if(req.method!=='POST')throw Error('POST required');
 if(!/^[a-f0-9-]{36}$/i.test(String(b.request_id||'')))throw Error('Reopen this message before resending.');
 const source=b.source,{message:m,user}=await tracking.access(req,source,b.message_id,'edit',true);
 if(m.deleted95||m.deleted_at||m.direction==='incoming'||m.status!=='sent')throw Error('Only a sent outgoing email can be resent. Review pending deliveries in Recipient activity.');
 if(m.delivery_channel&&m.delivery_channel!=='email')throw Error('Only sent emails can be resent here.');
 const originalJob=(await core.supa(`mail_delivery_jobs?workspace_id=eq.${enc(m.workspace_id)}&source=eq.${enc(source)}&message_id=eq.${enc(m.id)}&select=*&limit=1`))?.[0];
 if(originalJob&&originalJob.state!=='sent')throw Error('The original delivery still needs review. Open Recipient activity before resending.');
 // Load and validate the saved payload BEFORE writing the new copy. Never regenerate statements.
 const snapshot=originalJob?.payload||await legacyPayload(source,m);
 if(!snapshot.from||!snapshot.html||!snapshot.to?.length)throw Error('The original email is incomplete. Open a new message instead.');
 const savedFiles=(snapshot.attachments||[]).map(a=>({name:a.filename,content:a.content,type:/\.pdf$/i.test(a.filename||'')?'application/pdf':/\.png$/i.test(a.filename||'')?'image/png':'image/jpeg',size:Buffer.from(a.content||'','base64').length}));if(savedFiles.some(a=>!a.name||!a.content))throw Error('An original attachment is unavailable. Restore it before resending.');
 const token=crypto.createHash('sha256').update([m.workspace_id,source,m.id,user.id,b.request_id].join('|')).digest('hex'),table=source==='tenant_message'?'tenant_messages':'owner_messages';
 const query=`${table}?workspace_id=eq.${enc(m.workspace_id)}&tracking_token=eq.${token}&select=*&limit=1`;
 let copy=(await core.supa(query))?.[0];
 if(!copy){const row={workspace_id:m.workspace_id,subject:m.subject,body:m.body,direction:'outgoing',status:source==='tenant_message'?'queued':'saved',to_recipients:snapshot.to,cc_recipients:snapshot.cc||[],tracking_token:token};
 if(source==='tenant_message'){const root=String(m.body||'').match(/__MR4U_THREAD:(\d+)__/)?.[1]||m.id;Object.assign(row,{tenant_id:m.tenant_id,reply_mode:m.reply_mode||'allow',delivery_channel:'email',body:String(m.body||'').replace(/\n?__MR4U_ATTACHMENTS:[A-Za-z0-9+/=]+__/g,'').replace(/\n?__MR4U_(?:RESEND_OF|THREAD|PARENT):\d+__/g,'')+(savedFiles.length?'\n__MR4U_ATTACHMENTS:'+Buffer.from(JSON.stringify(savedFiles),'utf8').toString('base64')+'__':'')+`\n__MR4U_RESEND_OF:${m.id}__\n__MR4U_THREAD:${root}__\n__MR4U_PARENT:${m.id}__`})}
 else Object.assign(row,{owner_id:m.owner_id,parent_id:m.id,attachments77:savedFiles,context_report_id:m.report_id||m.context_report_id||null,context_task_id:m.context_task_id||null,sender_name:m.sender_name,sender_email:m.sender_email,created_by:user.id});
 try{copy=(await core.supa(table+'?on_conflict=tracking_token',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:JSON.stringify(row)}))?.[0]||(await core.supa(query))?.[0]}catch(e){copy=(await core.supa(query))?.[0];if(!copy)throw e}}
 if(!copy)throw Error('The resend copy could not be saved. Retry the same request.');
 const payload=freshPayload(snapshot,m,copy);if(!payload.from)throw Error('The email sender is not configured.');
 const delivery=await tracking.send(source,copy,payload);
 return {ok:true,message_id:copy.id,delivery,warning:delivery.warning};
}
module.exports={resend,legacyPayload,freshPayload,clean};
