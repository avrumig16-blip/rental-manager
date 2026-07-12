
import React,{useEffect,useState}from"react";
import{createRoot}from"react-dom/client";
import{createClient}from"@supabase/supabase-js";
import"./style.css";

const supabase=createClient("https://yiileradnxvlvkikyuwi.supabase.co","sb_publishable_bCyn05Ht69i9AmFvQhf2IQ_s_MnTsuD");
const blank={owners:[],buildings:[],units:[],tenants:[],tenant_units:[],payments:[],payment_entries:[]};
const eur=n=>new Intl.NumberFormat("nl-BE",{style:"currency",currency:"EUR"}).format(Number(n||0));
const money=t=>Number(t?.base_rent??t?.rent??0)+Number(t?.additional_costs??0);
const validMonth=p=>Number(p?.year)>=2000&&Number(p?.month)>=1&&Number(p?.month)<=12;
const monthLabel=p=>validMonth(p)?new Date(Number(p.year),Number(p.month)-1,1).toLocaleString("en-GB",{month:"short",year:"numeric"}):"Invalid month";
const monthLongLabel=p=>validMonth(p)?new Date(Number(p.year),Number(p.month)-1,1).toLocaleString("en-GB",{month:"long",year:"numeric"}):"Invalid month";

function App(){
 const[session,setSession]=useState(null),[db,setDb]=useState(blank),[page,setPage]=useState("dashboard"),[modal,setModal]=useState(null),[q,setQ]=useState("");
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session)load()});const{data}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);if(s)load()});return()=>data.subscription.unsubscribe()},[]);
 async function load(){const names=Object.keys(blank);const res=await Promise.all(names.map(t=>supabase.from(t).select("*").order("id")));let next={};names.forEach((n,i)=>next[n]=res[i].data||[]);setDb(next)}
 if(!session)return <Login/>;
 return <div className="app"><aside><div className="brand"><div className="logo">🏠</div><div><h2>Property Manager Pro</h2><small>{session.user.email}</small></div></div><input className="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..."/>{["dashboard","owners","buildings","units","tenants","payments"].map(p=><button key={p} onClick={()=>setPage(p)}>{p}</button>)}<button onClick={()=>supabase.auth.signOut()}>Logout</button><h4>Portfolio</h4><Portfolio db={db} q={q} setModal={setModal}/></aside><main><header><div><h1>{cap(page)}</h1><small>React Sprint 2.1</small></div><div className="actions">{["owner","building","unit","tenant","payment"].map(t=><button key={t} className={t==="owner"?"primary":""} onClick={()=>setModal({type:t})}>+ {cap(t)}</button>)}</div></header><section className="content">{page==="dashboard"&&<Dashboard db={db} setModal={setModal}/>} {page==="owners"&&<Owners db={db} setModal={setModal}/>} {page==="buildings"&&<Buildings db={db} setModal={setModal}/>} {page==="units"&&<Units db={db} setModal={setModal}/>} {page==="tenants"&&<Tenants db={db} setModal={setModal}/>} {page==="payments"&&<Payments db={db} setModal={setModal} reload={load}/>}</section></main>{modal&&<Modal modal={modal} setModal={setModal} db={db} reload={load}/>}</div>
}
function cap(s){return s[0].toUpperCase()+s.slice(1)}
function Login(){const[e,setE]=useState(""),[p,setP]=useState(""),[err,setErr]=useState("");async function login(){setErr("");const{error}=await supabase.auth.signInWithPassword({email:e,password:p});if(error)setErr(error.message)}return <div className="login"><div className="login-card"><h1>🏠 Property Manager Pro</h1><p>React Sprint 2.1</p><label>Email<input value={e} onChange={x=>setE(x.target.value)}/></label><label>Password<input type="password" value={p} onChange={x=>setP(x.target.value)}/></label><button className="primary full" onClick={login}>Login</button>{err&&<div className="error">{err}</div>}</div></div>}
function Dashboard({db,setModal}){let out=db.payments.reduce((s,p)=>s+Math.max(0,Number(p.expected_amount||0)-Number(p.paid_amount||0)),0);return <><div className="grid"><Card l="Owners" v={db.owners.length}/><Card l="Buildings" v={db.buildings.length}/><Card l="Units" v={db.units.length}/><Card l="Outstanding" v={eur(out)}/></div><Panel title="Quick Actions"><div className="tiles"><Tile t="+ Tenant" s="multi unit" onClick={()=>setModal({type:"tenant"})}/><Tile t="+ Payment" s="rent record" onClick={()=>setModal({type:"payment"})}/><Tile t="+ Owner" s="new owner" onClick={()=>setModal({type:"owner"})}/></div></Panel></>}
function Owners(p){return <List title="Owners" add={()=>p.setModal({type:"owner"})}>{p.db.owners.map(o=><Row key={o.id} t={o.name||"Owner"} s={`${o.email||""} ${o.phone||""}`} onClick={()=>p.setModal({type:"owner",item:o})}/>)}</List>}
function Buildings(p){return <List title="Buildings" add={()=>p.setModal({type:"building"})}>{p.db.buildings.map(b=>{let o=p.db.owners.find(x=>x.id===b.owner_id),c=p.db.units.filter(u=>u.building_id===b.id).length;return <Row key={b.id} t={b.name||"Building"} s={`${o?.name||"No owner"} · ${c} units · ${b.address||""}`} onClick={()=>p.setModal({type:"building",item:b})}/>})}</List>}
function Units(p){return <List title="Units" add={()=>p.setModal({type:"unit"})}>{p.db.units.map(u=>{let b=p.db.buildings.find(x=>x.id===u.building_id),ts=tenantsForUnit(p.db,u.id).map(t=>t.name).join(", ");return <Row key={u.id} t={`${b?.name||"Building"} · Unit ${u.unit_number||""}`} s={ts||"Vacant"} onClick={()=>p.setModal({type:"unit",item:u})}/>})}</List>}
function Tenants(p){return <List title="Tenants" add={()=>p.setModal({type:"tenant"})}>{p.db.tenants.map(t=>{let us=unitsForTenant(p.db,t.id).map(u=>unitLabel(p.db,u)).join(", ");return <Row key={t.id} t={t.name||"Tenant"} s={`${eur(money(t))} · ${us||"No units"}`} onClick={()=>p.setModal({type:"tenant",item:t})}/>})}</List>}
function Payments({db,setModal,reload}){
 const rows=[...db.payments].sort((a,b)=>(b.year-a.year)||(b.month-a.month));
 const[statusFilter,setStatusFilter]=useState("all"),[monthFilter,setMonthFilter]=useState(""),[search,setSearch]=useState("");
 const paidTotal=id=>db.payment_entries.filter(x=>String(x.payment_id)===String(id)).reduce((s,x)=>s+Number(x.amount||0),0);
 const statusFor=p=>{const paid=paidTotal(p.id),due=Number(p.expected_amount||0);return paid<=0?"unpaid":paid<due?"partial":"paid"};
 const filtered=rows.filter(p=>{const t=db.tenants.find(x=>x.id===p.tenant_id),st=statusFor(p),mk=`${p.year}-${String(p.month).padStart(2,"0")}`;return(statusFilter==="all"||st===statusFilter)&&(!monthFilter||mk===monthFilter)&&(!search||String(t?.name||"").toLowerCase().includes(search.toLowerCase()))});
 async function gen(){let d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,c=0,s=0,f=0,msg="";for(let t of db.tenants.filter(x=>x.active!==false)){if(db.payments.some(p=>p.tenant_id===t.id&&Number(p.year)===y&&Number(p.month)===m)){s++;continue}let r=await supabase.from("payments").insert({tenant_id:t.id,year:y,month:m,expected_amount:money(t),paid_amount:0,status:"pending"});if(r.error){f++;msg=r.error.message}else c++}alert(`Created: ${c}\nAlready existed: ${s}\nFailed: ${f}`+(msg?`\n${msg}`:""));await reload()}
 return <><div className="payments-toolbar"><div className="status-tabs">{["all","paid","partial","unpaid"].map(s=><button key={s} className={statusFilter===s?"active":""} onClick={()=>setStatusFilter(s)}>{cap(s)}</button>)}</div><input type="month" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tenant..."/><button onClick={gen}>Generate This Month</button><button className="primary" onClick={()=>setModal({type:"payment"})}>+ Monthly account</button></div><div className="payments-table"><div className="payments-head"><span>Tenant</span><span>Month</span><span>Due</span><span>Paid</span><span>Balance</span><span>Status</span></div>{filtered.map(p=>{let t=db.tenants.find(x=>x.id===p.tenant_id),paid=paidTotal(p.id),due=Number(p.expected_amount||0),balance=Math.max(0,due-paid),st=statusFor(p);return <button key={p.id} className="payments-row" onClick={()=>setModal({type:"paymentAccount",item:p})}><span><b>{t?.name||"Tenant"}</b></span><span>{monthLabel(p)}</span><span>{eur(due)}</span><span>{eur(paid)}</span><span>{eur(balance)}</span><span><span className={`status-badge ${st}`}>{st==="paid"?"Paid in full":st==="partial"?"Partially paid":"Unpaid"}</span></span></button>})}{!filtered.length&&<div className="empty">No payments match the selected filters.</div>}</div></>
}
function Portfolio({db,q,setModal}){let s=q.toLowerCase();return <div>{db.owners.filter(o=>!s||String(o.name||"").toLowerCase().includes(s)).map(o=><div key={o.id}><div className="tree" onClick={()=>setModal({type:"owner",item:o})}>👤 {o.name||"Owner"}</div><div className="child">{db.buildings.filter(b=>b.owner_id===o.id).map(b=><div key={b.id}><div className="tree" onClick={()=>setModal({type:"building",item:b})}>🏢 {b.name||"Building"}</div><div className="child">{db.units.filter(u=>u.building_id===b.id).map(u=><div key={u.id} className="tree" onClick={()=>setModal({type:"unit",item:u})}>🚪 {u.unit_number||"Unit"}</div>)}</div></div>)}</div></div>)}</div>}
function Modal({modal,setModal,db,reload}){
 const now=new Date();
 const initialItem=modal.item||(modal.type==="payment"?{year:now.getFullYear(),month:now.getMonth()+1,paid_amount:0}:{});
 const[item,setItem]=useState(initialItem),[unitIds,setUnitIds]=useState(()=>modal.type==="tenant"?unitsForTenant(db,modal.item?.id).map(u=>u.id):[]);function set(k,v){setItem(x=>({...x,[k]:v}))}function toggle(id){setUnitIds(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id])}
 if(modal.type==="paymentAccount")return <PaymentAccountModal payment={modal.item} db={db} setModal={setModal} reload={reload}/>;
 async function save(){
  let table=modal.type+"s",payload=payloadFor(modal.type,item);
  if(modal.type==="payment"){
   if(!payload.tenant_id)return alert("Choose a tenant.");
   if(payload.year<2000||payload.month<1||payload.month>12)return alert("Choose a valid month.");
   if(payload.expected_amount<0)return alert("Rent due cannot be negative.");
   if(!modal.item?.id&&db.payments.some(p=>String(p.tenant_id)===String(payload.tenant_id)&&Number(p.year)===payload.year&&Number(p.month)===payload.month))return alert("A monthly account already exists for this tenant and month.");
  }
  let res=modal.item?.id?await supabase.from(table).update(payload).eq("id",modal.item.id):await supabase.from(table).insert(payload).select().single();
  if(res.error)return alert(res.error.message);
  let id=modal.item?.id||res.data?.id;
  if(modal.type==="tenant"){await supabase.from("tenant_units").delete().eq("tenant_id",id);if(unitIds.length){let r=await supabase.from("tenant_units").insert(unitIds.map(unit_id=>({tenant_id:id,unit_id})));if(r.error)return alert(r.error.message)}}
  await reload();setModal(null)
 }
 async function del(){if(!confirm("Delete?"))return;if(modal.type==="tenant")await supabase.from("tenant_units").delete().eq("tenant_id",modal.item.id);let r=await supabase.from(modal.type+"s").delete().eq("id",modal.item.id);if(r.error)return alert(r.error.message);await reload();setModal(null)}
 return <div className="modal-bg"><div className="modal"><div className="modal-head"><h3>{modal.item?"Edit":"Add"} {modal.type}</h3><button onClick={()=>setModal(null)}>×</button></div><div className="modal-body"><Form type={modal.type} item={item} set={set} db={db} unitIds={unitIds} toggle={toggle}/></div><div className="modal-foot">{modal.item?.id&&<button className="danger" onClick={del}>Delete</button>}<span/><button onClick={()=>setModal(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></div></div></div>
}
function PaymentAccountModal({payment,db,setModal,reload}){const tenant=db.tenants.find(x=>x.id===payment.tenant_id),entries=db.payment_entries.filter(x=>String(x.payment_id)===String(payment.id)).sort((a,b)=>String(b.payment_date||"").localeCompare(String(a.payment_date||""))),paid=entries.reduce((s,x)=>s+Number(x.amount||0),0),due=Number(payment.expected_amount||0),balance=Math.max(0,due-paid),status=paid<=0?"unpaid":paid<due?"partial":"paid";const[amount,setAmount]=useState(""),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[method,setMethod]=useState("bank"),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 async function sync(){const{data}=await supabase.from("payment_entries").select("amount").eq("payment_id",payment.id);const total=(data||[]).reduce((s,x)=>s+Number(x.amount||0),0),st=total<=0?"pending":total<due?"partial":"paid";await supabase.from("payments").update({paid_amount:total,status:st}).eq("id",payment.id)}
 async function add(){let v=Number(amount||0);if(v<=0)return alert("Enter a payment amount.");let r=await supabase.from("payment_entries").insert({payment_id:payment.id,amount:v,payment_date:date,method,reference,notes});if(r.error)return alert(r.error.message);await sync();await reload();setModal({type:"paymentAccount",item:payment})}
 async function remove(id){if(!confirm("Delete this payment entry?"))return;let r=await supabase.from("payment_entries").delete().eq("id",id);if(r.error)return alert(r.error.message);await sync();await reload();setModal({type:"paymentAccount",item:payment})}
 async function deleteAccount(){if(!confirm("Delete this monthly account and all payment entries?"))return;let r=await supabase.from("payments").delete().eq("id",payment.id);if(r.error)return alert(r.error.message);await reload();setModal(null)}
 return <div className="modal-bg"><div className="modal payment-account-modal"><div className="modal-head"><div><h3>{tenant?.name||"Tenant"} · {monthLongLabel(payment)}</h3><small>Monthly rent account</small></div><button onClick={()=>setModal(null)}>×</button></div><div className="payment-summary"><div><small>Rent due</small><b>{eur(due)}</b></div><div><small>Paid so far</small><b>{eur(paid)}</b></div><div><small>Still due</small><b>{eur(balance)}</b></div><div><small>Status</small><span className={`status-badge ${status}`}>{status==="paid"?"Paid in full":status==="partial"?"Partially paid":"Unpaid"}</span></div></div><div className="payment-account-body"><div className="payment-history"><h4>Payment history</h4>{entries.length?entries.map(e=><div className="payment-entry" key={e.id}><div><b>{eur(e.amount)}</b><small>{e.payment_date||""} · {cap(e.method||"other")}{e.reference?` · ${e.reference}`:""}</small>{e.notes&&<small>{e.notes}</small>}</div><button className="danger subtle" onClick={()=>remove(e.id)}>Delete</button></div>):<div className="empty">No payments added yet.</div>}</div><div className="add-payment-box"><h4>Add payment</h4><Field l="Amount" type="number" v={amount} set={setAmount}/><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option value="bank">Bank</option><option value="cash">Cash</option><option value="wise">Wise</option><option value="other">Other</option></select></label><Field l="Reference" v={reference} set={setReference}/><label>Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary full" onClick={add}>Add payment</button></div></div><div className="modal-foot"><button className="danger" onClick={deleteAccount}>Delete monthly account</button><span/><button onClick={()=>setModal(null)}>Close</button></div></div></div>
}
function Form({type,item,set,db,unitIds,toggle}){if(type==="owner")return <><Field l="Name" v={item.name} set={v=>set("name",v)}/><Field l="Email" v={item.email} set={v=>set("email",v)}/><Field l="Phone" v={item.phone} set={v=>set("phone",v)}/><Field l="IBAN" v={item.iban} set={v=>set("iban",v)}/><label className="wide">Notes<textarea value={item.notes||""} onChange={e=>set("notes",e.target.value)}/></label></>;if(type==="building")return <><label>Owner<select value={item.owner_id||""} onChange={e=>set("owner_id",e.target.value?Number(e.target.value):null)}><option value="">No owner</option>{db.owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><Field l="Name" v={item.name} set={v=>set("name",v)}/><label className="wide">Address<input value={item.address||""} onChange={e=>set("address",e.target.value)}/></label></>;if(type==="unit")return <><label>Building<select value={item.building_id||""} onChange={e=>set("building_id",e.target.value?Number(e.target.value):null)}><option value="">Choose building</option>{db.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><Field l="Unit number" v={item.unit_number} set={v=>set("unit_number",v)}/><Field l="Floor" v={item.floor} set={v=>set("floor",v)}/></>;if(type==="tenant")return <><div className="wide"><TenantUnitsPicker db={db} unitIds={unitIds} toggle={toggle}/></div><Field l="Name" v={item.name} set={v=>set("name",v)}/><Field l="Base rent" type="number" v={item.base_rent??item.rent??0} set={v=>set("base_rent",v)}/><Field l="Costs" type="number" v={item.additional_costs??0} set={v=>set("additional_costs",v)}/><Field l="Phone" v={item.phone} set={v=>set("phone",v)}/><Field l="Email" v={item.email} set={v=>set("email",v)}/><Field l="IBAN" v={item.iban} set={v=>set("iban",v)}/></>;if(type==="payment"){
 const ym=validMonth(item)?`${item.year}-${String(item.month).padStart(2,"0")}`:"";
 return <><label>Tenant<select value={item.tenant_id||""} onChange={e=>{let id=Number(e.target.value),t=db.tenants.find(x=>x.id===id);set("tenant_id",id);if(t&&!item.expected_amount)set("expected_amount",money(t))}}><option value="">Choose tenant</option>{db.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Month<input type="month" value={ym} onChange={e=>{const value=e.target.value;if(!value){set("year",0);set("month",0);return}set("year",Number(value.slice(0,4)));set("month",Number(value.slice(5,7)))}}/></label><Field l="Rent due" type="number" v={item.expected_amount??0} set={v=>set("expected_amount",v)}/><div className="wide form-note">Create the monthly account first. Open it from the Payments list to add one or more installments.</div></>}return null}

function TenantUnitsPicker({db,unitIds,toggle}){
 const[open,setOpen]=useState({});
 const[showOther,setShowOther]=useState(false);

 function toggleBuilding(id){
  setOpen(x=>({...x,[id]:!x[id]}));
 }

 const selectedBuildingIds=db.buildings
  .filter(b=>db.units.some(u=>u.building_id===b.id&&unitIds.includes(u.id)))
  .map(b=>b.id);

 const visibleBuildings=showOther
  ?db.buildings
  :db.buildings.filter(b=>selectedBuildingIds.includes(b.id));

 function BuildingGroup({b}){
  const units=db.units.filter(u=>u.building_id===b.id);
  const selected=units.filter(u=>unitIds.includes(u.id)).length;
  return <div className="building-group" key={b.id}>
   <button type="button" className="building-toggle" onClick={()=>toggleBuilding(b.id)}>
    <span>
     <b>{b.name||"Building"}</b>
     <small>{selected?`${selected} selected`:"No units selected"}</small>
    </span>
    <span>{open[b.id]?"−":"+"}</span>
   </button>
   {open[b.id]&&<div className="building-units">
    {units.length?units.map(u=><label key={u.id} className="unit-option">
     <input type="checkbox" checked={unitIds.includes(u.id)} onChange={()=>toggle(u.id)}/>
     <span>Unit {u.unit_number||""}{u.floor?` · ${u.floor}`:""}</span>
    </label>):<div className="no-units">No units in this building.</div>}
   </div>}
  </div>
 }

 return <div className="unit-picker">
  <div className="unit-picker-title">Units</div>

  {visibleBuildings.length
   ?visibleBuildings.map(b=><BuildingGroup key={b.id} b={b}/>)
   :<div className="no-selected-building">No building selected yet.</div>}

  {db.buildings.length>selectedBuildingIds.length&&
   <button type="button" className="show-other-buildings" onClick={()=>setShowOther(x=>!x)}>
    {showOther?"Hide other buildings":"+ Add units from another building"}
   </button>}
 </div>
}
function Field({l,v,set,type="text"}){return <label>{l}<input type={type} value={v||""} onChange={e=>set(e.target.value)}/></label>}
function payloadFor(type,f){if(type==="owner")return{name:f.name||"",email:f.email||"",phone:f.phone||"",iban:f.iban||"",notes:f.notes||""};if(type==="building")return{owner_id:f.owner_id||null,name:f.name||"",address:f.address||""};if(type==="unit")return{building_id:f.building_id||null,unit_number:f.unit_number||"",floor:f.floor||""};if(type==="tenant")return{unit_id:null,name:f.name||"",base_rent:Number(f.base_rent||0),additional_costs:Number(f.additional_costs||0),rent:Number(f.base_rent||0)+Number(f.additional_costs||0),phone:f.phone||"",email:f.email||"",iban:f.iban||"",active:true};if(type==="payment"){const d=new Date();return{tenant_id:f.tenant_id||null,year:Number(f.year||d.getFullYear()),month:Number(f.month||d.getMonth()+1),expected_amount:Number(f.expected_amount||0),paid_amount:Number(f.paid_amount||0),status:Number(f.paid_amount||0)>0?"partial":"pending"}};return f}
function unitsForTenant(db,id){let ids=db.tenant_units.filter(x=>String(x.tenant_id)===String(id)).map(x=>x.unit_id);return db.units.filter(u=>ids.includes(u.id)||String(u.id)===String(db.tenants.find(t=>t.id===id)?.unit_id))}
function tenantsForUnit(db,id){let ids=db.tenant_units.filter(x=>String(x.unit_id)===String(id)).map(x=>x.tenant_id);return db.tenants.filter(t=>ids.includes(t.id)||String(t.unit_id)===String(id))}
function unitLabel(db,u){let b=db.buildings.find(x=>x.id===u.building_id);return `${b?.name||"Building"} - ${u.unit_number||"Unit"}`}
function Card({l,v}){return <div className="card"><small>{l}</small><b>{v}</b></div>}function Panel({title,children}){return <div className="panel"><div className="panel-head"><h3>{title}</h3></div><div className="panel-body">{children}</div></div>}function List({title,add,children}){return <div className="panel"><div className="panel-head"><h3>{title}</h3><button className="primary" onClick={add}>+ Add</button></div>{React.Children.count(children)?children:<div className="empty">Nothing yet.</div>}</div>}function Row({t,s,onClick}){return <div className="row" onClick={onClick}><b>{t}</b><span>{s}</span></div>}function Tile({t,s,onClick}){return <div className="tile" onClick={onClick}><b>{t}</b><br/>{s}</div>}
createRoot(document.getElementById("root")).render(<App/>);
