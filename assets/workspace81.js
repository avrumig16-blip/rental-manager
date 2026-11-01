/* Connected workspaces from the approved tenant and document references. */
(function(){'use strict';
const h=React.createElement,{useState:use,useEffect:effect,useRef:ref}=React,same=(a,b)=>String(a)===String(b),

ic=(name,size=18)=>h(StudioIcon,{name,size}),

children=n=>React.Children.toArray(n?.props?.children),

cls=(n,c)=>String(n?.props?.className||'').split(' ').includes(c);


const modelBase81=tenantStatementModel;tenantStatementModel=function(t,db,selected){const m=modelBase81(t,db,selected),banks=tenantPaymentBanks(t,db),defaults=banks.filter(b=>b.is_default),bank=defaults.length===1?defaults[0]:banks.length===1?banks[0]:null;return {...m,bank:bank?.iban?bank:null,rows:m.rows.map(r=>{const p=db.payments.find(p=>same(p.id,r.id));const period=p?String(p.year)+'-'+String(p.month).padStart(2,'0')+'-01':'';return {...r,...MR4UStatementModel.breakdown(r),period_start:period,due_date:p?.due_date||(period?period.slice(0,8)+String(rentDueDay(t)||1).padStart(2,'0'):'')}})}};
const btn=(text,fn,primary=false,disabled=false,icon)=>h('button',{type:'button',className:primary?'primary':'',onClick:fn,disabled},icon&&ic(icon),

text),

card=(title,body,action)=>h('section',{className:'w81-card'},h('header',null,h('h3',null,title),

action),

body),

empty=text=>h('p',{className:'w81-empty'},text),

status=r=>MR4UStatementModel.breakdown(r).settlementStatus,badge=r=>h('span',{className:'w81-badge '+(r.bal<=.005?'paid':r.paid>.005?'partial':'unpaid')},status(r));


const property=(t,db)=>unitsForTenant(db,t.id).map(u=>{const b=db.buildings.find(b=>same(b.id,u.building_id));

return [b?.name||b?.address,u.unit_number?'Unit '+u.unit_number:u.name].filter(Boolean).join(' · ')}).join(', ');


function useDialog(node,close,busy=false){const latest=ref({close,busy});

latest.current={close,busy};effect(()=>{const previous=document.activeElement,e=node.current;if(!e)return;const items=()=>[...e.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);

items()[0]?.focus();

const key=ev=>{if(ev.key==='Escape'&&!latest.current.busy){ev.stopPropagation();

latest.current.close()}if(ev.key==='Tab'){const a=items();

if(ev.shiftKey&&document.activeElement===a[0]){ev.preventDefault();

a.at(-1)?.focus()}else if(!ev.shiftKey&&document.activeElement===a.at(-1)){ev.preventDefault();

a[0]?.focus()}}};e.addEventListener('keydown',key);

return()=>{e.removeEventListener('keydown',key);

if(previous?.isConnected)previous.focus()}},[])}
function Charges({row}){return h('table',{className:'w81-table'},h('thead',null,h('tr',null,h('th',null,'Description'),

h('th',null,'Amount'))),

h('tbody',null,...[{reason:row.rentLabel||'Rent',amount:row.rent,type:'rent'},...row.details].map((d,i)=>h('tr',{key:i},h('td',null,d.reason,d.type==='credit'&&h('small',null,'Credit')),

h('td',{className:d.type==='credit'?'positive':''},(d.type==='credit'?'− ':'')+eur(d.amount)))),

h('tr',{className:'total'},h('td',null,'Total due'),

h('td',null,eur(row.due)))))}
function Received({row,onDetails}){return row.entries.length?h('table',{className:'w81-table'},h('thead',null,h('tr',null,...['Date','Method','Amount',...(onDetails?['']:[])].map((x,i)=>h('th',{key:i},x)))),

h('tbody',null,...row.entries.map((e,i)=>h('tr',{key:i},h('td',null,fmtDate(e.date)),

h('td',null,({bank:'Bank transfer',cash:'Cash',manual:'Manual'})[e.method]||e.method||'Recorded payment'),

h('td',{className:'positive'},eur(e.amount)),

onDetails&&h('td',null,btn('View details',()=>onDetails(e),

false,false,'arrowRight')))))):empty('No payments recorded for this account.')}
function Preview({model,onClose}){return h(MR4U69.Dialog69,{title:'Rent statement',onClose},h('div',{className:'w81-pdf-preview'},btn('Download PDF',()=>downloadPaymentStatementPdf(model),

false,false,'download'),

h(StatementDocument73,{model})))}
window.TenantStatementPanel=function TenantPayments81({tenant,db,setModal}){
 const model=tenantStatementModel(tenant,db),

years=[...new Set(model.rows.map(r=>String(db.payments.find(p=>same(p.id,r.id))?.year)))].sort().reverse(),

[year,setYear]=use(years[0]||'all'),

[filter,setFilter]=use('All'),

[query,setQuery]=use(''),

[chosen,setChosen]=use(String(model.rows[0]?.id||'')),

[composer,setComposer]=use(null),

[history,setHistory]=use(false),

[record,setRecord]=use(null),

[deleting,setDeleting]=use(false);


 const inYear=model.rows.filter(r=>year==='all'||same(db.payments.find(p=>same(p.id,r.id))?.year,year)),

rows=inYear.filter(r=>(filter==='All'||status(r)===filter)&&[r.month,r.reference].join(' ').toLowerCase().includes(query.toLowerCase())),

row=rows.find(r=>same(r.id,chosen))||rows[0],total=k=>inYear.reduce((n,r)=>n+Number(r[k]||0),

0),

payment=row&&db.payments.find(p=>same(p.id,row.id)),

one=row&&{...model,rows:[row]},open=()=>setModal({type:'paymentAccount',item:payment,parent:{type:'tenantProfile',item:tenant,tab:'payments'}});


 async function remove(){if(!payment||deleting)return;setDeleting(true);

try{if(await deleteMonthlyRentAccount79({payment,tenant,db}))setChosen('')}catch(e){appAlert(e.message)}finally{setDeleting(false)}}
 return h('section',{className:'w81-tenant-ledger'},h('div',{className:'w81-metrics'},...[['Total charges','chargesTotal','file'],['Credits applied','creditsApplied','check'],['Payments received','paid','card'],['Outstanding','bal','clock']].map(([label,key,icon])=>h('article',{key},h('div',null,h('small',null,label),

h('strong',null,eur(total(key)))),

h('span',null,ic(icon,24))))),

h('div',{className:'w81-ledger-layout'},card('Rent accounts',h(React.Fragment,null,h('nav',{className:'w81-tabs','aria-label':'Tenant payment status'},...['All','Paid','Partly paid','Unpaid','Credit'].map(v=>h('button',{key:v,'aria-selected':filter===v,onClick:()=>setFilter(v)},v))),

h('div',{className:'w81-scroll-table'},h('table',{className:'w81-table w81-months'},h('thead',null,h('tr',null,...['Month','Due date','Total due','Paid','Balance','Status',''].map((v,i)=>h('th',{key:i},v)))),

h('tbody',null,...rows.map(r=>{const p=db.payments.find(p=>same(p.id,r.id)),

date=p.due_date||`${p.year}-${String(p.month).padStart(2,'0')}-${String(Math.min(28,Number(tenant.rent_due_day||String(tenant.stay_notes||'').match(/__MR4U_DUE_DAY:(\d+)__/)?.[1]||1))).padStart(2,'0')}`;return h('tr',{key:r.id,className:same(r.id,row?.id)?'selected':''},h('td',null,h('button',{className:'w81-cell','aria-label':'Select '+r.month,'aria-pressed':same(r.id,row?.id),

onClick:()=>setChosen(String(r.id))},r.month)),

h('td',null,fmtDate(date)),

h('td',null,eur(r.due)),

h('td',null,eur(r.paid)),

h('td',null,eur(r.credit>.005?-r.credit:r.bal)),

h('td',null,badge(r)),

h('td',null,h(More65,{label:'Actions for '+r.month},btn('Open monthly account',()=>setModal({type:'paymentAccount',item:p,parent:{type:'tenantProfile',item:tenant,tab:'payments'}})),

btn('Send statement',()=>setComposer([String(r.id)]),

false,!canEditWorkspace()),

btn('Download PDF',()=>downloadPaymentStatementPdf({...model,rows:[r]})))))})))),

!rows.length&&empty('No accounts match these filters.'),

h('footer',{className:'w81-ledger-tools'},btn('Add historical month',()=>setHistory(true),

false,!canEditWorkspace(),

'plus'),

h('details',null,h('summary',null,'Thank-you preferences'),

h(TenantReceiptPreferences,{tenant})))),

h('div',{className:'w81-filters'},h('select',{'aria-label':'Payment year',value:year,onChange:e=>setYear(e.target.value)},h('option',{value:'all'},'All years'),

...years.map(v=>h('option',{key:v,value:v},v))),

h('input',{'aria-label':'Search tenant payments',placeholder:'Search months…',value:query,onChange:e=>setQuery(e.target.value)}))),

row&&h('aside',{className:'w81-card w81-month-detail'},h('header',null,h('h3',null,row.month),

badge(row)),

h('div',{className:'w81-outstanding'},h('small',null,row.credit>.005?'Credit balance':'Outstanding amount'),

h('strong',null,eur(row.credit>.005?row.credit:row.bal))),

h('h4',null,'Charges & credits'),

h(Charges,{row}),

h('h4',null,'Payments received'),

h(Received,{row}),

h('div',{className:'w81-balance'},h('b',null,row.credit>.005?'Credit':'Outstanding'),

h('b',null,eur(row.credit>.005?row.credit:row.bal))),

h('div',{className:'w81-stack'},btn('Record payment',()=>setRecord(payment),

true,!canEditWorkspace(),

'plus'),

btn('Send statement',()=>setComposer([String(row.id)]),

false,!canEditWorkspace(),

'mail'),

btn('Open monthly account',open,false,false,'file'),

h('button',{className:'w81-danger',disabled:deleting||!canEditWorkspace(),

onClick:remove},ic('trash'),

deleting?'Deleting…':'Delete monthly account')))),

composer&&h(StatementComposer,{tenant,db,initialSelection:composer,onClose:()=>setComposer(null)}),

history&&h(HistoricalMonthsEditor,{tenant,db,onClose:()=>setHistory(false)}),

record&&h(TenantPaymentModal71,{tenant,db,initialPayment:record,onClose:()=>setRecord(null),

onSaved:()=>setRecord(null)}));


};
const NativeAccount=PaymentAccountModal;
PaymentAccountModal=function MonthlyAccount81(props){const {payment,db,setModal,parent}=props,tenant=db.tenants.find(t=>same(t.id,payment.tenant_id)),

live=db.payments.find(p=>same(p.id,payment.id))||payment,model=tenant&&tenantStatementModel(tenant,db,[live.id]),

row=model?.rows[0];const [tab,setTab]=use('statement'),

[send,setSend]=use(false),

[record,setRecord]=use(false),

[preview,setPreview]=use(false),

[deleting,setDeleting]=use(false),

[entry,setEntry]=use(null),

dialog=ref(null),

close=()=>setModal(parent||null);

useDialog(dialog,close,send||record||preview||!!entry||deleting);

if(!row)return h(NativeAccount,props);

const activity=[...(live.created_at?[[live.created_at,'Monthly account created']]:[]),

...db.payment_entries.filter(e=>same(e.payment_id,live.id)&&e.created_at).map(e=>[e.created_at,'Payment recorded · '+eur(e.amount)]),

...db.tenant_adjustments.filter(a=>same(a.payment_id,live.id)&&a.created_at).map(a=>[a.created_at,(a.adjustment_type==='credit'?'Credit':'Charge')+' · '+a.reason])].sort((a,b)=>a[0].localeCompare(b[0]));


 const timeline=activity.length?h('div',{className:'w81-timeline'},...activity.map(([date,label],i)=>h('div',{key:i},h('i'),

h('span',null,label,h('small',null,fmtDate(date.slice(0,10))))))):empty('No timestamped activity is available for this account.');


 return h(React.Fragment,null,h('div',{className:'modal-bg w81-overlay'},h('section',{className:'w81-account',ref:dialog,role:'dialog','aria-modal':true,'aria-label':'Monthly rent account'},h('header',{className:'w81-modal-head'},h('div',null,h('h2',null,row.month+' · Monthly account'),

h('p',null,tenant.name+' · '+model.units)),

btn('Close',close,false,deleting,'close')),

h('div',{className:'w81-account-scroll'},h('div',{className:'w81-account-summary'},...[[row.credit>.005?'Credit':'Outstanding',row.credit>.005?row.credit:row.bal,'balance'],['Total charges',row.chargesTotal,'charges'],['Credits applied',row.creditsApplied,'credits'],['Payments received',row.paid,'received']].map(([label,value,key])=>h('div',{key},h('small',null,label),

h('strong',null,eur(value)),

key==='balance'&&badge(row)))),

h('nav',{className:'w81-tabs','aria-label':'Monthly account sections'},...[['statement','Statement'],['manage','Payments & charges'],['activity','Activity']].map(([v,l])=>h('button',{key:v,'aria-selected':tab===v,onClick:()=>setTab(v)},l))),

tab==='statement'?h('div',{className:'w81-account-columns'},h('main',null,card('Charges & credits',h(Charges,{row})),

card('Payments received',h(Received,{row,onDetails:setEntry})),

h('div',{className:'w81-balance'},h('b',null,row.credit>.005?'Credit balance':'Outstanding balance'),

h('strong',null,eur(row.credit>.005?row.credit:row.bal)))),

h('aside',null,card('Statement',h(React.Fragment,null,h('div',{className:'w81-file'},ic('file',28),

h('span',null,h('b',null,row.month+' statement.pdf'),

h('small',null,'Generated from the current account'))),

h('div',{className:'w81-actions'},btn('Preview PDF',()=>setPreview(true),

false,false,'eye'),

btn('Download PDF',()=>downloadPaymentStatementPdf(model),

false,false,'download')))),

card('Payment reference',h('div',{className:'w81-reference'},h('span',null,row.reference),

btn('Copy',async()=>{try{await navigator.clipboard.writeText(row.reference);

showSaved('Reference copied')}catch{appAlert('Select and copy the reference text.')}},false,false,'copy'))),

card('Activity',timeline))):tab==='activity'?card('Account activity',timeline):h('div',{className:'a73-management'},h('fieldset',{className:'a73-permission-fieldset',disabled:!canEditWorkspace()},h(window.MonthlyManagement73||NativeAccount,{...props,payment:live})))),

h('footer',{className:'w81-account-footer'},h('button',{className:'w81-danger',disabled:deleting||!canEditWorkspace(),

onClick:async()=>{if(deleting)return;setDeleting(true);

try{if(await deleteMonthlyRentAccount79({payment:live,tenant,db}))close()}catch(e){appAlert(e.message)}finally{setDeleting(false)}}},ic('trash'),

deleting?'Deleting…':'Delete monthly account'),

h('span'),

btn('Print',()=>printStatementDocument73(model),

false,false,'print'),

btn('Send statement',()=>setSend(true),

false,!canEditWorkspace(),

'mail'),

btn('Record payment',()=>setRecord(true),

true,!canEditWorkspace(),

'plus')))),

preview&&h(Preview,{model,onClose:()=>setPreview(false)}),

send&&h(StatementComposer,{tenant,db,initialSelection:[String(live.id)],onClose:()=>setSend(false)}),

record&&h(TenantPaymentModal71,{tenant,db,initialPayment:live,onClose:()=>setRecord(false),

onSaved:r=>{props.setDb?.(cur=>applyConfirmedResult(cur,{action:'payment_manual_post',payload:{tenant_id:tenant.id},result:r}));

setRecord(false);

props.reload?.().catch(console.error)}}),

entry&&h(MR4U69.Dialog69,{title:'Recorded payment',onClose:()=>setEntry(null)},h('dl',{className:'w81-facts'},...Object.entries({Date:fmtDate(entry.date),

Method:entry.method||'Recorded payment',Amount:eur(entry.amount),

Reference:entry.reference||'Not provided'}).map(([k,v])=>h('div',{key:k},h('dt',null,k),

h('dd',null,v))))));


};
StatementComposer=function StatementComposer81({tenant,db,onClose,initialSelection}){const all=tenantStatementModel(tenant,db),

[selected,setSelected]=use(initialSelection||all.rows.map(r=>String(r.id))),

[to,setTo]=use(tenant.email||''),

[cc,setCc]=use(''),

[message,setMessage]=use(''),

[subject,setSubject]=use(''),

[busy,setBusy]=use(false),

[error,setError]=use(''),

dialog=ref(null),

lock=ref(false),

model=tenantStatementModel(tenant,db,selected),

period=model.rows.length===1?model.rows[0].month:model.rows.length+' monthly accounts',defaultSubject=({nl:'Uw huuroverzicht',fr:'Votre relevé de loyer'})[tenant.communication_language]||'Your rent statement',office=window.__MR4U_WORKSPACE_INFO?.email_settings?.reply_to||'',signature=String(communicationSignature()||'').trim(),

greeting=({nl:'Beste',fr:'Bonjour'})[tenant.communication_language]||'Dear';useDialog(dialog,onClose,busy);


 async function send(){if(lock.current||!selected.length||!canEditWorkspace())return;lock.current=true;setBusy(true);

setError('');

try{const dest=parseEmailAddresses(to,'To'),

copies=parseEmailAddresses(cc,'CC');

if(!dest.length)throw Error('Add at least one To email address.');

await statementApi('statement',{tenant_id:tenant.id,payment_ids:selected,message,to:dest,cc:copies,subject:subject||defaultSubject+' · '+period});

showSaved('Statement sent with PDF and saved in Messages');

onClose()}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 return ReactDOM.createPortal(h('div',{className:'modal-bg w81-overlay'},h('section',{className:'w81-send-statement',ref:dialog,role:'dialog','aria-modal':true,'aria-label':'Send tenant statement'},h('header',{className:'w81-modal-head'},h('div',null,h('small',null,'Tenants / '+tenant.name),

h('h2',null,'Send statement'),

h('p',null,'Review the email and PDF before sending.')),

btn('Close',onClose,false,busy,'close')),

h('div',{className:'w81-statement-columns'},h('section',{className:'w81-card w81-statement-fields'},h(EmailAddressFields,{to,setTo,cc,setCc,office,contact:tenant.email,guarantor:tenantGuarantorMeta(tenant)}),

h('label',null,'Statement period',h('select',{'aria-label':'Statement period',value:selected.length===1?selected[0]:'custom',disabled:busy,onChange:e=>setSelected(e.target.value==='all'?all.rows.map(r=>String(r.id)):e.target.value==='custom'?selected:[e.target.value])},h('option',{value:'custom'},selected.length+' selected months'),

h('option',{value:'all'},'All monthly accounts'),

...all.rows.map(r=>h('option',{key:r.id,value:String(r.id)},r.month)))),

h('details',null,h('summary',null,'Choose multiple months'),

h('div',{className:'w81-month-selection'},...all.rows.map(r=>h('label',{key:r.id},h('input',{type:'checkbox',disabled:busy,checked:selected.includes(String(r.id)),

onChange:e=>setSelected(old=>e.target.checked?[...old,String(r.id)]:old.filter(x=>x!==String(r.id)))}),

r.month)))),

h('label',null,'Subject',h('input',{'aria-label':'Statement email subject',value:subject||defaultSubject+' · '+period,maxLength:300,disabled:busy,onChange:e=>setSubject(e.target.value)})),

h('label',null,'Personal message (optional)',h('textarea',{'aria-label':'Statement email message',rows:6,value:message,maxLength:10000,disabled:busy,onChange:e=>setMessage(e.target.value),

placeholder:'Add a personal message…'})),

h('details',{open:true,className:'w81-email-preview'},h('summary',null,'Email text preview'),

h('p',null,greeting+' '+tenant.name+',\n\n'+(message?message+'\n\n':'')+(({nl:'Uw overzicht is bijgevoegd als PDF.',fr:'Votre relevé est joint au format PDF.'})[tenant.communication_language]||'Your statement is attached as a PDF.')),

h('small',null,'The email also includes the selected account totals and a PDF attachment.')),

h('label',null,'Signature',h('div',{className:'w81-signature'},signature||'Workspace default signature')),

h('div',{className:'w81-file'},ic('file'),

h('span',null,paymentStatementFilename(model),

h('small',null,'PDF attachment · '+period))),

error&&h('p',{role:'alert',className:'security-error'},error)),

h('section',{className:'w81-statement-paper','aria-label':'Attached PDF preview'},selected.length?h(StatementDocument73,{model}):empty('Select at least one month.'))),

h('footer',{className:'w81-account-footer'},btn('Cancel',onClose,false,busy),

h('span'),

btn('Download PDF',()=>downloadPaymentStatementPdf(model),

false,busy||!selected.length,'download'),

btn(busy?'Sending…':'Confirm & send',send,true,busy||!selected.length||!to.trim()||!canEditWorkspace(),

'send')))),

document.body);


};
window.MR4U81={h,btn,card,empty,property,children,cls,ic,useDialog,badge};
})();


(function(){'use strict';const {h,btn,card,empty,property,children,cls,ic,badge}=MR4U81,{useState:use,useEffect:effect,useRef:ref}=React,same=(a,b)=>String(a)===String(b);


function InlineReply81({tenant,selected,send,disabled}){const [body,setBody]=use(''),

[to,setTo]=use(tenant.email||''),

[cc,setCc]=use(''),

[signature,setSignature]=use(String(communicationSignature()||'').trim()),

[busy,setBusy]=use(false),

[error,setError]=use(''),

lock=ref(false);

async function submit(){if(lock.current||disabled)return;lock.current=true;setBusy(true);

setError('');

try{if(!body.trim())throw Error('Write your reply first.');

const dest=parseEmailAddresses(to,'To');

if(!dest.length)throw Error('Add a To email address.');

parseEmailAddresses(cc,'CC');

const ok=await send(true,{to,cc,body,signature,parent:selected.id,subject:/^re:/i.test(selected.subject||'')?selected.subject:'Re: '+(selected.subject||'Message')});

if(ok)setBody('')}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}return h('section',{className:'w81-inline-reply'},h('h3',null,'Reply to '+tenant.name),

h('fieldset',{disabled:disabled||busy},h(EmailAddressFields,{to,setTo,cc,setCc,office:window.__MR4U_WORKSPACE_INFO?.email_settings?.reply_to||'',contact:tenant.email,guarantor:tenantGuarantorMeta(tenant)}),

h('textarea',{'aria-label':'Quick reply message',placeholder:'Write your reply…',rows:4,value:body,maxLength:100000,onChange:e=>setBody(e.target.value)}),

h('label',null,'Signature',h('textarea',{'aria-label':'Quick reply signature',rows:2,value:signature,onChange:e=>setSignature(e.target.value)})),

h('footer',null,h('small',null,'Use New message for templates, attachments or scheduling.'),

btn(busy?'Sending…':'Send reply',submit,true,disabled||busy||!body.trim(),

'send'))),

error&&h('p',{role:'alert',className:'security-error'},error))}
window.TenantMailView81=function({tree,tenant,selected,compose,conversations,setSelectedId,setCompose,send,busy}){const grid=children(tree).find(n=>cls(n,'comm-center-grid')),

workspace=children(grid).find(n=>cls(n,'comm-workspace')),

extras=children(tree).filter(n=>!cls(n,'comm-center-head')&&!cls(n,'comm-center-grid'));

return h('div',{className:'w81-tenant-mail'},!compose&&conversations.length>1&&h('label',{className:'w81-thread-picker'},'Conversation',h('select',{'aria-label':'Select email conversation',value:selected?.id||'',onChange:e=>{setSelectedId(e.target.value);

setCompose(false)}},...conversations.map(c=>h('option',{key:c.item.id,value:c.item.id},c.item.subject||'Message')))),

workspace,!compose&&selected&&h(InlineReply81,{key:selected.id,tenant,selected,send,disabled:busy||!canEditWorkspace()}),

...extras)};
const NativeCollab=Workspace65.Collaboration;
function Messages81({db,setModal,reload}){
 const [chosen,setChosen]=use(''),

[query,setQuery]=use(''),

[kind,setKind]=use('all'),

[folder,setFolder]=use('all'),

[compose,setCompose]=use({key:'',count:0}),

[cache,setCache]=use({}),

[data,setData]=use({messages:[],events:[]}),

[mobile,setMobile]=use(false),

[templates,setTemplates]=use(false),

[seen,setSeen]=use(()=>{try{return JSON.parse(localStorage.getItem('mr4u-mail-seen81-'+(window.__MR4U_WORKSPACE_INFO?.workspace?.id||'preview')+'-'+(window.__MR4U_WORKSPACE_INFO?.current_user_id||'user'))||'{}')}catch{return {}}});


 const seenKey='mr4u-mail-seen81-'+(window.__MR4U_WORKSPACE_INFO?.workspace?.id||'preview')+'-'+(window.__MR4U_WORKSPACE_INFO?.current_user_id||'user'),

contacts=[...db.owners.map(o=>({...o,kind:'owner',key:'owner:'+o.id})),

...db.tenants.map(t=>({...t,kind:'tenant',key:'tenant:'+t.id}))].map(c=>{const messages=c.kind==='tenant'?(db.tenant_messages||[]).filter(m=>same(m.tenant_id,c.id)):[],last=cache[c.key]||messages.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0],replyDates=messages.flatMap(m=>[(m.last_reply_text?m.updated_at:null),

...(db.tenant_message_events||[]).filter(e=>same(e.message_id,m.id)&&e.event_type==='replied').map(e=>e.created_at)]).filter(Boolean),

receivedAt=c.kind==='tenant'?replyDates.sort().at(-1):last?.direction==='incoming'?last.created_at:null;return {...c,last,unread:receivedAt&&receivedAt>(seen[c.key]||''),

receivedAt}}).sort((a,b)=>String(b.last?.created_at||'').localeCompare(String(a.last?.created_at||''))||a.name.localeCompare(b.name));


 const list=contacts.filter(c=>(kind==='all'||c.kind===kind)&&(folder!=='unread'||c.unread)&&[c.name,c.email,c.last?.subject].join(' ').toLowerCase().includes(query.toLowerCase())),

contact=contacts.find(c=>c.key===chosen)||list[0],unit=contact?.kind==='tenant'?unitsForTenant(db,contact.id)[0]:null,building=db.buildings.find(b=>same(b.id,unit?.building_id)),

rows=contact?.kind==='tenant'?tenantStatementModel(contact,db).rows:[],current=rows.find(r=>same(db.payments.find(p=>same(p.id,r.id))?.year,new Date().getFullYear())&&same(db.payments.find(p=>same(p.id,r.id))?.month,new Date().getMonth()+1))||rows[0],[record,setRecord]=use(null),

[statement,setStatement]=use(null);


 const receive=React.useCallback(d=>{setData({...d,contactKey:contact?.key});

const last=[...(d.messages||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];if(last&&contact)setCache(c=>({...c,[contact.key]:last}))},[contact?.key]);


 effect(()=>{

setCompose({key:'',count:0})},[contact?.key]);


 function select(c){setChosen(c.key);

setMobile(true);

if(c.receivedAt){const next={...seen,[c.key]:c.receivedAt};setSeen(next);

try{localStorage.setItem(seenKey,JSON.stringify(next))}catch{}}}
 const open=tab=>contact&&setModal?.({type:contact.kind==='owner'?'ownerHub':'tenantProfile',item:contact,tab}),

selected=data.contactKey===contact?.key?(data.messages||[])[0]:null,events=data.events||db.tenant_message_events||[],state=selected&&contact?.kind==='tenant'?messageState(selected,events):null,latestEvents=events.filter(e=>!selected||same(e.message_id,selected.id)).filter(e=>['sent','delivered','opened','replied','link_viewed'].includes(e.event_type)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,5);


 return h('div',{className:'w81-messages'+(mobile?' conversation-open':'')},h('header',{className:'w81-page-head'},h('div',null,h('h1',null,'Messages'),

h('p',null,'Every conversation, connected to your properties.')),

h('div',{className:'w81-actions'},btn('Templates',()=>setTemplates(true),

false,false,'file'),

btn('New message',()=>{setFolder('all');

setCompose(c=>({key:contact.key,count:c.count+1}));

setMobile(true)},true,!contact||!canEditWorkspace(),

'pen'))),

h('div',{className:'w81-mail-layout'},h('section',{className:'w81-inbox'},h('label',{className:'w81-search'},ic('search'),

h('input',{'aria-label':'Find a conversation',placeholder:'Search conversations',value:query,onChange:e=>setQuery(e.target.value)})),

h('nav',{className:'w81-tabs','aria-label':'Inbox folders'},...[['all','All'],['unread','Unread'],['sent','Sent']].map(([v,l])=>h('button',{key:v,'aria-selected':folder===v,onClick:()=>setFolder(v)},l))),

h('select',{'aria-label':'Conversation type',value:kind,onChange:e=>setKind(e.target.value)},h('option',{value:'all'},'Owners & tenants'),

h('option',{value:'tenant'},'Tenants'),

h('option',{value:'owner'},'Owners')),

h('div',{className:'w81-contact-list'},...list.map(c=>h('button',{key:c.key,className:contact?.key===c.key?'selected':'',onClick:()=>select(c)},h('span',{className:'w81-avatar'},initials(c.name)),

h('span',null,h('b',null,c.name),

h('strong',null,c.last?.subject||'Start a conversation'),

h('small',null,c.last?cleanMessageBody(c.last.body||'').slice(0,75):c.kind==='owner'?'Owner':property(c,db)||c.email||'Email not added')),

h('span',{className:'w81-contact-meta'},c.last?.created_at&&h('time',null,fmtDate(c.last.created_at.slice(0,10))),

c.unread&&h('i',{'aria-label':'Unread reply'})))),

!list.length&&empty('No conversations in this view.')),

h('small',{className:'w81-inbox-note'},'Unread replies are tracked on this browser.')),

h('section',{className:'w81-conversation'},contact?h(React.Fragment,null,h('header',{className:'w81-conversation-head'},h('button',{className:'w81-mail-back',onClick:()=>setMobile(false),

'aria-label':'Back to conversations'},ic('arrowLeft')),

h('span',{className:'w81-avatar'},initials(contact.name)),

h('div',null,h('h2',null,contact.name),

h('small',null,(contact.kind==='owner'?'Owner':'Tenant')+' · '+(contact.kind==='tenant'?property(contact,db):contact.email||'Email not added'))),

h(More65,{label:'Conversation actions'},btn('View '+contact.kind,()=>open('overview')),

btn('Write a message',()=>setCompose(c=>({key:contact.key,count:c.count+1})),

false,!canEditWorkspace()))),

contact.kind==='tenant'?h(TenantCommunication,{key:contact.key,tenant:contact,db,reload:reload||(async()=>{}),

composeRequest:compose.key===contact.key?compose.count:0,messageFolder:folder==='sent'?'sent':'all',onData:receive}):h(OwnerCollaboration,{key:contact.key,owner:contact,initialView:'messages',compactComposer:true,composeRequest:compose.key===contact.key?compose.count:0,messageFolder:folder==='sent'?'sent':'all',onData:receive})):empty('Add a tenant or owner to start a conversation.')),

contact&&h('aside',{className:'w81-mail-context'},card(contact.kind==='tenant'?'Tenant details':'Owner details',h(React.Fragment,null,h('div',{className:'w81-contact-heading'},h('span',{className:'w81-avatar'},initials(contact.name)),

h('b',null,contact.name)),

h('p',null,ic('location'),

contact.kind==='tenant'?property(contact,db):db.buildings.filter(b=>same(b.owner_id,contact.id)).length+' properties'),

h('p',null,ic('mail'),

contact.email||'Email not added'),

btn('View '+contact.kind,()=>open('overview'),

false,false,'arrowRight'))),

current&&card(current.month,h(React.Fragment,null,badge(current),

h('dl',{className:'w81-facts'},...[[ 'Due',current.due],['Received',current.paid],[current.credit>.005?'Credit':'Outstanding',current.credit>.005?current.credit:current.bal]].map(([l,n])=>h('div',{key:l},h('dt',null,l),

h('dd',null,eur(n))))),

h('div',{className:'w81-stack'},btn('View statement',()=>setStatement(current),

false,false,'file'),

btn('Record payment',()=>setRecord(db.payments.find(p=>same(p.id,current.id))),

true,!canEditWorkspace(),

'plus')))),

card('Email activity',h(React.Fragment,null,latestEvents.length?h('div',{className:'w81-mail-events'},...latestEvents.map((e,i)=>h('div',{key:e.id||i},ic(e.event_type==='opened'?'eye':'mail'),

h('span',null,({sent:'Sent',delivered:'Delivered',opened:'Open detected',replied:'Reply received',link_viewed:'Link visited'})[e.event_type]),

h('time',null,new Date(e.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Brussels'}))))):empty('Select a sent message to review its activity.'),

selected&&contact.kind==='tenant'&&h(RecipientStatusButton,{source:'tenant_message',messageId:selected.id,label:'View recipient activity'}),

h('small',null,'Open detection can include mail privacy tools. It does not confirm a person read the email.'))))),

record&&h(TenantPaymentModal71,{tenant:contact,db,initialPayment:record,onClose:()=>setRecord(null),

onSaved:()=>reload?.()}),

statement&&h(StatementComposer,{tenant:contact,db,initialSelection:[String(statement.id)],onClose:()=>setStatement(null)}),

templates&&h(MR4U69.Dialog69,{title:'Email templates',onClose:()=>setTemplates(false)},h(MessageTemplateSettings)));


}
Workspace65.Collaboration=p=>p.view==='messages'?h(Messages81,p):h(NativeCollab,p);


})();


(function(){'use strict';const {h,btn,card,empty,property,children,cls,ic,useDialog}=MR4U81,{useState:use,useEffect:effect,useRef:ref}=React,same=(a,b)=>String(a)===String(b);

window.ContractReview81=function({tree,item,db,parent,setModal,saving,save,createTenant,remove,generateContract,shortIntake}){
 const [tab,setTab]=use(item.tenant_id?'preview':'details'),
[doc,setDoc]=use(null),
[loading,setLoading]=use(false),
[error,setError]=use(''),
[page,setPage]=use(0),
[zoom,setZoom]=use(100),
[requests,setRequests]=use([]),
dialog=ref(null),
close=()=>setModal(parent||null),
unit=db.units.find(u=>same(u.id,item.unit_id)),
building=db.buildings.find(b=>same(b.id,item.building_id||unit?.building_id)),
owner=db.owners.find(o=>same(o.id,building?.owner_id)),
ready=item.tenant_id&&item.unit_id&&item.building_id&&item.lease_start_date&&item.lease_end_date,modal=children(tree)[0],body=children(modal).find(n=>cls(n,'contract-intake-body')),
foot=children(modal).find(n=>cls(n,'modal-foot')),
current=requests.filter(r=>r.source_context?.type==='lease'&&same(r.source_context.id,item.id)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];useDialog(dialog,close);

 effect(()=>{let live=true;setDoc(null);
setPage(0);
if(!ready||shortIntake)return;setLoading(true);
Promise.resolve(generateContract('preview')).then(d=>{if(live&&d)setDoc(d)}).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));
return()=>{live=false}},[JSON.stringify(item),
ready]);

 effect(()=>{let alive=true;sysCall('sign_list').then(d=>alive&&setRequests(d.requests||[])).catch(e=>alive&&setError(e.message));
return()=>{alive=false}},[item.id]);

 if(shortIntake)return tree;
 const download=()=>doc&&downloadIndexation80(doc),
sign=()=>generateContract(true),
facts=items=>h('dl',{className:'w81-facts'},...items.map(([k,v])=>h('div',{key:k},h('dt',null,k),
h('dd',null,v||'Not recorded')))),
activity=[[item.created_at,'Application created'],[item.submitted_at,'Tenant details submitted'],[item.contract_generated_at,'Contract document generated'],...(current?.created_at?[[current.created_at,'Signing request prepared']]:[]),
...(current?.signers||[]).filter(s=>s.signed_at).map(s=>[s.signed_at,s.name+' signed'])].filter(([date])=>date).sort((a,b)=>a[0].localeCompare(b[0]));

 return h('div',{className:'modal-bg w81-overlay'},h('section',{ref:dialog,className:'w81-contract',role:'dialog','aria-modal':true,'aria-label':'Lease contract review'},h('header',{className:'w81-modal-head'},h('div',null,h('small',null,'Documents / Lease contracts / '+contractTenantName(item)),
h('h2',null,'Lease contract ',h('span',{className:'w81-badge'},current?.state==='completed'?'Signed':current?.state==='active'?'Awaiting signatures':'Draft')),
h('p',null,contractTenantName(item)+' · '+[building?.name,unit?.unit_number?'Unit '+unit.unit_number:''].filter(Boolean).join(' · '))),
h('div',{className:'w81-actions'},btn('Save details',save,false,saving||!canEditWorkspace(),
'file'),
btn('Download PDF',download,false,!doc||loading,'download'),
btn('Review & request signatures',sign,true,!ready||saving||!canEditWorkspace(),
'pen'),
btn('Close',close,false,false,'close'))),
h('nav',{className:'w81-tabs','aria-label':'Lease sections'},...[[ 'details','Details'],['preview','Document preview'],['signatures','Signatures'],['activity','Activity']].map(([v,l])=>h('button',{key:v,'aria-selected':tab===v,onClick:()=>setTab(v)},l))),
error&&h('p',{role:'alert',className:'security-error'},error),
h('div',{className:'w81-contract-scroll'},tab==='details'?h('div',{className:'w81-contract-details'},h('fieldset',{disabled:saving||!canEditWorkspace()},body,h('div',{className:'w81-actions'},btn('Save office details',save,true,saving||!canEditWorkspace()),
btn(item.tenant_id?'Update tenant & assignment':'Create tenant & assign apartment',createTenant,false,saving||!item.submitted_at||!canEditWorkspace()),
...children(foot).filter(n=>n?.type==='button'&&String(n.props.className||'').includes('contract-generate'))))):tab==='preview'?h('div',{className:'w81-contract-columns'},h('aside',null,card('Parties',facts([['Owner',owner?.name],['Tenant',contractTenantName(item)],['Property',[building?.name,unit?.unit_number?'Unit '+unit.unit_number:''].filter(Boolean).join(' · ')]])),
card('Dates',facts([['Lease start',item.lease_start_date&&fmtDate(item.lease_start_date)],['Lease end',item.lease_end_date&&fmtDate(item.lease_end_date)],['Signed date',current?.state==='completed'?fmtDate(current.completed_at?.slice(0,10)):'Not signed']])),
card('Terms',facts([['Base rent',eur(item.monthly_rent||0)],['Fixed costs',eur(item.additional_costs||0)],['Deposit',item.security_deposit!=null?eur(item.security_deposit):'Not recorded']])),
btn('Edit details',()=>setTab('details'),
false,!canEditWorkspace(),
'pen')),
h('section',{className:'w81-lease-preview'},h('div',{className:'w81-preview-toolbar'},btn('Previous page',()=>setPage(n=>Math.max(0,n-1)),
false,page===0,'arrowLeft'),
h('span',null,doc?'Page '+(page+1)+' of '+doc.pages.length:loading?'Preparing document…':'Document preview'),
btn('Next page',()=>setPage(n=>Math.min(doc.pages.length-1,n+1)),
false,!doc||page>=doc.pages.length-1,'arrowRight'),
h('span'),
btn('−',()=>setZoom(n=>Math.max(70,n-10))),
h('b',null,zoom+'%'),
btn('+',()=>setZoom(n=>Math.min(160,n+10))),
btn('Fit page',()=>setZoom(100))),
h('div',{className:'w81-lease-paper'},doc?h('article',{style:{width:zoom+'%'},dangerouslySetInnerHTML:{__html:doc.pages[Math.min(page,doc.pages.length-1)]}}):empty(loading?'Preparing the actual lease text…':ready?'The contract could not be prepared. Review the details and try again.':'Assign a tenant and property and complete the lease dates to prepare the document.')),
h('footer',null,h('span',null,'Signature fields'),
...(current?.signers||[{name:owner?.name,role:'owner'},{name:contractTenantName(item),
role:'tenant'}]).map((s,i)=>h('div',{key:i},ic('users'),
h('span',null,s.name||'Not assigned',h('small',null,s.role+' · '+(s.signed_at?'Signed':'To be signed'))))),
btn('Place signature fields',sign,false,!ready||!canEditWorkspace(),
'pen')))):tab==='signatures'?card('Signatures',h(React.Fragment,null,current?h('div',null,h('p',null,'Request status: '+current.state),
...(current.signers||[]).map((s,i)=>h('div',{className:'w81-signer',key:i},ic(s.signed_at?'check':'clock'),
h('span',null,h('b',null,s.name),
h('small',null,s.email+' · '+s.role)),
h('span',{className:'w81-badge'},s.signed_at?'Signed':s.declined_at?'Declined':'Pending')))):empty('No signing request has been prepared.'),
h('p',null,'Review the document, place the signature fields, then confirm the invitations in the signing tool.'),
btn('Review & place signature fields',sign,true,!ready||!canEditWorkspace(),
'pen'),
h('p',{className:'w81-muted'},'Drawn electronic signatures use email verification. They are not qualified certificate-based signatures.'))):card('Activity',activity.length?h('div',{className:'w81-timeline'},...activity.map(([date,label],i)=>h('div',{key:i},h('i'),
h('span',null,label,h('small',null,fmtDate(date.slice(0,10))))))):empty('No timestamped activity is recorded.'))),
h('footer',{className:'w81-account-footer'},h('button',{className:'w81-danger',disabled:saving||!canEditWorkspace(),
onClick:remove},ic('trash'),
'Delete intake'),
h('span'),
btn('Back to tenancy',close),
btn('Review & request signatures',sign,true,!ready||saving||!canEditWorkspace(),
'send'))));

};
window.UtilityTakeover74=function UtilityTakeover81({tree,draft,row,canEdit,busy,save,review,dirty}){
 const [tab,setTab]=use('energy'),
[preview,setPreview]=use(null),
[error,setError]=use(''),
[loading,setLoading]=use(false);
effect(()=>{setPreview(old=>{if(old)URL.revokeObjectURL(old);
return null})},[row?.updated_at,tab]);
effect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
const all=children(tree),
editor=all.find(n=>cls(n,'handover-editor')),
parts=children(editor),
meters=parts.find(n=>cls(n,'handover-meters-block')),
fields=parts.filter(n=>cls(n,'handover-grid')||cls(n,'handover-parties')||cls(n,'handover-block')&&n!==meters),
exports=parts.filter(n=>cls(n,'handover-exports')),
vault=parts.find(n=>n?.type===PropertyDocuments.DocumentVault),
remove=parts.find(n=>n?.type==='button'&&n.props.className==='v6-danger'),
notes=parts.find(n=>n?.type==='label');

 if(!draft)return h('div',{className:'w81-handover'},tree);

 const visibleMeters=meters&&React.cloneElement(meters,{},...children(meters).filter(n=>!cls(n,'handover-meter')||(tab==='water'?n.props['data-utility']==='water':n.props['data-utility']!=='water')).map(n=>{if(!cls(n,'handover-meter'))return n;const parts=children(n),grid=parts.find(c=>cls(c,'handover-grid')),fields=children(grid),core=fields.filter(f=>children(f).some(t=>typeof t==='string'&&(/^(Meter number|EAN|Reading|day |night |exclusive night|injection)/i.test(t)||t==='Water company'))),advanced=fields.filter(f=>!core.includes(f));return React.cloneElement(n,{},h('header',{className:'w81-meter-title'},ic(n.props['data-utility']),h('h4',null,cap(n.props['data-utility']))),h('div',{className:'handover-grid w81-meter-core'},...core),h('details',{className:'w81-meter-advanced'},h('summary',null,'Meter setup & supplier'),h('div',{className:'handover-grid'},...advanced)),...parts.filter(c=>c!==grid))})),
first=draft.meters.findIndex(m=>tab==='water'?m.kind==='water':m.kind!=='water'),
meter=draft.meters[first];
 async function pdf(download=false){if(!row||dirty||loading)return;setLoading(true);
setError('');
try{const kind=tab==='water'?'water_record':'summary',r=await authFetch('/api/system',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'handover_pdf',id:row.id,kind})});
if(!r.ok){const j=await r.json();
throw Error(j.error||'Could not prepare the handover PDF.')}const blob=await r.blob(),
url=URL.createObjectURL(blob);
if(download){const a=document.createElement('a');
a.href=url;a.download='Utility-handover-'+draft.handover_date+'.pdf';a.click();
setTimeout(()=>URL.revokeObjectURL(url),
60000)}else setPreview(old=>{if(old)URL.revokeObjectURL(old);
return url})}catch(e){setError(e.message)}finally{setLoading(false)}}
 return h('section',{className:'w81-handover'},...all.filter(n=>n!==editor),
h('div',{className:'w81-page-head'},h('div',null,h('h2',null,'Utility handover'),
h('p',null,'Saved tenancy details, readings and documents in one place.')),
canEdit&&btn(busy?'Saving…':'Save draft',save,false,busy||row?.has_signed,'file')),
h('div',{className:'w81-handover-summary'},...[[ 'Property',[draft.property.street,draft.property.number,draft.property.box].filter(Boolean).join(' ')],['Handover date',fmtDate(draft.handover_date)],['Outgoing',draft.outgoing.name],['Incoming',draft.incoming.name]].map(([l,v])=>h('div',{key:l},h('small',null,l),
h('b',null,v||'Not entered')))),
h('nav',{className:'w81-tabs','aria-label':'Utility handover sections'},...[[ 'energy','Electricity & gas','electricity'],['water','Water','water'],['attachments','Attachments','file'],['signatures','Review & signatures','pen']].map(([v,l,icon])=>h('button',{key:v,'aria-selected':tab===v,onClick:()=>setTab(v)},ic(icon),
l))),
h('div',{className:'w81-handover-columns'},h('main',null,tab==='energy'||tab==='water'?h(React.Fragment,null,card('Meter readings',h(React.Fragment,null,h('p',{className:'w81-muted'},'Enter the actual readings for the handover date.'),
visibleMeters)),
card('Parties & property',h(React.Fragment,null,h('div',{className:'w81-party-cards'},...['outgoing','incoming'].map(k=>h('div',{key:k},h('h4',null,k==='outgoing'?'Outgoing party':'Incoming party'),
h('b',null,draft[k].name||'Not entered'),
h('p',null,draft[k].email||'',h('br'),
[draft[k].street,draft[k].number,draft[k].city].filter(Boolean).join(' '))))),
h('details',{className:'w81-edit-parties',open:!draft.incoming.name||!draft.outgoing.name},h('summary',null,ic('pen'),
'Edit party details, address & date'),
...fields),
notes)),
row&&h(PropertyDocuments.DocumentVault,{handoverId:row.id,readOnly:!canEdit,category:'attachment',heading:'Meter photos & attachments',buttonLabel:'Attach meter photo'})):tab==='attachments'?h(React.Fragment,null,vault,row&&h(PropertyDocuments.DocumentVault,{handoverId:row.id,readOnly:!canEdit,category:'attachment',heading:'Supporting files',buttonLabel:'Add attachment'})):h(React.Fragment,null,!row&&empty('Save the handover before preparing documents or signatures.'),
...exports,vault,remove)),
h('aside',null,card('Document preview',h(React.Fragment,null,preview?h('iframe',{title:'Saved handover PDF',src:preview,className:'w81-handover-frame'}):h('article',{className:'w81-handover-paper'},h('small',{className:'w81-badge'},dirty?'Unsaved draft':'Data summary'),
h('h2',null,'Utility handover'),
h('p',null,'This summary uses your entered details. Open the saved PDF or select an official provider form in Review & signatures.'),
h('dl',{className:'w81-facts'},...[[ 'Property',[draft.property.street,draft.property.number,draft.property.box,draft.property.city].filter(Boolean).join(' ')],['Date',fmtDate(draft.handover_date)],['Outgoing',draft.outgoing.name],['Incoming',draft.incoming.name]].map(([l,v])=>h('div',{key:l},h('dt',null,l),
h('dd',null,v||'Not entered')))),
h('h3',null,'Meter readings'),
h('table',{className:'w81-table'},h('tbody',null,...draft.meters.filter(m=>tab==='water'?m.kind==='water':tab==='energy'?m.kind!=='water':true).map((m,i)=>h('tr',{key:i},h('td',null,cap(m.kind),
h('small',null,m.meter_number||m.ean||'Meter not entered')),
h('td',null,Object.entries(m.registers||{}).filter(([,v])=>v!=='').map(([k,v])=>h('div',{key:k},k.replaceAll('_',' ')+': '+v+' '+(m.kind==='electricity'?'kWh':'m³'))))))))),
h('div',{className:'w81-actions'},btn(loading?'Preparing…':'Preview PDF',()=>pdf(false),
false,!row||dirty||loading,'eye'),
btn('Download PDF',()=>pdf(true),
false,!row||dirty||loading,'download')),
error&&h('p',{role:'alert',className:'security-error'},error))),
card('Included documents',h('div',null,...draft.meters.map((m,i)=>h('p',{key:i},ic('file'),
m.kind==='water'?(m.supplier||'Water provider')+' handover':cap(m.kind)+' handover')),
h('small',null,'Official provider forms and signature invitations are available in Review & signatures.'))))),
h('footer',{className:'w81-account-footer'},h('small',null,dirty?'Unsaved changes':'Saved details are reused throughout these documents.'),
h('span'),
canEdit&&!row?.has_signed&&btn('Save draft',save,false,busy,'file'),
btn('Review documents & signatures',()=>setTab('signatures'),
true,false,'pen')));

};
window.MoveIn81=function({tenant,db,setModal,setTab,reload}){
 const [stage,setStage]=use('utilities'),[handoverDirty,setHandoverDirty]=use(false),
[saved,setSaved]=use(()=>{try{const m=String(tenant.notes||'').match(/__MR4U_MOVEIN81:([A-Za-z0-9+/=]+)__/);
return m?JSON.parse(decodeURIComponent(escape(atob(m[1])))):{};}catch{return {}}}),
[checks,setChecks]=use(null),
[busy,setBusy]=use(false),
[error,setError]=use(''),
[documents,setDocuments]=use([]),
[handovers,setHandovers]=use([]),
[requests,setRequests]=use([]);
const values=checks||saved,unit=unitsForTenant(db,tenant.id)[0],building=db.buildings.find(b=>same(b.id,unit?.building_id)),
owner=db.owners.find(o=>same(o.id,building?.owner_id)),
contract=db.contract_intakes.find(c=>same(c.tenant_id,tenant.id)&&c.status!=='archived'),
start=tenant.tenancy_start_date||contract?.lease_start_date;
 effect(()=>{let alive=true;Promise.allSettled([sysCall('documents_list',{tenant_id:tenant.id}),
sysCall('handover_context',{tenant_id:tenant.id,unit_id:unit?.id}),
sysCall('sign_list')]).then(rs=>{if(!alive)return;if(rs[0].status==='fulfilled')setDocuments(rs[0].value.documents||[]);
if(rs[1].status==='fulfilled')setHandovers(rs[1].value.handovers||[]);
if(rs[2].status==='fulfilled')setRequests(rs[2].value.requests||[]);
const failure=rs.find(r=>r.status==='rejected');
if(failure)setError(failure.reason.message)});
return()=>{alive=false}},[tenant.id,unit?.id]);

 async function save(){if(busy||!canEditWorkspace())return;setBusy(true);
setError('');
try{const {data:latest,error:readError}=await sb.from('tenants').select('notes').eq('id',tenant.id).single();
if(readError)throw readError;const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(values)))),
notes=String(latest?.notes||'').replace(/\n?__MR4U_MOVEIN81:[A-Za-z0-9+/=]+__/g,'')+'\n__MR4U_MOVEIN81:'+encoded+'__';const {error,data}=await sb.from('tenants').update({notes}).eq('id',tenant.id).select('id').single();
if(error)throw error;if(!data)throw Error('Move-in progress was not confirmed.');
setSaved(values);
setChecks(null);
showSaved('Move-in checklist saved');
reload?.().catch(console.error)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function chooseStage(next){if(stage==='utilities'&&handoverDirty&&next!=='utilities'&&!await appConfirm('Discard unsaved utility handover changes?',{confirmText:'Discard',danger:false}))return;setStage(next)}
 const signed=contract&&(contract.status==='completed'||documents.some(d=>same(d.contract_id,contract.id)&&d.category==='signed_contract'&&d.state==='ready')||requests.some(r=>r.source_context?.type==='lease'&&same(r.source_context.id,contract.id)&&r.state==='completed')),
stages=[['tenancy','Tenancy',Boolean(start&&unit)],['contract','Contract',Boolean(signed)],['deposit','Deposit',Boolean(values.deposit_checked)],['utilities','Utilities',Boolean(handovers.length)],['handover','Handover',Boolean(values.keys_checked&&values.condition_checked)]],openContract=()=>contract&&setModal({type:'contractIntake',item:contract,parent:{type:'tenantProfile',item:tenant,tab:'movein'}}),
check=(k,l)=>h('label',{className:'w81-check'},h('input',{type:'checkbox',checked:!!values[k],disabled:busy||!canEditWorkspace(),
onChange:e=>setChecks(x=>({...values,...x,[k]:e.target.checked}))}),
l);

 return h('section',{className:'w81-movein'},h('header',{className:'w81-page-head'},h('div',null,h('h2',null,'Move-in workspace'),
h('p',null,'Everything ready for the new tenancy.')),
btn(busy?'Saving…':'Save progress',save,true,busy||!checks||!canEditWorkspace(),
'file')),
h('div',{className:'w81-handover-summary'},...[[ 'Tenant',tenant.name],['Property',property(tenant,db)],['Owner',owner?.name],['Lease starts',start?fmtDate(start):'Not recorded']].map(([l,v])=>h('div',{key:l},h('small',null,l),
h('b',null,v||'Not recorded')))),
h('nav',{className:'w81-steps','aria-label':'Move-in steps'},...stages.map(([v,l,done],i)=>h('button',{key:v,'aria-current':stage===v?'step':undefined,onClick:()=>chooseStage(v)},h('b',null,done?ic('check',16):i+1),
l))),
error&&h('p',{role:'alert',className:'security-error'},error),
h('div',{className:'w81-movein-columns'},h('main',null,stage==='utilities'?h(PropertyDocuments.HandoverPanel,{tenantId:tenant.id,unitId:unit?.id,readOnly:!canEditWorkspace(),onDirtyChange:setHandoverDirty}):stage==='tenancy'?card('Tenant & property',h(React.Fragment,null,h('dl',{className:'w81-facts'},...[[ 'Tenant',tenant.name],['Email',tenant.email],['Property',property(tenant,db)],['Lease start',start&&fmtDate(start)]].map(([k,v])=>h('div',{key:k},h('dt',null,k),
h('dd',null,v||'Not recorded')))),
btn('Review tenant details',()=>setTab('details')))):stage==='contract'?card('Lease contract',h(React.Fragment,null,h('p',null,contract?(signed?'Signed contract recorded':'Lease draft · review required'):'No linked lease contract.'),
btn('Review lease contract',openContract,true,!contract,'file'),
h(PropertyDocuments.DocumentVault,{tenantId:tenant.id,contractId:contract?.id,readOnly:!canEditWorkspace()}))):stage==='deposit'?card('Deposit confirmation',h(React.Fragment,null,h('p',null,'Agreed deposit: '+eur(contract?.security_deposit??tenant.deposit_amount??0)),
check('deposit_checked','I have verified the deposit arrangement.'),
h('p',{className:'w81-muted'},'This checklist confirmation does not post a payment or change the financial ledger.'))):card('Keys & condition report',h(React.Fragment,null,check('keys_checked','Keys have been handed over.'),
check('condition_checked','The condition report has been reviewed.'),
h(PropertyDocuments.DocumentVault,{tenantId:tenant.id,category:'attachment',readOnly:!canEditWorkspace(),
heading:'Move-in supporting documents',buttonLabel:'Upload report or photos'})))),
h('aside',null,card('Move-in checklist',h('div',{className:'w81-checklist'},...stages.map(([v,l,done])=>h('button',{key:v,className:stage===v?'selected':'',onClick:()=>chooseStage(v)},ic(done?'check':'clock'),
h('b',null,l),
h('small',null,done?'Recorded':v==='utilities'?'Prepare handover':'Needs review'))))),
card('Documents',h(React.Fragment,null,documents.length?h('div',{className:'w81-stack'},...documents.filter(d=>d.state==='ready').map(d=>h(PropertyDocuments.FileButton,{key:d.id,id:d.id,label:d.file_name}))):empty('No saved documents yet.'),
btn('Create utility handover',()=>chooseStage('utilities'),
false,!canEditWorkspace(),
'plus'))),
h('p',{className:'w81-muted'},'Saved tenant, property and party details are reused. Checklist items are completed from recorded data or your explicit confirmation.'))));

};
})();

(function(){const base=StudioIcon;StudioIcon=function(p){const paths={eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',copy:'M8 8h13v13H8ZM3 16V3h13',arrowLeft:'m12 5-7 7 7 7M5 12h16',arrowRight:'m12 5 7 7-7 7M19 12H3',close:'m6 6 12 12M18 6 6 18',plus:'M12 4v16M4 12h16'};return paths[p.name]?React.createElement('svg',{width:p.size||18,height:p.size||18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinejoin:'round',strokeLinecap:'round','aria-hidden':true},React.createElement('path',{d:paths[p.name]})):React.createElement(base,p)}})();
