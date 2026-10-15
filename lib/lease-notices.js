const {supa}=require('./core'),model=require('../assets/lease-notice-model');
const enc=encodeURIComponent;
async function list(wid,access={}){
 const q=`workspace_id=eq.${enc(wid)}&select=*`;
 const [tenants,contracts,plans,prefs,units,links,buildings,owners]=await Promise.all(['tenants','contract_intakes','lease_notice_plans','lease_notice_preferences','units','tenant_units','buildings','owners'].map(t=>supa(`${t}?${q}`)));
 let visible=tenants||[];
 if(access.scope==='buildings'){
  const buildings=new Set((access.building_ids||[]).map(String)),allowed=new Set((units||[]).filter(u=>buildings.has(String(u.building_id))).map(u=>String(u.id)));
  visible=visible.filter(t=>{const ids=[...(links||[]).filter(l=>String(l.tenant_id)===String(t.id)).map(l=>String(l.unit_id)),...(t.unit_id?[String(t.unit_id)]:[])];return ids.length&&ids.every(id=>allowed.has(id))});
 }
 const preferences=prefs?.[0]||{enabled:true,buffer_months:1};
 const context=t=>{const tu=(units||[]).filter(u=>String(u.id)===String(t.unit_id)||(links||[]).some(l=>String(l.tenant_id)===String(t.id)&&String(l.unit_id)===String(u.id))),bs=(buildings||[]).filter(b=>tu.some(u=>String(u.building_id)===String(b.id))),os=(owners||[]).filter(o=>bs.some(b=>String(b.owner_id)===String(o.id)));return {tenant_email:t.email||'',tenant_address:bs.length===1?[bs[0].address,bs[0].postal_code,bs[0].city].filter(Boolean).join(', '):'',property:bs.map(b=>[b.address,...tu.filter(u=>String(u.building_id)===String(b.id)).map(u=>'unit '+u.unit_number)].filter(Boolean).join(', ')).join('; '),landlord_name:os.length===1?os[0].name:'',landlord_address:os.length===1?[os[0].address,os[0].postal_code,os[0].city].filter(Boolean).join(', '):''}};
 return {preferences,models:visible.filter(t=>t.active!==false&&t.tenancy_type!=='short_stay').map(t=>({...context(t),...model.model(t,contracts||[],{buffer_months:preferences.buffer_months,...(plans||[]).find(p=>String(p.tenant_id)===String(t.id)),enabled:preferences.enabled===false?false:(plans||[]).find(p=>String(p.tenant_id)===String(t.id))?.enabled!==false})}))};
}
async function save(wid,input){
 const n=(v,min,max,label)=>{const x=Number(v);if(!Number.isInteger(x)||x<min||x>max)throw Error('Enter a valid '+label);return x};
 const p={workspace_id:wid,tenant_id:n(input.tenant_id,1,Number.MAX_SAFE_INTEGER,'tenant'),region:['unknown','flanders','brussels','wallonia','other'].includes(input.region)?input.region:'unknown',lease_kind:['short','nine_year','review'].includes(input.lease_kind)?input.lease_kind:'review',primary_residence:input.primary_residence===true,notice_months:n(input.notice_months||6,1,24,'notice period'),buffer_months:n(input.buffer_months||1,1,12,'preparation buffer'),enabled:input.enabled!==false,service_reference:String(input.service_reference||'').slice(0,500),updated_at:new Date().toISOString()};
 for(const k of ['signed_date','start_date','end_date','notice_served_at','notice_end_date']){if(input[k]&&!model.valid(input[k]))throw Error('Enter a valid '+k.replaceAll('_',' '));p[k]=input[k]||null;}
 if(p.start_date&&p.end_date&&p.end_date<=p.start_date)throw Error('Contract end must be after its start');
 if(p.notice_served_at&&(!p.notice_end_date||!p.service_reference.trim()))throw Error('Record the expiry date and delivery evidence/reference before marking notice served');
 if(p.notice_served_at&&p.notice_served_at>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Brussels'}))throw Error('The served date cannot be in the future');
 return (await supa('lease_notice_plans?on_conflict=workspace_id,tenant_id',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',body:JSON.stringify(p)}))?.[0];
}
module.exports={list,save};
