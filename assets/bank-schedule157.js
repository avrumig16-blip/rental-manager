/* Shared Brussels schedule for truthful bank freshness labels; no requests are sent here. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4UBankSchedule157=factory()})(typeof window==='object'?window:globalThis,function(){'use strict';
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(ms){return Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]))}
function latestSlot(now=Date.now()){
 const p=parts(now),minuteOfDay=p.hour*60+p.minute;
 const slot=minuteOfDay>=1260?1260:minuteOfDay>=1060?1060:minuteOfDay>=840?840:minuteOfDay>=525?525:1260;
 const wall=Date.UTC(p.year,p.month-1,p.day-(minuteOfDay<525?1:0),Math.floor(slot/60),slot%60);
 let utc=wall;
 for(let i=0;i<3;i++){const q=parts(utc),local=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second);utc=wall-(local-utc)}
 return utc;
}
return {latestSlot};
});
