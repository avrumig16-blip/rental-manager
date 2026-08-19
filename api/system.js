const crypto=require('crypto');
const {supa,requireUser,appUrl}=require('../lib/messages');
function base(){let u=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/i,'');if(!u)throw new Error('Missing SUPABASE_URL');return u}
function serviceKey(){const k=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!k)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');return k}
function serviceHeaders(extra={}){const k=serviceKey(),h={apikey:k,'Content-Type':'application/json',...extra};if(!k.startsWith('sb_secret_'))h.Authorization=`Bearer ${k}`;return h}
async function authAdmin(path,options={}){const r=await fetch(`${base()}/auth/v1/admin/${path}`,{...options,headers:serviceHeaders(options.headers||{})});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={message:text}}if(!r.ok)throw new Error(data?.msg||data?.message||`Auth admin ${r.status}`);return data}
async function currentWorkspace(userId){const rows=await supa(`user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=active_workspace_id`);return rows?.[0]?.active_workspace_id||null}
async function isAdmin(userId){const rows=await supa(`platform_admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id`);return Boolean(rows?.length)}
function codeHash(code){return crypto.createHash('sha256').update(String(code)).digest('hex')}
async function sendEmail(to,subject,html){const key=String(process.env.RESEND_API_KEY||'').trim();if(!key)throw new Error('Missing RESEND_API_KEY');const from=String(process.env.RESEND_FROM_EMAIL||'ManageRent4U <reminders@managerent4u.com>');const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,html})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||'Email could not be sent');return j}
function randomCode(){return String(crypto.randomInt(0,1000000)).padStart(6,'0')}
async function requestReset(email,kind='reset'){
  const clean=String(email||'').trim().toLowerCase();if(!clean)return;
  const page=await authAdmin('users?per_page=1000');const user=(page.users||[]).find(u=>String(u.email||'').toLowerCase()===clean);if(!user)return;
  const code=randomCode(),exp=new Date(Date.now()+15*60*1000).toISOString();
  await supa('password_reset_codes',{method:'POST',body:JSON.stringify({user_id:user.id,email:clean,code_hash:codeHash(code),expires_at:exp})});
  const title=kind==='invite'?'Set up your ManageRent4U account':'Your ManageRent4U password code';const app=appUrl()||'https://managerent4u.com';
  await sendEmail(clean,title,`<div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:32px"><div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:30px;border:1px solid #e5eaf1"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;color:#2563eb">MANAGERENT4U</div><h2 style="color:#0f2745">${title}</h2><p>${kind==='invite'?`Your ManageRent4U workspace is ready. Open <a href="${app}">ManageRent4U</a>, choose <b>Forgot password</b>, and use this one-time code to create your password.`:'Use this one-time code to reset your password:'}</p><div style="font-size:34px;font-weight:800;letter-spacing:.18em;color:#0f2745;margin:20px 0">${code}</div><p style="color:#66758a">The code expires in 15 minutes and can be used once.</p></div></div>`);
}
module.exports=async(req,res)=>{try{
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),action=String(body.action||req.query.action||'');
  if(action==='request_reset'){await requestReset(body.email,'reset');return res.status(200).json({ok:true})}
  if(action==='verify_reset'){
    const email=String(body.email||'').trim().toLowerCase(),code=String(body.code||''),password=String(body.password||'');if(password.length<8)return res.status(400).json({error:'Password must contain at least 8 characters'});
    const rows=await supa(`password_reset_codes?email=eq.${encodeURIComponent(email)}&code_hash=eq.${codeHash(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc&limit=1`),row=rows?.[0];if(!row)return res.status(400).json({error:'Invalid or expired code'});
    await authAdmin(`users/${row.user_id}`,{method:'PUT',body:JSON.stringify({password})});await supa(`password_reset_codes?id=eq.${row.id}`,{method:'PATCH',body:JSON.stringify({used_at:new Date().toISOString()})});return res.status(200).json({ok:true})
  }
  const user=await requireUser(req),admin=await isAdmin(user.id),workspace=await currentWorkspace(user.id);if(!workspace)return res.status(403).json({error:'No active workspace'});
  if(action==='workspace_info'){
    const w=(await supa(`workspaces?id=eq.${workspace}&select=*`))?.[0]||null;const memberships=await supa(`workspace_memberships?workspace_id=eq.${workspace}&select=*`);return res.status(200).json({workspace:w,memberships,platform_admin:admin})
  }
  if(action==='admin_list'){
    if(!admin)return res.status(403).json({error:'Administrator only'});const workspaces=await supa('workspaces?select=*&order=created_at.desc');const profiles=await supa('user_profiles?select=user_id,email,display_name,active_workspace_id');return res.status(200).json({workspaces,profiles})
  }
  if(action==='admin_create_customer'){
    if(!admin)return res.status(403).json({error:'Administrator only'});const email=String(body.email||'').trim().toLowerCase();if(!email)return res.status(400).json({error:'Email required'});const temp=crypto.randomBytes(24).toString('base64url');const u=await authAdmin('users',{method:'POST',body:JSON.stringify({email,password:temp,email_confirm:true,user_metadata:{display_name:body.name||''}})});await new Promise(r=>setTimeout(r,300));const wr=(await supa(`workspaces?owner_user_id=eq.${u.id}&select=*`))?.[0];if(wr){await supa(`workspaces?id=eq.${wr.id}`,{method:'PATCH',body:JSON.stringify({name:body.workspace_name||body.name||email.split('@')[0],unit_limit:Number(body.unit_limit||100)})})}await requestReset(email,'invite');return res.status(200).json({ok:true})
  }
  if(action==='admin_update_workspace'){
    if(!admin)return res.status(403).json({error:'Administrator only'});const id=String(body.workspace_id||'');const patch={};if(body.status)patch.status=body.status;if(body.unit_limit!=null)patch.unit_limit=Math.max(0,Number(body.unit_limit));if(body.name!=null)patch.name=String(body.name);await supa(`workspaces?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)});return res.status(200).json({ok:true})
  }
  if(action==='admin_delete_workspace'){
    if(!admin)return res.status(403).json({error:'Administrator only'});const id=String(body.workspace_id||'');const wr=(await supa(`workspaces?id=eq.${encodeURIComponent(id)}&select=owner_user_id`))?.[0];if(!wr)return res.status(404).json({error:'Workspace not found'});if(wr.owner_user_id===user.id)return res.status(400).json({error:'Your administrator workspace cannot be deleted'});await authAdmin(`users/${wr.owner_user_id}`,{method:'DELETE'});return res.status(200).json({ok:true})
  }
  return res.status(400).json({error:'Unknown action'});
}catch(e){console.error('SYSTEM_API',e);return res.status(400).json({error:e.message||String(e)})}}
