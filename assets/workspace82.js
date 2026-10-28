/* Financial overview and transaction flow using the saved ledger and existing API actions. */
(function(){'use strict';
const h=React.createElement,{useState:use,useEffect:effect,useRef:ref}=React,same=(a,b)=>String(a)===String(b),

ic=(name,size=18)=>['arrowDown','arrowUp'].includes(name)?h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:name==='arrowDown'?'M12 3v18M6 15l6 6 6-6':'M12 21V3M6 9l6-6 6 6'})):h(StudioIcon,{name,size}),

kid=n=>React.Children.toArray(n?.props?.children),

has=(n,c)=>String(n?.props?.className||'').split(' ').includes(c);


const button=(text,fn,primary=false,disabled=false,icon)=>h('button',{type:'button',className:primary?'primary':'',disabled,onClick:fn},icon&&ic(icon),

text),

empty=text=>h('p',{className:'f82-empty'},text),

card=(title,body,action)=>h('section',{className:'f82-card'},h('header',null,h('h3',null,title),

action),

body),

facts=rows=>h('dl',{className:'f82-facts'},...rows.map(([k,v])=>h('div',{key:k},h('dt',null,k),

h('dd',null,v||'Not recorded')))),

shortDate=v=>v?fmtDate(String(v).slice(0,10)):'Not recorded',amount=v=>eur(Math.abs(Number(v||0))),

signed=v=>(v>=0?'+ ':'− ')+amount(v),

monthLabel=v=>new Date(v+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});


function badge(row){const text=row.bank_receipt?'To match':row.entry&&row.tx?'Matched':row.status==='Assigned'?'Recorded':row.status||'Recorded';return h('span',{className:'f82-badge '+(text==='Needs review'||text==='To match'?'review':text==='Matched'?'matched':'recorded')},text)}
function Dialog({title,subtitle,onClose,busy=false,children,footer,className=''}){const node=ref(null);

MR4U81.useDialog(node,onClose,busy);

return ReactDOM.createPortal(h('div',{className:'f82-overlay'},h('section',{ref:node,className:'f82-dialog '+className,role:'dialog','aria-modal':true,'aria-label':title},h('header',{className:'f82-dialog-head'},h('div',null,h('h2',null,title),

subtitle&&h('p',null,subtitle)),

button('Close',onClose,false,busy,'close')),

h('div',{className:'f82-dialog-body'},children),

footer&&h('footer',{className:'f82-dialog-foot'},footer))),

document.body)}
function Chart({rows,year,through}){
 const months=Array.from({length:through},(_,i)=>{const key=year+'-'+String(i+1).padStart(2,'0'),

group=rows.filter(r=>r.date?.slice(0,7)===key);

return {key,label:new Date(year,i,1).toLocaleDateString('en-GB',{month:'short'}),

income:group.filter(r=>r.kind==='income').reduce((n,r)=>n+r.amount,0),

expense:group.filter(r=>r.kind==='expense').reduce((n,r)=>n+Math.abs(r.amount),

0)}}),

max=Math.max(1,...months.flatMap(x=>[x.income,x.expense])),

ceiling=Math.ceil(max/(max>1000?1000:100))*(max>1000?1000:100);


 return h('div',{className:'f82-chart',role:'img','aria-label':'Monthly income and expenses for '+year},h('div',{className:'f82-chart-legend'},h('span',null,h('i',{className:'income'}),

'Income'),

h('span',null,h('i',{className:'expense'}),

'Expenses')),

h('div',{className:'f82-chart-area'},h('div',{className:'f82-chart-axis'},...[1,.75,.5,.25,0].map(v=>h('span',{key:v},Math.round(ceiling*v).toLocaleString('nl-BE')))),

h('div',{className:'f82-chart-bars'},...months.map(m=>h('div',{key:m.key,className:'f82-chart-month'},h('div',{className:'f82-chart-pair'},h('div',{className:'income',style:{height:Math.max(m.income>0?1:0,m.income/ceiling*100)+'%'},title:m.label+' income '+eur(m.income)}),

h('div',{className:'expense',style:{height:Math.max(m.expense>0?1:0,m.expense/ceiling*100)+'%'},title:m.label+' expenses '+eur(m.expense)})),

h('small',null,m.label))))));


}
function AddMenu82({children}){return h('details',{className:'f82-add-menu'},h('summary',null,ic('plus'),'Add transaction'),h('div',{onClick:e=>{if(e.target.closest('button'))e.currentTarget.closest('details').open=false}},children))}
window.FinancialWorkspace82=function(p){
 const {db,filtered,allRows,fromDate,toDate,setFromDate,setToDate,kindFilters,setKindFilters,buildingFilters,setBuildingFilters,ownerFilters,transactionPage,setTransactionPage,setTransactionDetail,setIncomeDetail,setEditing,setExportOpen,setPage,setModal,removeFinancialRow}=p;
 const [section,setSection]=use(()=>{try{return sessionStorage.getItem('mr4u-finance-tab82')||'overview'}catch{return 'overview'}}),

[sort,setSort]=use({key:'date',dir:-1}),

[custom,setCustom]=use(false),

[export82,setExport82]=use(false);


 effect(()=>{const open=e=>{p.setIncomeDetail(null);
p.setModal?.({type:'tenantProfile',item:e.detail.tenant,tab:'payments'})};window.addEventListener('mr4u-open-tenant82',open);
return()=>window.removeEventListener('mr4u-open-tenant82',open)},[p.setModal]);

 const changeSection=v=>{setSection(v);

try{sessionStorage.setItem('mr4u-finance-tab82',v)}catch{}},elements=kid(p.tree),

nativeFilters=elements.find(n=>has(n,'financial-filterbar')),

nativeSummary=elements.find(n=>has(n,'d71-finance-summary')),

nativeBodies=elements.filter(n=>has(n,'financial-owner-section')||has(n,'financial-category-section')||has(n,'empty')),

overlays=elements.filter(n=>n?.type===FinancialIncomeDialog||n?.type===ExpenseEditor||n?.type===TransactionDetails71||n?.type===FinancialExportModal),

selection=elements.find(n=>has(n,'financial-selection-bar'));


 const income=filtered.filter(r=>r.kind==='income').reduce((n,r)=>n+Number(r.amount||0),

0),

expenses=filtered.filter(r=>r.kind==='expense').reduce((n,r)=>n+Math.abs(Number(r.amount||0)),

0),

scoped=r=>(!buildingFilters.length||buildingFilters.map(String).includes(String(r.building_id)))&&(!ownerFilters.length||ownerFilters.map(String).includes(String(r.owner_id))),

chartRows=allRows.filter(r=>!p.hiddenRows.includes(r.id)&&scoped(r)&&kindFilters.includes(r.kind)&&[r.title,r.detail,r.owner_name,r.building_name,r.category].join(' ').toLowerCase().includes(p.transactionSearch.toLowerCase()));


 const collection=[];for(const t of db.tenants){const units=unitsForTenant(db,t.id),

building=db.buildings.find(b=>same(b.id,units[0]?.building_id));

if(!scoped({building_id:building?.id,owner_id:building?.owner_id}))continue;for(const r of tenantStatementModel(t,db).rows){const pay=db.payments.find(x=>same(x.id,r.id)),

date=r.due_date||`${pay.year}-${String(pay.month).padStart(2,'0')}-01`;if((!fromDate||date>=fromDate)&&(!toDate||date<=toDate))collection.push(r)}}
 const outstanding=collection.reduce((n,r)=>n+r.bal,0),

counts=[['Paid',collection.filter(r=>r.bal<=.005).length,'paid'],['Partly paid',collection.filter(r=>r.bal>.005&&r.paid>.005).length,'partial'],['Unpaid',collection.filter(r=>r.bal>.005&&r.paid<=.005).length,'unpaid']],period=fromDate&&toDate&&fromDate.slice(0,7)===toDate.slice(0,7)?fromDate.slice(0,7):'custom',year=Number((toDate||isoToday()).slice(0,4)),

through=Number((toDate||isoToday()).slice(5,7)),

months=[...new Set([isoToday().slice(0,7),

...allRows.map(r=>r.date?.slice(0,7)).filter(Boolean)])].sort().reverse(),

valueKey=(r,key)=>key==='property'?r.building_name:key==='type'?r.kind:key==='reference'?r.entry?.reference||r.record?.reference||r.tx?.remittance_information||r.detail||'':r[key],sorted=filtered.slice().sort((a,b)=>typeof valueKey(a,sort.key)==='number'?(valueKey(a,sort.key)-valueKey(b,sort.key))*sort.dir:String(valueKey(a,sort.key)||'').localeCompare(String(valueKey(b,sort.key)||''))*sort.dir),

visible=section==='overview'?sorted.slice(0,6):sorted.slice(transactionPage*8,transactionPage*8+8);


 const openAccount=r=>r.payment&&setModal?.({type:'paymentAccount',item:r.payment}),

download=r=>r.tenant&&r.payment&&downloadPaymentStatementPdf(tenantStatementModel(r.tenant,db,[r.payment.id])),

edit=r=>{if(r.kind==='income')setIncomeDetail(r);

else{const tx=r.tx,sg=r.suggestion;setEditing(tx?{tx,draft:{...(r.record||{}),

building_id:r.record?.building_id||sg?.building_id||'',category:r.record?.category||sg?.category||'Other',supplier:r.record?.supplier||expenseCounterparty(tx),

notes:r.record?.notes||''}}:{...r.record,manual:true})}};
 function table(rows){return h('div',{className:'f82-table-wrap'},h('table',{className:'f82-table'},h('thead',null,h('tr',null,h('th',{className:'f82-select-cell'},h('input',{type:'checkbox','aria-label':'Select removable transactions',checked:rows.some(r=>r.kind==='expense'||r.bank_receipt)&&rows.filter(r=>r.kind==='expense'||r.bank_receipt).every(r=>p.selected.includes(r.id)),onChange:e=>rows.filter(r=>r.kind==='expense'||r.bank_receipt).forEach(r=>p.toggleSelect(r.id,e.target.checked))})),...[['date','Date'],['kind','Type'],['title','Payer / payee'],['property','Property'],['reference','Reference'],['amount','Amount'],['status','Status']].map(([key,label])=>h('th',{key},button(label,()=>setSort(s=>({key,dir:s.key===key?-s.dir:1})),

false,false,sort.key===key?'arrowDown':null))),

h('th',null,'Actions'))),

h('tbody',null,...rows.map(r=>h('tr',{key:r.id,className:p.transactionDetail?.id===r.id?'selected':''},h('td',{className:'f82-select-cell'},(r.kind==='expense'||r.bank_receipt)&&h('input',{type:'checkbox','aria-label':'Select '+r.title,checked:p.selected.includes(r.id),onChange:e=>p.toggleSelect(r.id,e.target.checked)})),h('td',null,shortDate(r.date)),

h('td',null,h('span',{className:'f82-type '+r.kind},r.kind==='income'?'Income':'Expense')),

h('td',null,h('button',{className:'f82-cell',onClick:()=>setTransactionDetail(r),

'aria-label':'Open transaction '+r.title},h('b',null,r.title),

h('small',null,r.category))),

h('td',null,r.building_name||'General',h('small',null,r.owner_name)),

h('td',{className:'f82-reference-cell',title:valueKey(r,'reference')},valueKey(r,'reference')||'Not provided'),

h('td',{className:'num '+r.kind},signed(r.amount)),

h('td',null,badge(r)),

h('td',null,h(More65,{label:'Actions for transaction '+r.title},button('View details',()=>setTransactionDetail(r)),

r.entry? h(React.Fragment,null,button('Open monthly account',()=>openAccount(r)),

button('Download statement',()=>download(r))):h(React.Fragment,null,button(r.bank_receipt?'Match / classify payment':'Edit transaction',()=>edit(r),

false,!canEditWorkspace()),

(r.kind==='expense'||r.bank_receipt)&&button(r.tx?'Remove from Financials':'Delete expense',()=>removeFinancialRow(r),

false,!canEditWorkspace()))))))),

!rows.length&&h('tfoot',null,h('tr',null,h('td',{colSpan:9},empty('No transactions match these filters.'))))))}
 const periodControl=h('div',{className:'f82-period-controls'},h('select',{'aria-label':'Financial period',value:period,onChange:e=>{const v=e.target.value;if(v==='custom'){setCustom(true);

return}setCustom(false);

setFromDate(v+'-01');

const d=new Date(Number(v.slice(0,4)),

Number(v.slice(5,7)),

0,12);

setToDate(d.toLocaleDateString('en-CA'))}},period==='custom'&&h('option',{value:'custom'},'Custom date range'),

...months.map(v=>h('option',{key:v,value:v},monthLabel(v))),

period!=='custom'&&h('option',{value:'custom'},'Custom date range')),

h('select',{'aria-label':'Financial property',value:buildingFilters.length===1?buildingFilters[0]:'',onChange:e=>setBuildingFilters(e.target.value?[e.target.value]:[])},h('option',{value:''},buildingFilters.length>1?buildingFilters.length+' selected properties':'All properties'),

...db.buildings.filter(b=>!ownerFilters.length||ownerFilters.map(String).includes(String(b.owner_id))).map(b=>h('option',{key:b.id,value:b.id},b.name||b.address))),

custom&&h('div',{className:'f82-custom-dates'},h('label',null,'From',h(PrettyDate,{ariaLabel:'Financial from date',value:fromDate,onChange:setFromDate})),

h('label',null,'To',h(PrettyDate,{ariaLabel:'Financial to date',value:toDate,onChange:setToDate}))));


 return h('div',{className:'f82-workspace'},h('header',{className:'f82-page-head'},h('div',null,h('h1',null,section==='overview'?'Financial overview':'Transactions'),

h('p',null,section==='overview'?'Income, expenses and balances in one place.':'Review financial movements and open every transaction.')),

h('div',{className:'f82-actions'},button('Export',()=>setExport82(true),

false,false,'download'),

h(AddMenu82,null,button('Add income',()=>setIncomeDetail({kind:'income',amount:0}),

false,!canEditWorkspace()),

button('Add expense',()=>setEditing({manual:true,amount:'',expense_date:isoToday(),

category:'Other'}),

false,!canEditWorkspace()),

(MR4U_LOCAL_PREVIEW||window.__MR4U_BANK_ENABLED)&&button(p.syncing?'Checking bank…':'Check bank now',()=>p.refreshBank(false),

false,p.syncing)))),

h('nav',{className:'f82-tabs','aria-label':'Financial pages'},...[[ 'overview','Overview'],['transactions','Transactions'],['payments','Rent payments'],['invoices','Invoices'],['banking','Banking'],['reports','Reports']].map(([id,label])=>h('button',{key:id,'aria-selected':section===id,onClick:()=>['overview','transactions'].includes(id)?changeSection(id):setPage?.(id)},label))),

periodControl,h('div',{className:'f82-kpis'},...[[ 'Income',income,'income','arrowDown'],['Expenses',expenses,'expense','arrowUp'],['Net cash flow',income-expenses,'net','finance'],...(section==='overview'?[['Outstanding rent',outstanding,'outstanding','clock']]:[])].map(([label,n,key,icon])=>h('article',{key},h('span',{className:key},ic(icon,23)),

h('div',null,h('small',null,label),

h('strong',null,eur(n)))))),

p.incomeError&&h('p',{role:'alert',className:'security-error'},p.incomeError),

section==='overview'&&h('div',{className:'f82-overview-charts'},card('Income vs. expenses',h(Chart,{rows:chartRows,year,through})),

card('Rent collection',h('div',{className:'f82-collection'},h('div',{className:'f82-donut',style:{background:collection.length?'conic-gradient(#0a654b 0 '+counts[0][1]/collection.length*100+'%,#e8b952 '+counts[0][1]/collection.length*100+'% '+(counts[0][1]+counts[1][1])/collection.length*100+'%,#c65c46 '+(counts[0][1]+counts[1][1])/collection.length*100+'% 100%)':'#e7ece8'}},h('div',null,h('strong',null,collection.length),

h('small',null,'accounts'))),

h('div',{className:'f82-collection-legend'},...counts.map(([label,n,key])=>h('div',{key},h('i',{className:key}),

h('span',null,label),

h('b',null,n),

h('small',null,collection.length?Math.round(n/collection.length*100)+'%':'0%'))))))),

section==='transactions'&&h('details',{className:'f82-advanced-filters'},h('summary',null,'Search, type, owner & view filters'),

nativeFilters,nativeSummary),

selection,card(section==='overview'?'Recent transactions':'All transactions',h(React.Fragment,null,section==='transactions'&&(p.groupOwner||p.groupCategory||p.view==='cards')?nativeBodies:table(visible),

section==='transactions'&&!p.groupOwner&&!p.groupCategory&&p.view==='list'&&h('footer',{className:'f82-pagination'},h('span',null,'Showing '+(filtered.length?transactionPage*8+1:0)+'–'+Math.min((transactionPage+1)*8,filtered.length)+' of '+filtered.length),

button('Previous',()=>setTransactionPage(n=>Math.max(0,n-1)),

false,transactionPage===0),

h('b',null,transactionPage+1),

button('Next',()=>setTransactionPage(n=>n+1),

false,(transactionPage+1)*8>=filtered.length))),

section==='overview'?button('View all transactions',()=>changeSection('transactions'),

false,false,'arrowRight'):h('label',{className:'f82-search'},ic('search'),

h('input',{'aria-label':'Search transactions',placeholder:'Search payer, property or reference…',value:p.transactionSearch,onChange:e=>p.setTransactionSearch(e.target.value)}))),

...overlays.map(n=>n.type===TransactionDetails71?React.cloneElement(n,{onAccount:()=>{setTransactionDetail(null);
setModal?.({type:'paymentAccount',item:n.props.row.payment})},onProperty:()=>{const b=db.buildings.find(b=>same(b.id,n.props.row.building_id));
if(b){setTransactionDetail(null);
setModal?.({type:'buildingProfile',item:b,tab:'overview'})}},onRemove:(n.props.row.kind==='expense'||n.props.row.bank_receipt)?()=>removeFinancialRow(n.props.row):undefined}):n),
export82&&h(Export82,{rows:filtered,fromDate,toDate,onClose:()=>setExport82(false),

openReport:()=>{setExport82(false);

setExportOpen(true)}}));


};
window.MR4U82={h,button,empty,card,facts,Dialog,badge,shortDate,amount,signed};
})();


(function(){'use strict';const {h,button,empty,card,facts,Dialog,badge,shortDate,amount,signed}=MR4U82,{useState:use,useEffect:effect,useRef:ref}=React,same=(a,b)=>String(a)===String(b),

ic=n=>h(StudioIcon,{name:n,size:18});


window.Export82=function({rows,fromDate,toDate,onClose,openReport}){
 const [type,setType]=use('all'),

[property,setProperty]=use(''),

[format,setFormat]=use('csv'),

[headers,setHeaders]=use(true),

[busy,setBusy]=use(false),

[error,setError]=use(''),

lock=ref(false),

buildings=[...new Map(rows.filter(r=>r.building_id).map(r=>[String(r.building_id),

r.building_name])).entries()],chosen=rows.filter(r=>(type==='all'||r.kind===type)&&(!property||same(r.building_id,property)));


 const safeCell=v=>{const text=String(v??'');

return '"'+(/^[\t\r\n ]*[=+@-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"'};
 async function download(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(format==='xlsx')await MR4UFinanceWorkbook.download({rows:chosen,fromDate,toDate,layout:'list'});else{const columns=['Date','Type','Payer / payee','Owner','Property','Category','Reference / details','Amount EUR','Status'],data=chosen.map(r=>[r.date,r.kind,r.title,r.owner_name,r.building_name,r.category,r.entry?.reference||r.record?.reference||r.tx?.remittance_information||r.detail||'',Number(Number(r.amount).toFixed(2)),r.status]);const csv='\ufeff'+[...(headers?[columns]:[]),...data].map(row=>row.map((value,index)=>index===7&&typeof value==='number'?String(value):safeCell(value)).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Financial-transactions-'+(fromDate||'all')+'-'+(toDate||'all')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 return h(Dialog,{title:'Export transactions',subtitle:'Download the transactions in your current financial view.',onClose,busy,footer:h(React.Fragment,null,button('Cancel',onClose,false,busy),button('Print / PDF report',openReport,false,busy),button(busy?'Preparing…':format==='csv'?'Download CSV':'Download Excel',download,true,busy||!chosen.length,'download'))},h('div',{className:'f82-form'},h('div',{className:'f82-notice'},shortDate(fromDate)+' – '+shortDate(toDate)+' · '+chosen.length+' transactions'),h('label',null,'Property',h('select',{'aria-label':'Export property',value:property,onChange:e=>setProperty(e.target.value)},h('option',{value:''},'All properties in this view'),...buildings.map(([id,name])=>h('option',{key:id,value:id},name)))),h('label',null,'Type',h('select',{'aria-label':'Export transaction type',value:type,onChange:e=>setType(e.target.value)},h('option',{value:'all'},'Income & expenses'),h('option',{value:'income'},'Income'),h('option',{value:'expense'},'Expenses'))),h('label',null,'Format',h('select',{'aria-label':'Export format',value:format,onChange:e=>setFormat(e.target.value)},h('option',{value:'csv'},'CSV'),h('option',{value:'xlsx'},'Excel (XLSX)'))),format==='csv'&&h('label',{className:'f82-check'},h('input',{type:'checkbox',checked:headers,onChange:e=>setHeaders(e.target.checked)}),'Include headers'),error&&h('p',{role:'alert',className:'security-error'},error)));
};
window.TransactionDetails71=function TransactionDrawer82({row,db,onClose,onEdit,onTenant,onAccount,onProperty,onRemove}){
 const [raw,setRaw]=use(false),[error,setError]=use(''),node=ref(null);MR4U81.useDialog(node,onClose);const tx=row.tx,entry=row.entry,payment=row.payment,tenant=row.tenant,account=db.bank_accounts.find(a=>same(a.id,tx?.bank_account_id)),connection=db.bank_connections.find(c=>same(c.id,account?.connection_id)),model=tenant&&payment?tenantStatementModel(tenant,db,[payment.id]):null,rent=model?.rows[0],dateTime=v=>new Date(v).toLocaleString('en-GB',{timeZone:'Europe/Brussels'}),events=[[tx?.created_at,'Imported from bank statement'],[tx?.matched_at,'Payment matched'],[row.record?.created_at,'Record created'],[row.record?.updated_at,'Record updated'],[entry?.created_at,'Payment recorded']].filter(([date])=>date).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),property=db.buildings.find(b=>same(b.id,row.building_id));
 const openAccount=()=>{if(onAccount)onAccount();else if(onTenant)onTenant()},original=()=>setRaw(true),download=async()=>{try{await downloadPaymentStatementPdf(model)}catch(e){setError(e.message)}};
 return h(React.Fragment,null,ReactDOM.createPortal(h('div',{className:'f82-drawer-bg',onMouseDown:e=>{if(e.target===e.currentTarget)onClose()}},h('section',{ref:node,className:'f82-drawer',role:'dialog','aria-modal':true,'aria-label':'Transaction details'},h('header',null,h('h2',null,'Transaction details'),button('Close',onClose,false,false,'close')),h('div',{className:'f82-drawer-scroll'},h('div',{className:'f82-drawer-amount '+row.kind},h('strong',null,signed(row.amount)),h('span',null,entry?'Rent payment received':row.kind==='income'?'Incoming payment':'Outgoing expense'),badge(row)),card('Transaction information',facts([['Date',shortDate(row.date)],[row.kind==='income'?'Payer':'Payee',row.title],['Property',h('div',null,row.building_name,property&&onProperty&&button('View property',onProperty))],['Owner',row.owner_name],['Category',row.category],['Payment method',entry?.method|| (tx?'Bank transfer':'Manual entry')],['Bank',connection?.display_name||connection?.provider],['Account',account?.iban?formatIban(account.iban):null],['Reference',entry?.reference||row.record?.reference||tx?.remittance_information||row.detail]])),rent&&card('Linked monthly account',h(React.Fragment,null,h('h4',null,rent.month),facts([['Total due',eur(rent.due)],['Received',eur(rent.paid)],[rent.credit>.005?'Credit':'Outstanding',eur(rent.credit>.005?rent.credit:rent.bal)]]),h('span',{className:'f82-badge '+(rent.bal<=.005?'matched':'review')},rent.credit>.005?'Credit':rent.bal<=.005?'Paid':rent.paid>.005?'Partly paid':'Unpaid'),button('View monthly account',openAccount,false,false,'file'))),row.record?.notes&&card('Note',h('p',{className:'f82-preserve'},row.record.notes)),card('Activity',events.length?h('div',{className:'f82-timeline'},...events.map(([date,label],i)=>h('div',{key:i},h('i'),h('span',null,h('b',null,label),h('small',null,dateTime(date)))))):empty('No timestamped activity is recorded for this transaction.')),tx&&button('Original bank transaction',original,false,false,'bank'),!entry&&h('div',{className:'f82-actions'},button(row.bank_receipt?'Match / classify payment':'Edit transaction',onEdit,true,!canEditWorkspace(),'pen'),onRemove&&button(tx?'Remove from Financials':'Delete expense',onRemove,false,!canEditWorkspace(),'trash')),error&&h('p',{role:'alert',className:'security-error'},error)),h('footer',null,tenant&&button('View tenant',onTenant,false,false,'users'),rent&&button('Download statement',download,true,false,'download'),!tenant&&button('Done',onClose,true)))),document.body),raw&&h(Dialog,{title:'Original bank transaction',subtitle:'Read-only bank record',onClose:()=>setRaw(false),footer:button('Close',()=>setRaw(false))},facts([['Sender / counterparty',tx.counterparty_name],['Booking date',shortDate(tx.booking_date)],['Value date',shortDate(tx.value_date)],['Amount',eur(tx.amount)],['Bank reference',tx.remittance_information],['Counterparty IBAN',tx.counterparty_iban?formatIban(tx.counterparty_iban):'Not supplied'],['External transaction identifier',tx.external_transaction_id]])));
};
const NativeIncome=FinancialIncomeDialog;
FinancialIncomeDialog=function IncomeForm82({row,db,onClose,onSaved,onPosted,onDelete}){
 const rec=row.record||{},tx=row.tx,[mode,setMode]=use(tx&&row.suggestion?.tenant?'rent':'income'),[tenantId,setTenantId]=use(String(row.suggestion?.tenant?.id||'')),[draft,setDraft]=use({payer:rec.payer||tx?.counterparty_name||row.title||'',category:rec.category||'Other income',amount:rec.amount??tx?.amount??'',income_date:rec.income_date||tx?.booking_date||isoToday(),building_id:rec.building_id||'',owner_id:rec.owner_id||'',reference:rec.reference??tx?.remittance_information??'',notes:rec.notes||''}),[busy,setBusy]=use(false),[error,setError]=use(''),[allocate,setAllocate]=use(false),[result,setResult]=use(null),lock=ref(false),request=ref(crypto.randomUUID()),tenant=db.tenants.find(t=>same(t.id,tenantId));
 const set=(k,v)=>setDraft(d=>({...d,[k]:v,...k==='building_id'?{owner_id:db.buildings.find(b=>same(b.id,v))?.owner_id||''}:{}})),synthetic=tx||{amount:Number(String(draft.amount).replace(',','.')),booking_date:draft.income_date,counterparty_name:draft.payer,remittance_information:draft.reference},field=(k,label,type='text')=>h('label',null,label,type==='date'?h(PrettyDate,{ariaLabel:label,value:draft[k],onChange:v=>set(k,v),disabled:busy||!!tx||!canEditWorkspace()}):h(type==='textarea'?'textarea':'input',{'aria-label':label,type:type==='textarea'?undefined:type,rows:type==='textarea'?4:undefined,value:draft[k],disabled:busy||!canEditWorkspace()||!!tx&&k==='amount',onChange:e=>set(k,e.target.value),maxLength:k==='notes'?10000:2000}));
 async function save(){if(lock.current||!canEditWorkspace())return;setError('');const n=Number(String(draft.amount).replace(',','.'));if(!draft.payer.trim()||!Number.isFinite(n)||n<=0||!draft.income_date){setError('Enter a payer, a positive amount and a date.');return}lock.current=true;setBusy(true);try{const r=await sysCall('income_save',{id:rec.id,record:{...draft,amount:n,bank_transaction_id:tx?.id||rec.bank_transaction_id||null}});if(!r?.record?.id)throw Error('The income was not confirmed.');onSaved(r.record);showSaved('Income saved');onClose()}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 async function post(allocations,receiptOptions){if(lock.current||!tenant||!canEditWorkspace())return;lock.current=true;setBusy(true);setError('');const before=tenantStatementModel(tenant,db).rows;const balances=allocations.map(a=>{const payment=db.payments.find(p=>same(p.id,a.payment_id)),row=before.find(r=>same(r.id,a.payment_id)),due=row?Number(row.bal)-Number(row.credit||0):tenantCurrentBaseRent(tenant)+Number(tenant.additional_costs||0);return {label:payment?monthLabel(payment.year+'-'+String(payment.month).padStart(2,'0')):monthLabel(a.year+'-'+String(a.month).padStart(2,'0')),amount:Number(a.amount),remaining:due-Number(a.amount)}});try{const r=tx?await sysCall('bank_match_post',{transaction_id:tx.id,tenant_id:tenant.id,allocations,...receiptOptions}):await sysCall('payment_manual_post',{tenant_id:tenant.id,request_id:request.current,amount:Number(String(draft.amount).replace(',','.')),payment_date:draft.income_date,method:'other',reference:draft.reference,notes:draft.notes,allocations,...receiptOptions});if(!r?.ok)throw Error('The payment was not confirmed. Review the monthly accounts before retrying.');onPosted(synthetic,r);setResult({result:r,allocations,tenant,balances});setAllocate(false)}catch(e){setAllocate(false);setError(e.message)}finally{lock.current=false;setBusy(false)}}
 if(row.entry)return h(NativeIncome,{row,db,onClose,onSaved,onPosted,onDelete});
 if(allocate&&tenant)return h(BankAllocationCard,{db,tenant,transaction:synthetic,busy,onCancel:()=>!busy&&setAllocate(false),onTenantChange:t=>!busy&&setTenantId(String(t.id)),onPost:post});
 if(result)return h(Dialog,{title:'Payment recorded',onClose,footer:h(React.Fragment,null,button('View tenant accounts',()=>{window.dispatchEvent(new CustomEvent('mr4u-open-tenant82',{detail:{tenant:result.tenant}}));onClose()}),button('Done',onClose,true))},h('div',{className:'f82-success'},ic('check'),h('h3',null,eur(synthetic.amount)),h('p',null,'The payment was confirmed and allocated to the selected monthly accounts.'),h('table',{className:'f82-table'},h('thead',null,h('tr',null,h('th',null,'Month'),h('th',null,'Allocated'),h('th',null,'Remaining / credit'))),h('tbody',null,...result.balances.map((a,i)=>h('tr',{key:i},h('td',null,a.label),h('td',null,eur(a.amount)),h('td',null,a.remaining<-.005?'Credit '+eur(-a.remaining):eur(Math.max(0,a.remaining))))))),result.result.receipt_warning&&h('p',{role:'alert',className:'security-error'},'Payment recorded. Thank-you email needs review: '+result.result.receipt_warning),h('p',null,'Updated payments are available in the tenant’s monthly accounts.')));
 return h(Dialog,{title:rec.id?'Edit income':tx?'Review incoming payment':'Add income',subtitle:tx?'Review the bank receipt before matching or classifying it.':undefined,onClose,busy,footer:h(React.Fragment,null,rec.id&&button('Delete income',async()=>{if(lock.current||!canEditWorkspace()||!await appConfirm('Delete this income record? The original bank transaction, if linked, stays available.',{confirmText:'Delete income'}))return;lock.current=true;setBusy(true);try{const r=await sysCall('income_delete',{id:rec.id});if(!r.ok)throw Error('Deletion was not confirmed.');onDelete(rec);onClose()}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}},false,busy||!canEditWorkspace(),'trash'),h('span'),button('Cancel',onClose,false,busy),mode==='income'?button(busy?'Saving…':'Save income',save,true,busy||!canEditWorkspace()):button('Choose month / split payment',()=>{if(!tenant||!Number.isFinite(Number(synthetic.amount))||Number(synthetic.amount)<=0){setError('Choose a tenant and enter a positive amount.');return}setAllocate(true)},true,busy||!tenant||!canEditWorkspace()))},h('div',{className:'f82-form'},!rec.id&&h('div',{className:'f82-segments'},button('Other income',()=>setMode('income'),mode==='income',busy),button('Rent payment',()=>setMode('rent'),mode==='rent',busy)),tx&&card('Bank receipt',facts([['Payer',tx.counterparty_name],['Date',shortDate(tx.booking_date)],['Amount',eur(tx.amount)],['Reference',tx.remittance_information]])),mode==='rent'?h(React.Fragment,null,row.suggestion?.tenant&&h('div',{className:'f82-notice'},'Suggested match: '+row.suggestion.tenant.name+' · '+(row.suggestion.reasons||[]).join(', ')),h('label',null,'Tenant',h('select',{'aria-label':'Income tenant',value:tenantId,disabled:busy||!canEditWorkspace(),onChange:e=>setTenantId(e.target.value)},h('option',{value:''},'Choose tenant'),...db.tenants.map(t=>h('option',{key:t.id,value:t.id},t.name)))),!tx&&h('div',{className:'f82-grid'},field('amount','Amount received'),field('income_date','Payment date','date')),!tx&&field('reference','Reference'),!tx&&field('notes','Note','textarea'),h('p',null,'Review the tenant, then choose the current month, the previous month or a split.')):h(React.Fragment,null,field('payer','Payer / income name'),field('category','Category'),h('div',{className:'f82-grid'},field('amount','Amount'),field('income_date','Date','date'),h('label',null,'Property (optional)',h('select',{'aria-label':'Income property',value:draft.building_id,disabled:busy||!canEditWorkspace(),onChange:e=>set('building_id',e.target.value)},h('option',{value:''},'General / not linked'),...db.buildings.map(b=>h('option',{key:b.id,value:b.id},b.name||b.address)))),h('label',null,'Owner (optional)',h('select',{'aria-label':'Income owner',value:draft.owner_id,disabled:busy||!canEditWorkspace()||!!draft.building_id,onChange:e=>set('owner_id',e.target.value)},h('option',{value:''},'No owner / general income'),...db.owners.map(o=>h('option',{key:o.id,value:o.id},o.name))))),field('reference','Reference'),field('notes','Note','textarea'),!rec.id&&!tx&&h('div',{className:'f82-notice'},'For rent, choose Rent payment to allocate the receipt to a tenant.')),error&&h('p',{role:'alert',className:'security-error'},error)));
};
})();
(function(){'use strict';const {h,button,Dialog,empty}=MR4U82,{useState:use,useRef:ref}=React,same=(a,b)=>String(a)===String(b);
function expenseNote(text){let notes=String(text||''),reference='',unit='';const a=notes.match(/^Invoice \/ reference: ([^\n]*)\n/);if(a){reference=a[1];notes=notes.slice(a[0].length)}const b=notes.match(/^Unit: ([^\n]*)\n/);if(b){unit=b[1];notes=notes.slice(b[0].length)}return {notes,reference,unit}}
ExpenseEditor=function ExpenseForm82({item,db,onClose,onSave,onIgnore,onDelete,existing}){
 const tx=item.tx||null,original=item.draft||item,meta=expenseNote(original.notes),[draft,setDraft]=use({...original,supplier:original.supplier||(tx?expenseCounterparty(tx):''),amount:original.amount??Math.abs(Number(tx?.amount||0)),expense_date:original.expense_date||tx?.booking_date||isoToday(),notes:meta.notes,reference:meta.reference,unit:meta.unit}),[busy,setBusy]=use(false),[error,setError]=use(''),[custom,setCustom]=use(()=>{try{return JSON.parse(localStorage.getItem('mr4u_financial_categories')||'[]')}catch{return []}}),[category,setCategory]=use(''),[showCategory,setShowCategory]=use(false),lock=ref(false),categories=[...new Set(['Maintenance','Utilities','Insurance','Mortgage / loan','Tax','Cleaning','Syndic','Internet','Professional fees','Other',draft.category,...custom].filter(Boolean))],units=db.units.filter(u=>same(u.building_id,draft.building_id)),set=(k,v)=>setDraft(d=>({...d,[k]:v,...k==='building_id'?{unit:''}:{}}));
 const field=(key,label,type='text')=>h('label',null,label,type==='date'?h(PrettyDate,{ariaLabel:label,value:draft[key],disabled:busy||!!tx||!canEditWorkspace(),onChange:v=>set(key,v)}):h(type==='textarea'?'textarea':'input',{'aria-label':label,value:draft[key]??'',type:type==='textarea'?undefined:type,rows:type==='textarea'?4:undefined,maxLength:key==='notes'?3000:500,disabled:busy||!canEditWorkspace()||!!tx&&key==='amount',onChange:e=>set(key,e.target.value)}));
 async function save(){if(lock.current||!canEditWorkspace())return;setError('');const n=Number(String(draft.amount).replace(',','.'));if(!draft.supplier.trim()||!Number.isFinite(n)||n<=0||!draft.expense_date){setError('Enter a supplier, a positive amount and a date.');return}lock.current=true;setBusy(true);try{const notes=(draft.reference?'Invoice / reference: '+draft.reference.replace(/[\r\n]+/g,' ')+'\n':'')+(draft.unit?'Unit: '+draft.unit.replace(/[\r\n]+/g,' ')+'\n':'')+(draft.notes||'');if(notes.length>4000)throw Error('Shorten the reference or note to fit this record.');const result=await onSave(tx,{...draft,amount:n,notes});if(result!==false)onClose()}catch(e){setError(e.message||'Could not save this expense.')}finally{lock.current=false;setBusy(false)}}
 async function remove(fn,arg){if(lock.current||!canEditWorkspace())return;lock.current=true;setBusy(true);setError('');try{await fn(arg)}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
 return h(Dialog,{title:tx?'Review expense':existing?'Edit expense':'Add expense',subtitle:tx?'Assign the saved bank transaction. Its amount and date stay tied to the bank record.':undefined,onClose,busy,footer:h(React.Fragment,null,tx&&button('Not an expense',()=>remove(onIgnore,tx),false,busy||!canEditWorkspace(),'trash'),existing&&button('Delete saved expense',()=>remove(onDelete,existing),false,busy||!canEditWorkspace(),'trash'),h('span'),button('Cancel',onClose,false,busy),button(busy?'Saving…':'Save expense',save,true,busy||!canEditWorkspace()))},h('div',{className:'f82-form'},field('supplier','Supplier'),h('label',null,'Category',h('select',{'aria-label':'Expense category',value:draft.category||'Other',disabled:busy||!canEditWorkspace(),onChange:e=>e.target.value==='__add__'?setShowCategory(true):set('category',e.target.value)},...categories.map(c=>h('option',{key:c,value:c},c)),h('option',{value:'__add__'},'+ Add category…'))),showCategory&&h('div',{className:'f82-actions'},h('input',{'aria-label':'New expense category',value:category,onChange:e=>setCategory(e.target.value),maxLength:120}),button('Add category',()=>{const v=category.trim();if(!v)return;const next=[...new Set([...custom,v])];setCustom(next);try{localStorage.setItem('mr4u_financial_categories',JSON.stringify(next))}catch{}set('category',v);setShowCategory(false)},false,!category.trim())),custom.includes(draft.category)&&button('Remove custom category',async()=>{if(!await appConfirm('Remove this custom category from the list? Existing records keep their saved category.'))return;const next=custom.filter(c=>c!==draft.category);setCustom(next);try{localStorage.setItem('mr4u_financial_categories',JSON.stringify(next))}catch{}set('category','Other')},false,busy||!canEditWorkspace()),h('div',{className:'f82-grid'},field('amount','Amount'),field('expense_date','Date','date'),h('label',null,'Property (optional)',h('select',{'aria-label':'Expense property',value:draft.building_id||'',disabled:busy||!canEditWorkspace(),onChange:e=>set('building_id',e.target.value)},h('option',{value:''},'General / not linked'),...db.buildings.map(b=>h('option',{key:b.id,value:b.id},b.name||b.address)))),h('label',null,'Unit (optional)',h('select',{'aria-label':'Expense unit',value:draft.unit||'',disabled:busy||!canEditWorkspace()||!draft.building_id,onChange:e=>set('unit',e.target.value)},h('option',{value:''},'All units'),...units.map(u=>h('option',{key:u.id,value:u.unit_number||u.name||u.id},'Unit '+(u.unit_number||u.name||u.id)))))),field('reference','Invoice / reference'),field('notes','Note','textarea'),tx&&h('details',null,h('summary',null,'Original bank reference'),h('p',null,tx.remittance_information||expenseReference(tx)||'Not supplied')),error&&h('p',{role:'alert',className:'security-error'},error)));
};
const NativeAllocation=BankAllocationCard;
BankAllocationCard=function Allocation82(props){const lock=ref(false),tree=NativeAllocation({...props,onPost:async(a,o)=>{if(lock.current||!canEditWorkspace())return;lock.current=true;try{return await props.onPost(a,o)}finally{lock.current=false}}});return ReactDOM.createPortal(React.cloneElement(tree.children,{className:'f82-allocation-bg '+tree.children.props.className}),tree.containerInfo)};
})();
