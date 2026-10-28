(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4UStatementModel=factory()})(typeof window!=='undefined'?window:globalThis,function(){'use strict';
const cents=v=>Math.round((Number(v)||0)*100),amount=v=>v/100;
function splitMonthly({gross,items=[],details=[],current=false,historical=false,baseRent=0}){
 const total=cents(gross),costs=items.filter(c=>String(c.mode||'fixed').toLowerCase()!=='variable'&&!String(c.mode||'').toLowerCase().includes('change')).map(c=>({type:'charge',reason:String(c.label||'Additional costs'),amount:amount(cents(c.amount)),fixed:true})).filter(c=>c.amount>0),fixed=costs.reduce((s,c)=>s+cents(c.amount),0);
 // Change presentation only. Never add a fixed cost to the recorded monthly total.
 // Older months with itemised adjustment rows retain those original rows.
 const split=!historical&&fixed>0&&total>=fixed&&(current||total===cents(baseRent)+fixed);
 return {rent:amount(split?total-fixed:total),details:[...(split?costs:[]),...details],adj:amount((split?fixed:0)+details.reduce((s,c)=>s+(c.type==='charge'?1:-1)*cents(c.amount),0)),rentLabel:!split&&fixed>0&&!historical?'Rent / recorded monthly amount':'Rent'};
}
function message(value){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>10000)throw Error('Keep the email message within 10,000 characters');return value.trim()}
function breakdown(r){const details=r.details||[],chargesTotal=amount(cents(r.rent)+details.filter(d=>d.type==='charge').reduce((s,d)=>s+cents(d.amount),0)),creditsApplied=amount(details.filter(d=>d.type==='credit').reduce((s,d)=>s+cents(d.amount),0)),settlementStatus=r.credit>.005?'Credit':r.bal>.005?(r.paid>.005?'Partly paid':'Unpaid'):chargesTotal>.005&&creditsApplied>=chargesTotal-.005&&r.paid<.005?'Settled by credit':chargesTotal<.005&&r.paid<.005?'No amount due':'Paid';return {chargesTotal,creditsApplied,paymentsReceived:Number(r.paid||0),netDue:Number(r.due||0),settlementStatus}}
return {splitMonthly,message,breakdown};});
