'use strict';
const {supa}=require('./core'),enc=encodeURIComponent;
async function mark(wid,oid,id,column){if(!['email_opened_at','report_viewed_at','replied_at'].includes(column)||!wid||!oid||!id)return;return supa(`owner_rent_reports?id=eq.${enc(id)}&workspace_id=eq.${enc(wid)}&owner_id=eq.${enc(oid)}&${column}=is.null`,{method:'PATCH',body:JSON.stringify({[column]:new Date().toISOString()})})}
async function emailOpen(token){if(!/^[a-f0-9]{48}$/.test(String(token||'')))return;const m=(await supa(`owner_messages?tracking_token=eq.${enc(token)}&report_id=not.is.null&direction=eq.outgoing&select=workspace_id,owner_id,report_id&limit=1`))?.[0];if(m)await mark(m.workspace_id,m.owner_id,m.report_id,'email_opened_at')}
async function providerOpen(providerId,type){if(type!=='email.opened'||!providerId)return;const r=(await supa(`owner_rent_reports?provider_id=eq.${enc(providerId)}&select=id,workspace_id,owner_id&limit=1`))?.[0];if(r)await mark(r.workspace_id,r.owner_id,r.id,'email_opened_at')}
module.exports={mark,emailOpen,providerOpen};
