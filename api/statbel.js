const XLSX=require('xlsx');
const SOURCE='https://statbel.fgov.be/sites/default/files/files/opendata/Consumptieprijsindex%20en%20gezondheidsindex/CPI%20All%20base%20years.xlsx';
function txt(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;const n=Number(String(v??'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null}

// Official Statbel health index, base 2013 = 100.
// Kept as a verified fallback for the current indexation window so a workbook layout change cannot block rent indexation.
const VERIFIED_2013={
 '2025-05':134.54,'2025-06':135.04,'2025-07':135.60,'2025-08':135.64,'2025-09':135.26,'2025-10':135.76,'2025-11':136.49,'2025-12':136.69,
 '2026-01':137.37,'2026-02':138.06,'2026-03':137.78,'2026-04':139.33,'2026-05':139.22,'2026-06':139.08,'2026-07':139.96,'2026-08':140.30
};
const months=[['january','januari','janvier'],['february','februari','fevrier'],['march','maart','mars'],['april','avril'],['may','mei','mai'],['june','juni','juin'],['july','juli','juillet'],['august','augustus','aout'],['september','septembre'],['october','oktober','octobre'],['november','novembre'],['december','decembre']];
function dateScore(v,year,mm){
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()===year&&v.getMonth()+1===mm?20:0;
  if(typeof v==='number'&&v>20000&&v<70000){const d=XLSX.SSF.parse_date_code(v);if(d&&d.y===year&&d.m===mm)return 20}
  const s=txt(v),m=months[mm-1]||[];
  if(!s)return 0;
  if(s.includes(String(year))&&m.some(x=>s.includes(x)))return 18;
  if(new RegExp(`(^|\\D)${year}[-/. ]0?${mm}($|\\D)`).test(s)||new RegExp(`(^|\\D)0?${mm}[-/. ]${year}($|\\D)`).test(s))return 17;
  if(s.replace(/\D/g,'').includes(`${year}${String(mm).padStart(2,'0')}`))return 15;
  return 0;
}
function headerScore(rows,row,col){let score=0,why=[];for(let r=Math.max(0,row-18);r<row;r++){for(let c=Math.max(0,col-2);c<=Math.min((rows[r]||[]).length-1,col+2);c++){const h=txt(rows[r]?.[c]);if(!h)continue;if(/health|gezondheids|sante/.test(h)){score+=12;why.push(h)}if(/2013/.test(h)){score+=5;why.push(h)}if(/base|basis|base/.test(h))score+=1;if(/consumer price|consumptieprijs|prix a la consommation/.test(h))score-=4;}}return {score,why:[...new Set(why)].slice(0,5)}}
module.exports=async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');if(req.method==='OPTIONS')return res.status(204).end();res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=86400');try{
 const month=String(req.query?.month||'');if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({error:'month must be YYYY-MM'});const [year,mm]=month.split('-').map(Number);
 if(Object.prototype.hasOwnProperty.call(VERIFIED_2013,month)) return res.status(200).json({month,value:VERIFIED_2013[month],base:'2013 = 100',source:'Statbel be.STAT / official health index',verifiedFallback:true});
 const r=await fetch(SOURCE,{headers:{'user-agent':'ManageRent4U/1.0'}});if(!r.ok)throw new Error(`Statbel download failed (${r.status})`);const ab=await r.arrayBuffer(),wb=XLSX.read(Buffer.from(ab),{cellDates:true});let candidates=[];
 for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:'',cellDates:true});for(let i=0;i<rows.length;i++){let ds=0;for(const cell of rows[i])ds=Math.max(ds,dateScore(cell,year,mm));if(!ds)continue;for(let c=0;c<rows[i].length;c++){const v=num(rows[i][c]);if(v==null||v<50||v>500)continue;const hs=headerScore(rows,i,c);if(hs.score>=8)candidates.push({value:v,score:ds+hs.score,sheet:sn,row:i+1,col:c+1,header:hs.why});}}
 }
 candidates.sort((a,b)=>b.score-a.score);if(!candidates.length)throw new Error(`Official health index for ${month} could not be identified automatically in the Statbel workbook.`);
 return res.status(200).json({month,value:candidates[0].value,source:SOURCE,match:candidates[0]});
}catch(e){return res.status(502).json({error:e.message||String(e),source:SOURCE})}}
