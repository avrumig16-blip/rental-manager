'use strict';
// Brussels wall-clock slots, rather than an elapsed six-hour timer (DST safe).
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(ms){return Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]))}
function latestSlot(now=Date.now()){
 const p=parts(now),minuteOfDay=p.hour*60+p.minute;
 const slot=minuteOfDay>=1060?1060:minuteOfDay>=840?840:minuteOfDay>=525?525:1060;
 const wall=Date.UTC(p.year,p.month-1,p.day-(minuteOfDay<525?1:0),Math.floor(slot/60),slot%60);
 let utc=wall;
 for(let i=0;i<3;i++){const q=parts(utc),local=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second);utc=wall-(local-utc)}
 return utc;
}
function due(c,now=Date.now()){
 if(c.status!=='connected'||!c.workspace_id)return false;
 if(Date.parse(c.bank_sync_lease_until||'')>now)return false;
 if(!c.sync_resume&&Date.parse(c.last_sync_at||'')>=latestSlot(now))return false;
 if(c.error_message&&now-Date.parse(c.updated_at||'')<15*60000)return false;
 return true;
}
module.exports={latestSlot,due};
