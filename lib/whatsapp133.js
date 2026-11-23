'use strict';
// Personal, workspace-scoped preferences only. This route never sends a WhatsApp message.
function clean(value){const owners={};for(const [id,on] of Object.entries(value?.owners||{})){if(/^[a-zA-Z0-9-]{1,100}$/.test(id)&&typeof on==='boolean')owners[id]=on}return {enabled:value?.enabled===true,owners}}
async function handle(body,user,workspace,deps){
 const current=await deps.authUserById(user.id);if(!current)throw Error('Could not load your WhatsApp settings. Please sign in again.');
 const meta=current.user_metadata||{},all=meta.mr4u_whatsapp133||{},settings=clean(all[String(workspace)]);
 if(body.action==='whatsapp133_settings')return {ok:true,settings};
 if(body.action!=='whatsapp133_save')throw Error('Unknown WhatsApp settings action');
 if(!['all','owner'].includes(body.scope))throw Error('Choose all owners or one owner.');
 if(body.scope==='all'){if(typeof body.enabled!=='boolean')throw Error('Choose whether WhatsApp is enabled.');settings.enabled=body.enabled}
 else {
  const id=String(body.owner_id||'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw Error('Choose an owner.');
  const owners=await deps.supa(`owners?workspace_id=eq.${encodeURIComponent(workspace)}&id=eq.${encodeURIComponent(id)}&select=id`);if(!owners?.length)throw Error('Owner not found in this workspace.');
  if(body.enabled===null)delete settings.owners[id];else if(typeof body.enabled==='boolean')settings.owners[id]=body.enabled;else throw Error('Choose a WhatsApp preference.');
 }
 await deps.authAdmin(`users/${user.id}`,{method:'PUT',body:JSON.stringify({user_metadata:{...meta,mr4u_whatsapp133:{...all,[String(workspace)]:settings}}})});
 return {ok:true,settings};
}
module.exports={handle,clean};
