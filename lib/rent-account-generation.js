/* Automatic monthly accounts must respect the saved lease start in every entry point. */
const {supa}=require('./core'),lease=require('../assets/lease-notice-model');
const enc=encodeURIComponent;
function brusselsDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
function dueDay(t){const marker=String(t.stay_notes||'').match(/__MR4U_DUE_DAY:(\d{1,2})__/),n=Number(t.rent_due_day||(marker?marker[1]:1));return Number.isInteger(n)&&n>=1&&n<=28?n:1}
function startDate(t,contracts=[]){return lease.contract({...t,stay_notes:[t.stay_notes,t.notes].filter(Boolean).join(' ')},contracts).start_date}
function eligibility(t,contracts,{year,month,day,today=brusselsDate()}){
 if(t.active===false||String(t.tenancy_type||t.stay_type||'').toLowerCase().includes('short'))return 'inactive_or_short_stay';
 const start=startDate(t,contracts);if(!lease.valid(start))return 'missing_start_date';
 const period=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0'),asOf=period+'-'+String(day).padStart(2,'0');
 if(period>today.slice(0,7)||start>asOf||start>today)return 'before_lease_start';
 if(day<dueDay(t))return 'before_due_day';return '';
}
function amount(t){let current=null;try{const m=String(t.stay_notes||'').match(/__MR4U_COSTS:([A-Za-z0-9+/=]+)__/);if(m){const d=JSON.parse(Buffer.from(m[1],'base64').toString('utf8'));if(d.current_rent!==null&&d.current_rent!==undefined&&String(d.current_rent)!=='')current=Number(d.current_rent)}}catch{}if(current===null||!Number.isFinite(current))current=Number(t.current_rent??t.rent??t.base_rent??t.monthly_rent??0);return Math.max(0,current+Number(t.additional_costs||0))}
async function generate({workspace=null,year,month,day,now=new Date(),monthlyAmount=amount}={}){
 const today=brusselsDate(now),[cy,cm,cd]=today.split('-').map(Number);year=year??cy;month=month??cm;day=day??cd;
 if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw Error('Choose a valid rent account date');
 // Automatic callers cannot advance the business date or fabricate a future period.
 const requested=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');if(requested>today)throw Error('Automatic rent accounts cannot be generated for a future date');
 const scope=workspace?'workspace_id=eq.'+enc(workspace)+'&':'';
 const [tenants,contracts,existing]=await Promise.all([supa(`tenants?${scope}select=*`),supa(`contract_intakes?${scope}select=*`),supa(`payments?${scope}year=eq.${year}&month=eq.${month}&select=workspace_id,tenant_id`)]);
 const key=(w,id)=>String(w)+':'+String(id),seen=new Set((existing||[]).map(p=>key(p.workspace_id||workspace,p.tenant_id))),skipped={};let created=0;
 for(const t of tenants||[]){const wid=workspace||t.workspace_id;if(!wid||seen.has(key(wid,t.id)))continue;const reason=eligibility(t,contracts.filter(c=>!c.workspace_id||String(c.workspace_id)===String(wid)),{year,month,day,today});if(reason){skipped[reason]=(skipped[reason]||0)+1;continue}const expected=Number(monthlyAmount(t));if(!Number.isFinite(expected)||expected<0){skipped.invalid_amount=(skipped.invalid_amount||0)+1;continue}
 try{await supa('payments',{method:'POST',body:JSON.stringify({workspace_id:wid,tenant_id:t.id,year,month,expected_amount:expected,paid_amount:0,status:'pending'})});created++;seen.add(key(wid,t.id))}catch(e){if(!/duplicate|unique/i.test(String(e.message||''))){skipped.write_failed=(skipped.write_failed||0)+1;console.warn('Automatic rent account could not be saved',t.id,e.message)}}
 }return {ok:true,created,skipped};
}
module.exports={generate,eligibility,startDate,dueDay,brusselsDate,amount};
