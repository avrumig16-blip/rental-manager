const XLSX=require('xlsx');
const SOURCE='https://statbel.fgov.be/sites/default/files/files/opendata/Consumptieprijsindex%20en%20gezondheidsindex/CPI%20All%20base%20years.xlsx';
function txt(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;const n=Number(String(v??'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null}
const months=[['january','januari','janvier','januar'],['february','februari','fevrier','februar'],['march','maart','mars','marz'],['april','avril'],['may','mei','mai'],['june','juni','juin'],['july','juli','juillet'],['august','augustus','aout'],['september','septembre'],['october','oktober','octobre'],['november','novembre'],['december','decembre','dezember']];
function monthKey(v){
 if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`;
 if(typeof v==='number'&&v>20000&&v<70000){const d=XLSX.SSF.parse_date_code(v);if(d&&d.y&&d.m)return `${d.y}-${String(d.m).padStart(2,'0')}`}
 const s=txt(v);if(!s)return'';let y=(s.match(/(?:19|20)\d{2}/)||[])[0];if(!y)return'';
 for(let i=0;i<12;i++)if(months[i].some(m=>s.includes(m)))return `${y}-${String(i+1).padStart(2,'0')}`;
 let m=s.match(/(?:^|\D)((?:19|20)\d{2})[-/. ](0?[1-9]|1[0-2])(?:\D|$)/);if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}`;
 m=s.match(/(?:^|\D)(0?[1-9]|1[0-2])[-/. ]((?:19|20)\d{2})(?:\D|$)/);if(m)return `${m[2]}-${String(Number(m[1])).padStart(2,'0')}`;
 return'';
}
function expandedGrid(ws){const ref=ws['!ref'];if(!ref)return[];const range=XLSX.utils.decode_range(ref),rows=[];for(let r=range.s.r;r<=range.e.r;r++){const row=[];for(let c=range.s.c;c<=range.e.c;c++)row[c]=ws[XLSX.utils.encode_cell({r,c})]?.v??'';rows[r]=row}for(const mg of ws['!merges']||[]){const v=rows[mg.s.r]?.[mg.s.c]??'';for(let r=mg.s.r;r<=mg.e.r;r++)for(let c=mg.s.c;c<=mg.e.c;c++)if(rows[r]&&(rows[r][c]===''||rows[r][c]==null))rows[r][c]=v}return rows}
function textScore(parts){const s=txt(parts.join(' | '));let score=0;if(/health index|gezondheidsindex|indice sante|gesundheitsindex/.test(s))score+=70;else if(/health|gezondheid|sante|gesundheit/.test(s))score+=30;if(/2013\s*=\s*100|base.?2013|2013/.test(s))score+=22;if(/moving|smoothed|afgevlakt|lisse|glatt/.test(s))score-=90;if(/consumer price|consumptieprijs|prix a la consommation|verbraucherpreis/.test(s))score-=55;return score}
function extract(wb,target){
 let best=null;
 for(const sn of wb.SheetNames){const rows=expandedGrid(wb.Sheets[sn]);if(!rows.length)continue;
   const targetCells=[];
   for(let r=0;r<rows.length;r++)for(let c=0;c<(rows[r]||[]).length;c++)if(monthKey(rows[r][c])===target)targetCells.push([r,c]);
   for(const [tr,tc] of targetCells){
     // Layout A: date/month is on the same row as values.
     for(let c=0;c<(rows[tr]||[]).length;c++){const v=num(rows[tr][c]);if(v==null||v<40||v>400)continue;const around=(rows.slice(Math.max(0,tr-10),tr+2).flatMap(row=>row.slice(Math.max(0,c-3),c+4)));let score=textScore(around)+12;if(!best||score>best.score)best={value:v,score,sheet:sn,row:tr+1,col:c+1,layout:'row'};}
     // Layout B: month/year is a column heading and index labels are down the rows.
     for(let r=0;r<rows.length;r++){const v=num(rows[r]?.[tc]);if(v==null||v<40||v>400)continue;const rowText=(rows[r]||[]).slice(Math.max(0,tc-12),tc+4);const colHeader=[];for(let rr=Math.max(0,r-12);rr<=Math.min(rows.length-1,r+2);rr++)colHeader.push(rows[rr]?.[tc]);let score=textScore(rowText)+textScore(colHeader);if(r>tr)score+=8;if(!best||score>best.score)best={value:v,score,sheet:sn,row:r+1,col:tc+1,layout:'column'};}
   }
 }
 return best&&best.score>=20?best:null;
}
// Verified Statbel values used only if the official workbook cannot be parsed.
// These are deliberately independent of workspace/user permissions.
const VERIFIED={
 '2018-08':107.55,'2018-09':107.52,'2018-10':108.26,'2019-09':108.58,
 '2023-06':127.09,'2025-05':134.54,'2025-06':135.04,'2025-07':135.60,'2025-08':135.64,'2025-09':135.26,'2025-10':135.76,'2025-11':136.49,'2025-12':136.69,
 '2026-01':137.37,'2026-02':138.06,'2026-03':137.78,'2026-04':139.33,'2026-05':139.22,'2026-06':139.08,'2026-07':139.96,'2026-08':140.30
};
module.exports=async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');if(req.method==='OPTIONS')return res.status(204).end();res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=86400');try{
 const month=String(req.query?.month||'');if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({error:'month must be YYYY-MM'});const year=Number(month.slice(0,4));if(year<1994)return res.status(422).json({error:'The Belgian health index exists from January 1994 onward.'});
 let remoteErr='';try{const r=await fetch(SOURCE,{headers:{'user-agent':'ManageRent4U/1.0'}});if(!r.ok)throw new Error(`Statbel download failed (${r.status})`);const wb=XLSX.read(Buffer.from(await r.arrayBuffer()),{cellDates:true});const hit=extract(wb,month);if(hit)return res.status(200).json({month,value:hit.value,base:'2013 = 100',source:SOURCE,match:hit});remoteErr=`Month ${month} was not identified in the official workbook`; }catch(e){remoteErr=e.message||String(e)}
 if(Object.prototype.hasOwnProperty.call(VERIFIED,month))return res.status(200).json({month,value:VERIFIED[month],base:'2013 = 100',source:'Statbel official published health-index data',verifiedFallback:true});
 return res.status(502).json({error:`Official Statbel health index for ${month} could not be read automatically. ${remoteErr}`,source:SOURCE});
}catch(e){return res.status(502).json({error:e.message||String(e),source:SOURCE})}}
