'use strict';
const docs=require('./property-documents'),statements=require('./statements'),postal=require('../assets/address-model'),flow=require('../assets/tenant-flow-model95'),lease=require('../assets/lease-notice-model');
const order=require('./property-order150');
const enc=encodeURIComponent,round=n=>Math.round(Number(n||0)*100)/100;
function model({tenant,units=[],buildings=[],owners=[],contracts=[],payments=[],entries=[],adjustments=[],dateFormat='DD/MM/YYYY',generatedAt=new Date().toISOString()}){
 const linked=lease.contract({...tenant,stay_notes:[tenant.stay_notes,tenant.notes].filter(Boolean).join(' ')},contracts),short=tenant.tenancy_type==='short_stay',start=short?tenant.check_in_date:linked.start_date,end=short?tenant.check_out_date:linked.end_date;
 const t={...tenant,tenancy_start_date:start||'',contract_end_date:end||''},accounts=statements.buildModel(t,payments.filter(p=>+p.month>=1&&+p.month<=12&&+p.year>0).sort((a,b)=>a.year-b.year||a.month-b.month),entries,adjustments,units,buildings).rows;
 const costs=flow.costItems(t),monthly=flow.monthly(t),fixed=round(costs.filter(c=>c.mode!=='variable').reduce((n,c)=>n+Number(c.amount||0),0)),rows=accounts.map(r=>({...r,charges:r.chargesTotal,credits:r.creditsApplied})),sum=k=>round(rows.reduce((n,r)=>n+Number(r[k]||0),0));
 const properties=[...units].sort((a,b)=>order.compareUnits(a,b,buildings)).map(u=>{const b=buildings.find(b=>String(b.id)===String(u.building_id));const a=postal.read(b||{}),unit=String(u.unit_number||u.number||u.name||u.id);return {label:[b?.name,'Unit '+unit].filter(Boolean).join(' · '),address:postal.format(b||{})||b?.address||'Not recorded',addressLines:[[postal.street(a),'Unit '+unit].filter(Boolean).join(', '),[[a.postal_code,a.city].filter(Boolean).join(' '),a.country].filter(Boolean).join(', ')].filter(Boolean)}}),ownerNames=[...new Set(buildings.map(b=>owners.find(o=>String(o.id)===String(b.owner_id))?.name).filter(Boolean))];
 let months=0;if(lease.valid(start)&&lease.valid(end)&&!short){for(let n=1;n<=1200;n++){const candidate=lease.dayBefore(lease.shift(start,n));if(candidate===end){months=n;break}if(candidate>end)break}}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(generatedAt));
 const overdue=round(rows.filter(r=>r.due_date&&r.due_date<today).reduce((n,r)=>n+Number(r.bal||0),0));
 const receipts=rows.flatMap(r=>r.entries.map(e=>({...e,period:r.month}))).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 return {deposit:require('../assets/security-deposit146').read(t),name:t.name||'Tenant',email:t.email||'Not recorded',phone:t.phone||'Not recorded',contactAddress:postal.format(t),properties,owner:ownerNames.join(', ')||'Not recorded',start:start||'',end:end||'',openEnded:linked.duration_type==='open',ended:t.ended_at||'',short,base:round(monthly-fixed),costs,monthly,stayPrice:round(t.stay_price),leaseTotal:months?round(monthly*months):null,months,rows,receipts,totals:{charges:sum('charges'),credits:sum('credits'),due:sum('due'),paid:sum('paid'),outstanding:sum('bal'),overdue,credit:sum('credit')},dateFormat,generatedAt};
}
async function load(req,id){return loadContext(await docs.ctx(req,false),id)}
async function loadContext(c,id){const {tenant,units}=await docs.tenantAccess(c,id),ids=[...new Set(units.map(u=>u.building_id))],buildings=ids.length?await docs.rows(c.wid,'buildings','&id=in.('+ids.map(enc).join(',')+')'):[],ownerIds=[...new Set(buildings.map(b=>b.owner_id).filter(Boolean))];
 const [owners,contracts,payments,adjustments,workspace]=await Promise.all([ownerIds.length?docs.rows(c.wid,'owners','&id=in.('+ownerIds.map(enc).join(',')+')'):[],docs.rows(c.wid,'contract_intakes','&tenant_id=eq.'+enc(tenant.id)),docs.rows(c.wid,'payments','&tenant_id=eq.'+enc(tenant.id)),docs.rows(c.wid,'tenant_adjustments','&tenant_id=eq.'+enc(tenant.id)),require('./core').supa('workspaces?id=eq.'+enc(c.wid)+'&select=date_format')]);
 const entries=[];for(let i=0;i<payments.length;i+=100)entries.push(...await docs.rows(c.wid,'payment_entries','&payment_id=in.('+payments.slice(i,i+100).map(p=>enc(p.id)).join(',')+')'));
 return model({tenant,units,buildings,owners,contracts,payments,entries,adjustments,dateFormat:workspace[0]?.date_format||'DD/MM/YYYY'});
}
async function download(req,b){if(req.method!=='POST')throw Error('POST required');const m=await load(req,b.tenant_id);m.options=options(b.options);const bytes=await require('./tenant-overview-pdf144').build(m);return {ok:true,filename:'Tenant-overview-'+m.name.replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').slice(0,70)+'.pdf',content:Buffer.from(bytes).toString('base64'),mime_type:'application/pdf'};}
async function ownerDownload(req,b){
 if(req.method!=='POST')throw Error('POST required');
 const ownerCtx=await require('./owner-collaboration').ownerAccess(req,b.owner_id,'read'),c=await docs.ctx(req,false);if(String(c.wid)!==String(ownerCtx.wid))throw Error('Workspace changed. Reopen this owner.');
 const buildings=await docs.rows(c.wid,'buildings','&owner_id=eq.'+enc(ownerCtx.owner.id)),bids=buildings.map(x=>x.id),units=bids.length?await docs.rows(c.wid,'units','&building_id=in.('+bids.map(enc).join(',')+')'):[],uids=new Set(units.map(x=>String(x.id)));
 const links=units.length?await docs.rows(c.wid,'tenant_units','&unit_id=in.('+units.map(x=>enc(x.id)).join(',')+')'):[],linked=new Set(links.map(x=>String(x.tenant_id))),tenants=(await docs.rows(c.wid,'tenants')).filter(t=>uids.has(String(t.unit_id))||linked.has(String(t.id)));
 if(!tenants.length)throw Error('No tenants are linked to this owner’s properties.');
 const models=[],generatedAt=new Date().toISOString();for(const tenant of order.orderTenants(tenants,units,buildings,links)){const m=await loadContext(c,tenant.id);m.generatedAt=generatedAt;m.options=options(b.options);models.push(m)}
 const bytes=await require('./tenant-overview-pdf144').combine(models,ownerCtx.owner.name);
 return {ok:true,filename:'Tenant-overviews-'+String(ownerCtx.owner.name||'Owner').replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').slice(0,70)+'.pdf',content:Buffer.from(bytes).toString('base64'),mime_type:'application/pdf',tenant_count:tenants.length};
}
function options(v={}){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Choose report sections.');const out={details:v.details!==false,monthly:v.monthly!==false,receipts:v.receipts===true};if(!out.details&&!out.monthly&&!out.receipts)throw Error('Select at least one report section.');return out}
module.exports={model,load,download,ownerDownload,options};
