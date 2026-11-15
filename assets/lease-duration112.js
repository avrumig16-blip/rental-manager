(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4ULeaseDuration112=factory()})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const fixed={'1y':12,'3y':36,'9y':108};
 function valid(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
 function end(start,months){if(!valid(start)||!Number.isInteger(+months)||+months<1||+months>1200)return '';const [y,m,d]=start.split('-').map(Number),next=new Date(Date.UTC(y,m-1+Number(months),1,12));next.setUTCDate(Math.min(d,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));next.setUTCDate(next.getUTCDate()-1);return next.toISOString().slice(0,10)}
 function change(d,key,value){const n={...d,[key]:value},kind=n.contract_duration_type||'other',months=fixed[kind]||(kind==='months'?Number(n.contract_duration_months):0);if(kind==='open'){n.contract_duration_months=0;n.contract_end_date=''}else if(kind!=='other'){n.contract_duration_months=months;n.contract_end_date=end(n.tenancy_start_date,months)}return n}
 function label(d){const k=d.contract_duration_type,m=Number(d.contract_duration_months||fixed[k]||0);return k==='open'?'Open ended':fixed[k]?m/12+' year'+(m===12?'':'s'):k==='months'?m+' months':'Custom end date'}
 function inputFormat(pattern){return /MMM/.test(pattern||'')?'DD/MM/YYYY':(['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD','DD-MM-YYYY','MM-DD-YYYY','YYYY/MM/DD','DD.MM.YYYY'].includes(pattern)?pattern:'DD/MM/YYYY')}
 function parseInput(value,pattern){if(valid(value))return value;const format=inputFormat(pattern),parts=String(value||'').split(/[^0-9]+/),keys=format.split(/[^A-Z]+/);if(parts.length!==3||parts.some((p,i)=>p.length!==(keys[i]==='YYYY'?4:2)))return '';const d=Object.fromEntries(keys.map((k,i)=>[k,parts[i]])),iso=d.YYYY+'-'+d.MM+'-'+d.DD;return valid(iso)?iso:''}
 return {valid,end,change,label,fixed,inputFormat,parseInput};
});
