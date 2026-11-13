'use strict';
const crypto=require('crypto'),{supa,appUrl}=require('./core'),hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex'),enc=encodeURIComponent;
function fail(s,status=400){const e=Error(s);e.status=status;throw e}
async function issue(user,invitation){
 if(user?.app_metadata?.mr4u_initial_password_pending!==true)fail('Use the existing account password.');
 const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Math.min(Date.now()+7*86400000,invitation?.expires_at?Date.parse(invitation.expires_at):Infinity)).toISOString();
 // Revoke earlier setup links before issuing a replacement. Tokens are never stored in clear text.
 await supa('mr4u_initial_password116?user_id=eq.'+enc(user.id)+'&used_at=is.null',{method:'PATCH',body:JSON.stringify({used_at:new Date().toISOString()})});
 await supa('mr4u_initial_password116',{method:'POST',body:JSON.stringify({token_hash:hash(token),user_id:user.id,invitation_id:invitation?.id||null,expires_at:expires})});
 const url=new URL(appUrl()||'https://www.managerent4u.com');url.searchParams.set('setup_token',token);url.searchParams.set('email',user.email);return url;
}
async function info(token){
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))fail('This setup link is unavailable.');
 const t=(await supa('mr4u_initial_password116?token_hash=eq.'+hash(token)+'&used_at=is.null&select=*'))?.[0];
 if(!t||Date.parse(t.expires_at)<=Date.now())fail('This setup link has expired or was already used. Sign in or use password recovery.');
 if(t.invitation_id){const i=(await supa('workspace_invitations92?id=eq.'+enc(t.invitation_id)+'&select=status,expires_at,workspace_id'))?.[0];if(!i||i.status!=='pending'||Date.parse(i.expires_at)<=Date.now())fail('Invitation unavailable. Ask for a new invitation.');const w=(await supa('workspaces?id=eq.'+enc(i.workspace_id)+'&select=status'))?.[0];if(w?.status!=='active')fail('Workspace unavailable.');}
 return t;
}
async function handle(req,b,admin){
 if(req.method!=='POST')fail('POST required',405);
 await info(b.token);
 if(b.action==='setup116_info')return {ok:true};
 if(b.action!=='setup116_complete')fail('Unknown setup action');
 const password=String(b.password||'');if(password.length<8||password.length>1024)fail('Use a password of 8–1,024 characters.');
 const claimed=await supa('rpc/mr4u_initial_password_claim116',{method:'POST',body:JSON.stringify({p_hash:hash(b.token)})});
 if(!/^[a-f0-9-]{36}$/i.test(claimed?.user_id||''))fail('Password setup could not be confirmed.');
 try{await admin('users/'+enc(claimed.user_id),{method:'PUT',body:JSON.stringify({password,app_metadata:{...(claimed.app_metadata||{}),mr4u_initial_password_pending:false}})})}catch{fail('Password setup could not be confirmed. Use Forgot password to recover access.');}
 return {ok:true,email:claimed.email};
}
module.exports={issue,info,handle};
