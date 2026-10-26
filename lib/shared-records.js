// A capability grants a read snapshot only. Never return raw database rows or action tokens.
const {supa}=require('./core');
const enc=encodeURIComponent, same=(a,b)=>String(a)===String(b), ids=rows=>[...new Set(rows.map(x=>String(x.id)))];
const FIELDS={
 owner:'name email phone address city postal_code country company vat_number language',
 building:'name address city postal_code country construction_year total_units notes',
 unit:'name building_name property_address unit_number floor type bedrooms bathrooms surface area status description monthly_rent rent epc_label',
 tenant:'name first_name last_name surname secondary_email email phone language communication_language tenancy_type active base_rent current_rent rent monthly_rent additional_costs additional_cost_items rent_due_day iban payment_reference contract_signed_date tenancy_start_date contract_end_date contract_duration_type contract_duration_months indexation_enabled epc_label check_in_date check_out_date stay_price stay_status nationality date_of_birth guarantor_name guarantor_email guarantor_phone',
 payment:'year month expected_amount due_date status paid_amount is_historical',
 entry:'amount payment_date method reference notes',
 adjustment:'adjustment_type amount reason adjustment_date status year month',
 indexation:'old_rent new_rent effective_date status base_index new_index',
 utility:'utility_type ean ean_code meter_number scope supplier contract_number description',
 reading:'reading_date date value reading_value consumption notes',
 tariff:'start_date end_date effective_date rate unit_price fixed_cost price unit',
 contract:'status tenant_name first_name surname email phone lease_start_date lease_end_date contract_signed_date signature_date start_date end_date monthly_rent rent deposit deposit_amount duration_type duration_months epc_label address city postal_code',
 message:'direction to_recipients cc_recipients subject body sender_name sender_email status created_at sent_at',
 reminder:'subject body frequency next_run_at status enabled',
 task:'title description visibility assignee status due_date',
 repair:'title description category priority status contractor_name visit_start visit_end quote_labor quote_parts quote_includes_vat approval_status',
 expense:'date expense_date category description amount reference status',
 bank:'label account_holder iban bic is_default',
 report:'year month period status sent_at created_at',
};
function pick(row,kind){const picked=Object.fromEntries(FIELDS[kind].split(' ').filter(k=>row?.[k]!==undefined&&row[k]!==null&&row[k]!=='').map(k=>[k,row[k]]));if(kind==='message'&&picked.body)picked.body=String(picked.body).replace(/\n?__MR4U_[A-Z_]+:[\s\S]*?__/g,'').trim();return picked;}
function fail(message,status=404){const e=new Error(message);e.status=status;throw e;}
async function snapshot(wid,type,id,{allowedBuildings=null,internal=false}={}){
 if(!['owner','building','tenant'].includes(type)||!/^\d+$/.test(String(id)))fail('Choose a valid shared record',400);
 const notices=[],missing=new Set();
 const rows=async(table,filter='',optional=false)=>{try{const all=[];for(let offset=0;;offset+=1000){const page=await supa(`${table}?workspace_id=eq.${enc(wid)}${filter}&select=*&order=id.asc&limit=1000&offset=${offset}`)||[];all.push(...page);if(page.length<1000)return all}}catch(e){if(optional&&/does not exist|could not find.*table|schema cache|PGRST205|42P01/i.test(e.message)){missing.add(table);return []}throw e}};
 const eq=(k,v)=>`&${k}=eq.${enc(v)}`,inList=(k,values)=>`&${k}=in.(${values.map(enc).join(',')})`;
 const by=async(table,k,values,optional=false)=>values.length?rows(table,inList(k,values),optional):[];
 const table={owner:'owners',building:'buildings',tenant:'tenants'}[type];
 const root=(await rows(table,eq('id',id)))[0];if(!root)fail('This record is unavailable');
 let owners=[],buildings=[],units=[],tenants=[],links=[];
 if(type==='owner'){
  owners=[root];buildings=await rows('buildings',eq('owner_id',id));
  if(allowedBuildings&&buildings.some(b=>!allowedBuildings.has(String(b.id))))fail('This owner is outside your permitted properties',403);
 }else if(type==='building')buildings=[root];
 if(type!=='tenant'){
  if(allowedBuildings&&buildings.some(b=>!allowedBuildings.has(String(b.id))))fail('This building is outside your permitted properties',403);
  units=await by('units','building_id',ids(buildings));links=await by('tenant_units','unit_id',ids(units));
  const [linked,direct]=await Promise.all([by('tenants','id',[...new Set(links.map(l=>String(l.tenant_id)))]),by('tenants','unit_id',ids(units))]);
  tenants=[...new Map([...linked,...direct].map(t=>[String(t.id),t])).values()];
 }else{
  tenants=[root];links=await rows('tenant_units',eq('tenant_id',id));
  units=await by('units','id',[...new Set([...links.map(l=>String(l.unit_id)),...(root.unit_id?[String(root.unit_id)]:[])])]);
  if(allowedBuildings&&(!units.length||units.some(u=>!allowedBuildings.has(String(u.building_id)))))fail('This tenant is outside your permitted properties',403);
 }
 const contextBuildings=type==='tenant'?await by('buildings','id',[...new Set(units.map(u=>String(u.building_id)))]):buildings;
 units=units.map(u=>{const b=contextBuildings.find(b=>same(b.id,u.building_id));return {...u,building_name:b?.name,property_address:b?[b.address,b.postal_code,b.city].filter(Boolean).join(', '):undefined}});
 // A tenant may rent units outside this share. Hide tenant-wide finance/messages in that case.
 const allLinks=await by('tenant_units','tenant_id',ids(tenants));
 const scopedUnits=new Set(ids(units)),mixed=new Set();
 for(const t of tenants)if(type!=='tenant'&&[...allLinks.filter(l=>same(l.tenant_id,t.id)).map(l=>String(l.unit_id)),...(t.unit_id?[String(t.unit_id)]:[])].some(uid=>!scopedUnits.has(uid)))mixed.add(String(t.id));
 if(mixed.size)notices.push('Some tenants also rent properties outside this share. Their combined accounts, contracts and messages are private; only the shared property context is shown.');
 const tids=ids(tenants).filter(t=>!mixed.has(t)),bids=ids(buildings),uids=ids(units),oids=ids(owners);
 const [payments,adjustments,indexations,contracts,messages,reminders,bank,tasks,ownerMessages,reports,expenses,buildingUtilities,unitUtilities,repairJobs]=await Promise.all([
  by('payments','tenant_id',tids),by('tenant_adjustments','tenant_id',tids),by('tenant_indexations','tenant_id',tids,true),
  by('contract_intakes','tenant_id',tids,true),by('tenant_messages','tenant_id',tids,true),by('tenant_reminders','tenant_id',tids,true),
  by('owner_bank_accounts','owner_id',oids,true),by('owner_tasks','owner_id',oids,true),by('owner_messages','owner_id',oids,true),by('owner_rent_reports','owner_id',oids,true),
  by('expense_records','building_id',bids,true),by('utility_ean_codes','building_id',bids,true),by('utility_ean_codes','unit_id',uids,true),by('maintenance_jobs77','building_id',bids,true)
 ]);
 // Tenant shares expose only unit utilities, never a whole building or its other tenants.
 const utilities=[...new Map([...buildingUtilities,...unitUtilities].filter(u=>!u.unit_id||scopedUnits.has(String(u.unit_id))).map(u=>[String(u.id),u])).values()];
 const [entries,readings,tariffs]=await Promise.all([by('payment_entries','payment_id',ids(payments)),by('meter_readings','utility_id',ids(utilities),true),by('utility_tariffs','utility_id',ids(utilities),true)]);
 const records={},key=(kind,row)=>`${kind}:${row.id}`;
 const card=(kind,row,label)=>({values:pick(row,kind),...(label?{label}:{}),...(records[key(kind,row)]?{target:key(kind,row)}:{})});
 const section=(key,title,items,note)=>({key,title,items,...(note?{note}:{})});
 const add=(kind,row)=>records[key(kind,row)]={key:key(kind,row),type:kind,title:row.name||row.unit_number&&`Unit ${row.unit_number}`||`${kind} ${row.id}`,sections:[],summary:[]};
 for(const [kind,list]of [['owner',owners],['building',buildings],['unit',units],['tenant',tenants],['utility',utilities],['payment',payments]])for(const row of list)add(kind,row);
 const paySections=ps=>{
  const pids=new Set(ids(ps));return [section('payments','Monthly accounts',ps.map(p=>card('payment',p,`${p.month}/${p.year}`))),section('entries','Recorded payments',entries.filter(e=>pids.has(String(e.payment_id))).map(e=>card('entry',e))),section('adjustments','Charges & credits',adjustments.filter(a=>pids.has(String(a.payment_id))).map(a=>card('adjustment',a)))];
 };
 const statementModels=new Map(),accountRows=new Map();
 for(const t of tenants){if(mixed.has(String(t.id)))continue;const tu=units.filter(u=>same(t.unit_id,u.id)||links.some(l=>same(l.tenant_id,t.id)&&same(l.unit_id,u.id))),ps=payments.filter(p=>same(p.tenant_id,t.id));const m=require('./statements').buildModel(t,ps,entries,adjustments,tu,buildings);statementModels.set(String(t.id),m);m.rows.forEach(r=>accountRows.set(String(r.id),r));}
 const sum=ps=>{const rs=ps.map(p=>accountRows.get(String(p.id))||(()=>{const ads=adjustments.filter(a=>same(a.payment_id,p.id)&&a.status!=='rejected'),due=Math.max(0,Number(p.expected_amount||0)+ads.reduce((n,a)=>n+(a.adjustment_type==='charge'?1:-1)*Number(a.amount||0),0)),paid=entries.filter(e=>same(e.payment_id,p.id)).reduce((n,e)=>n+Number(e.amount||0),0);return {due,paid,bal:Math.max(0,due-paid),credit:Math.max(0,paid-due)}})());return [['Total due','due'],['Paid','paid'],['Outstanding','bal'],['Credit','credit']].map(([label,k])=>({label,value:Math.round(rs.reduce((n,r)=>n+Number(r[k]||0),0)*100)/100,money:true}));};
 for(const t of tenants){
  const r=records[key('tenant',t)],tu=units.filter(u=>same(t.unit_id,u.id)||links.some(l=>same(l.tenant_id,t.id)&&same(l.unit_id,u.id))),ps=payments.filter(p=>same(p.tenant_id,t.id));
  r.summary=mixed.has(String(t.id))?[]:sum(ps);if(statementModels.has(String(t.id)))r.statement=statementModels.get(String(t.id));
  r.sections=[section('overview','Overview',[card('tenant',mixed.has(String(t.id))?{name:t.name,email:t.email,phone:t.phone,tenancy_type:t.tenancy_type,active:t.active}:t)]),...paySections(ps),section('indexation','Indexation',indexations.filter(x=>same(x.tenant_id,t.id)).map(x=>card('indexation',x))),section('messages','Messages',messages.filter(x=>same(x.tenant_id,t.id)&&!x.deleted_at).map(x=>card('message',x))),section('reminders','Reminders',reminders.filter(x=>same(x.tenant_id,t.id)).map(x=>card('reminder',x))),section('units','Units',tu.map(u=>card('unit',u))),section('utilities','Utilities',utilities.filter(u=>tu.some(x=>same(x.id,u.unit_id))).map(u=>card('utility',u))),section('contracts','Contracts',contracts.filter(x=>same(x.tenant_id,t.id)).map(x=>card('contract',x))),section('maintenance','Maintenance',repairJobs.filter(r=>!r.deleted_at&&(internal||r.shared_with_owner)&&((r.tenant_id&&same(r.tenant_id,t.id))||(!r.tenant_id&&tu.some(u=>same(u.id,r.unit_id))))).map(r=>card('repair',r)),'Only shared repair details are shown. Internal management notes remain private.')];
  if(t.tenancy_type==='short_stay'&&!mixed.has(String(t.id)))r.sections.splice(1,0,section('stay','Stay overview',[card('tenant',t)]));
 }
 for(const u of units){const r=records[key('unit',u)];r.sections=[section('overview','Unit details',[card('unit',u)]),section('tenants','Tenants',tenants.filter(t=>same(t.unit_id,u.id)||links.some(l=>same(l.tenant_id,t.id)&&same(l.unit_id,u.id))).map(t=>card('tenant',{id:t.id,name:t.name,email:t.email,phone:t.phone}))),section('utilities','Utilities',utilities.filter(x=>same(x.unit_id,u.id)).map(x=>card('utility',x)))];}
 for(const b of buildings){const r=records[key('building',b)],bu=units.filter(u=>same(u.building_id,b.id)),bt=tenants.filter(t=>bu.some(u=>same(u.id,t.unit_id)||links.some(l=>same(l.unit_id,u.id)&&same(l.tenant_id,t.id)))),ps=payments.filter(p=>bt.some(t=>same(t.id,p.tenant_id)));r.summary=[{label:'Units',value:bu.length},{label:'Tenants',value:bt.length},...sum(ps)];r.sections=[section('overview','Overview',[card('building',b)]),section('units','Units',bu.map(u=>card('unit',u))),section('tenants','Tenants',bt.map(t=>card('tenant',{id:t.id,name:t.name,email:t.email,phone:t.phone}))),...paySections(ps),section('utilities','Utilities',utilities.filter(u=>same(u.building_id,b.id)||bu.some(x=>same(x.id,u.unit_id))).map(x=>card('utility',x))),section('maintenance','Maintenance',repairJobs.filter(r=>!r.deleted_at&&same(r.building_id,b.id)&&(internal||r.shared_with_owner)).map(r=>card('repair',r)),'Only shared repair details are shown. Internal management notes remain private.'),section('reports','Reports / expenses',expenses.filter(x=>same(x.building_id,b.id)).map(x=>card('expense',x)))];}
 for(const o of owners){const r=records[key('owner',o)];r.summary=[{label:'Buildings',value:buildings.length},{label:'Tenants',value:tenants.length},...sum(payments)];r.sections=[section('overview','Overview',[card('owner',o)]),section('tasks','Tasks',tasks.filter(x=>!x.deleted_at&&(internal||x.visibility==='shared')).map(x=>card('task',x)),internal?undefined:'Only tasks shared with the owner are shown. Internal management tasks remain private.'),section('messages','Messages',ownerMessages.filter(x=>!x.deleted_at&&(internal||!x.context_task_id||tasks.some(t=>same(t.id,x.context_task_id)&&t.visibility==='shared'))).map(x=>card('message',x))),section('rentStatus','Rent status',reports.filter(x=>!x.deleted_at).map(x=>card('report',x))),section('buildings','Buildings',buildings.map(x=>card('building',x))),section('units','Units',units.map(x=>card('unit',x))),section('tenants','Tenants',tenants.map(t=>card('tenant',{id:t.id,name:t.name,email:t.email,phone:t.phone}))),...paySections(payments),section('bank','Banking',bank.map(x=>card('bank',x)),'Rent payment bank details. Bank connection controls are private.'),section('settings','Owner details',[card('owner',o)])];}
 for(const p of payments){const r=records[key('payment',p)],t=tenants.find(t=>same(t.id,p.tenant_id));r.title=`${t?.name||'Rent account'} · ${p.month}/${p.year}`;r.summary=sum([p]);const model=statementModels.get(String(p.tenant_id));if(model)r.statement={...model,rows:model.rows.filter(x=>same(x.id,p.id))};r.sections=[section('overview','Monthly account',[card('payment',p)]),section('entries','Recorded payments',entries.filter(x=>same(x.payment_id,p.id)).map(x=>card('entry',x))),section('adjustments','Charges & credits',adjustments.filter(x=>same(x.payment_id,p.id)).map(x=>card('adjustment',x)))];}
 for(const u of utilities){const r=records[key('utility',u)];r.title=u.utility_type||'Utility';r.sections=[section('overview','Utility details',[card('utility',u)]),section('readings','Meter readings',readings.filter(x=>same(x.utility_id,u.id)).map(x=>card('reading',x))),section('tariffs','Tariffs',tariffs.filter(x=>same(x.utility_id,u.id)).map(x=>card('tariff',x)))];}
 // Uploaded originals and utility handovers follow the same record boundary.
 const [tenantDocs,unitDocs,rawHandovers]=await Promise.all([by('property_documents','tenant_id',tids,true),by('property_documents','unit_id',uids,true),by('utility_handovers','unit_id',uids,true)]);
 const handovers=rawHandovers.filter(h=>!h.deleted_at&&(type!=='tenant'||same(h.incoming_tenant_id,id)||same(h.outgoing_tenant_id,id))),hids=new Set(ids(handovers));
 const docs=[...new Map([...tenantDocs,...unitDocs].filter(d=>d.state==='ready'&&!d.deleted_at&&(d.handover_id?hids.has(String(d.handover_id)):tids.includes(String(d.tenant_id)))).map(d=>[String(d.id),d])).values()];
 for(const record of Object.values(records))if(['owner','building','unit','tenant'].includes(record.type)){
  const rid=record.key.split(':')[1],ru=record.type==='unit'?units.filter(u=>same(u.id,rid)):record.type==='building'?units.filter(u=>same(u.building_id,rid)):record.type==='tenant'?units.filter(u=>tenants.some(t=>same(t.id,rid)&&(same(t.unit_id,u.id)||links.some(l=>same(l.tenant_id,rid)&&same(l.unit_id,u.id))))):units;
  const rt=record.type==='tenant'?[rid]:record.type==='owner'?tids:tenants.filter(t=>ru.some(u=>same(t.unit_id,u.id)||links.some(l=>same(l.tenant_id,t.id)&&same(l.unit_id,u.id)))).map(t=>String(t.id));
  const hs=handovers.filter(h=>ru.some(u=>same(u.id,h.unit_id))&&(record.type!=='tenant'||same(h.incoming_tenant_id,rid)||same(h.outgoing_tenant_id,rid))),hsids=new Set(ids(hs));
  const ds=docs.filter(d=>d.handover_id?hsids.has(String(d.handover_id)):rt.includes(String(d.tenant_id)));
  record.sections.push(section('documents','Signed documents',ds.map(d=>({document_id:d.id,values:{document_type:d.category,title:d.title,file_name:d.file_name,uploaded_at:d.completed_at}}))),section('handover','Utility takeover',hs.map(h=>({values:{handover_date:h.handover_date,region:h.region,outgoing:h.snapshot.outgoing.name,incoming:h.snapshot.incoming.name,property:h.snapshot.property,meters:h.snapshot.meters}}))));
 }
 if(missing.size)notices.push('Some optional sections are unavailable because their setup has not been installed: '+[...missing].join(', ')+'.');
 return {root:key(type,root),records,notices,read_only:true};
}
module.exports={snapshot};
