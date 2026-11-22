'use strict';
const fs=require('fs'),path=require('path'),{PDFDocument,rgb}=require('pdf-lib'),dates=require('../assets/date-format');
async function build(m){
 const pdf=await PDFDocument.create();pdf.registerFontkit(require('../assets/fontkit.min.js'));pdf.setTitle('Tenant overview · '+m.name);pdf.setAuthor('ManageRent4U');pdf.setCreator('ManageRent4U');pdf.setCreationDate(new Date(m.generatedAt));pdf.setModificationDate(new Date(m.generatedAt));
 const regular=await pdf.embedFont(fs.readFileSync(path.join(__dirname,'../assets/OpenSans-Regular.ttf')),{subset:true}),bold=await pdf.embedFont(fs.readFileSync(path.join(__dirname,'../assets/OpenSans-Bold.ttf')),{subset:true});
 const W=595.28,H=841.89,L=36,R=W-L,C={ink:rgb(.08,.17,.14),green:rgb(.01,.34,.23),muted:rgb(.36,.43,.41),line:rgb(.83,.88,.85),mint:rgb(.9,.96,.92),soft:rgb(.96,.98,.97),amber:rgb(.58,.36,.03),yellow:rgb(1,.96,.86)};let page,y;
 const clean=v=>String(v??'').replace(/[\r\t]/g,' ').replace(/[\u2010-\u2015]/g,'-'),width=(v,z=9,b=false)=>(b?bold:regular).widthOfTextAtSize(clean(v),z),text=(v,x,top,z=9,b=false,color=C.ink)=>page.drawText(clean(v),{x,y:H-top-z,size:z,font:b?bold:regular,color}),right=(v,x,top,z=9,b=false,color=C.ink)=>text(v,x-width(v,z,b),top,z,b,color),rect=(x,top,w,h,color)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color}),rule=top=>rect(L,top,R-L,.6,C.line),money=n=>'€'+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}),date=v=>v?dates.format(v,m.dateFormat):'Not recorded';
 function wrap(v,w,z=9,b=false){const lines=[];let line='';for(const word of clean(v).split(/\s+/)){if(line&&width(line+' '+word,z,b)>w){lines.push(line);line=''}let part='';for(const c of word){if(width(part+c,z,b)>w){if(line){lines.push(line);line=''}lines.push(part);part=''}part+=c}line+=(line?' ':'')+part}if(line)lines.push(line);return lines.length?lines:['']}
 function paragraph(v,x,w,z=9,b=false,color=C.ink){for(const line of wrap(v,w,z,b)){text(line,x,y,z,b,color);y+=z+3}}
 function add(){page=pdf.addPage([W,H]);text('MR',L,24,18,true,C.green);text('ManageRent4U',L+37,29,16,true,C.green);right('TENANT OVERVIEW',R,32,10,true,C.green);rule(59);y=74;if(pdf.getPageCount()>1){paragraph(m.name,L,R-L,13,true);y+=9}}
 function room(height){if(y+height>778)add()}
 function section(title){room(54);text(title,L,y,13,true,C.green);y+=20;rule(y);y+=8}
 function pair(label,value,x,w){const lines=wrap(value||'Not recorded',w-82,9);text(label,x,y,8.5,true,C.muted);lines.forEach((s,i)=>text(s,x+82,y+i*13,9));return Math.max(18,lines.length*13+5)}
 function note(v,color=C.muted){const lines=wrap(v,R-L,8);room(lines.length*11+7);for(const l of lines){text(l,L,y,8,false,color);y+=11}y+=3}
 add();paragraph(m.name,L,R-L,24,true);y+=2;paragraph(m.properties.map(p=>p.label).join(', ')||'Property not recorded',L,R-L,10,false,C.muted);y+=10;
 section('Contact');
 let h1=pair('Email',m.email,L,252),h2=pair('Property',m.properties.map(p=>p.address).join('; '),L+271,252);y+=Math.max(h1,h2);
 h1=pair('Phone',m.phone,L,252);h2=pair('Owner',m.owner,L+271,252);y+=Math.max(h1,h2);
 if(m.contactAddress&&m.contactAddress!==m.properties[0]?.address){room(40);y+=3;y+=pair('Contact address',m.contactAddress,L,R-L)}y+=4;
 section(m.short?'Stay & agreed price':'Lease & monthly rent');
 const leaseLabel=date(m.start)+' - '+(m.end?date(m.end):m.openEnded?'Open ended':'End date not recorded');
 const left=wrap(leaseLabel,260,9);left.forEach((s,i)=>text(s,L+78,y+i*13,9));text(m.short?'Stay':'Lease',L,y,9,true,C.muted);const top=y;y+=Math.max(21,left.length*13+5);
 if(m.short){text('Agreed stay price',L,y,9,false,C.muted);text(money(m.stayPrice),L+132,y,10,true);y+=24}else{text('Monthly rent',L,y,9,false,C.muted);text(money(m.base),L+102,y,10);y+=21;const fixed=m.costs.filter(c=>c.mode!=='variable');text('Monthly charges',L,y,9,false,C.muted);text(money(fixed.reduce((n,c)=>n+Number(c.amount||0),0)),L+102,y,10);y+=21}
 const boxX=L+325;rect(boxX,top-1,R-boxX,59,C.mint);text(m.short?'Agreed stay price':'Total due each month',boxX+12,top+8,9,true,C.green);text(money(m.short?m.stayPrice:m.monthly),boxX+12,top+26,22,true,C.green);y=Math.max(y,top+67);
 if(m.costs.length&&!m.short)note('Charges: '+m.costs.map(c=>(c.label||'Additional costs')+' '+(c.mode==='variable'?'variable (actual amount per month)':money(c.amount))).join('; '));
 if(m.leaseTotal!==null&&!m.short)note('Scheduled rent & charges for the lease: '+money(m.leaseTotal)+' ('+m.months+' months at the current monthly rate; future indexation and variable costs excluded).');
 if(m.ended)note('Actual tenancy end: '+date(m.ended));
 room(69);const gap=10,bw=(R-L-2*gap)/3,tot=m.totals;[['Charged less credits',tot.due,C.soft,C.green],['Payments received',tot.paid,C.soft,C.green],['Still outstanding',tot.outstanding,C.yellow,C.amber]].forEach(([label,value,bg,color],i)=>{const x=L+i*(bw+gap);rect(x,y,bw,58,bg);text(label,x+11,y+10,9,true,color);text(money(value),x+11,y+28,21,true,color)});y+=69;
 const extras=tot.credits>.005||tot.credit>.005;
 section('Payment overview');note(m.rows.length?'All '+m.rows.length+' recorded monthly accounts, oldest first.':'No monthly accounts have been recorded.');
 const cols=extras?[{l:'Period',w:109},{l:'Charges',w:68},{l:'Credits',w:62},{l:'Paid',w:68},{l:'Outstanding',w:82},{l:'Status',w:134}]:[{l:'Period',w:143},{l:'Due',w:92},{l:'Paid',w:92},{l:'Outstanding',w:98},{l:'Status',w:98}];
 function header(columns){rect(L,y,R-L,23,C.green);let x=L;for(let i=0;i<columns.length;i++){const c=columns[i];if(c.numeric??(i>0&&i<columns.length-1))right(c.l,x+c.w-7,y+7,8,true,rgb(1,1,1));else text(c.l,x+7,y+7,8,true,rgb(1,1,1));x+=c.w}y+=23}
 function tableRow(values,columns,total=false){const lines=values.map((v,i)=>wrap(v,columns[i].w-14,8,i===0&&total)),height=Math.max(23,...lines.map(l=>l.length*11+12));if(y+height>760){add();text('Payment overview - continued',L,y,12,true,C.green);y+=27;header(columns)}if(total)rect(L,y,R-L,height,C.mint);let x=L;lines.forEach((ls,i)=>{ls.forEach((s,k)=>{const numeric=i>0&&i<columns.length-1;if(numeric)right(s,x+columns[i].w-7,y+8+k*11,8,total);else text(s,x+7,y+8+k*11,8,total,i===columns.length-1&&/part|unpaid/i.test(s)?C.amber:C.ink)});x+=columns[i].w});y+=height;rule(y)}
 header(cols);for(const r of m.rows)tableRow(extras?[r.month,money(r.charges),money(r.credits),money(r.paid),money(r.bal),r.status]:[r.month,money(r.due),money(r.paid),money(r.bal),r.status],cols);tableRow(extras?['Total',money(tot.charges),money(tot.credits),money(tot.paid),money(tot.outstanding),'']:['Total',money(tot.due),money(tot.paid),money(tot.outstanding),''],cols,true);y+=9;
 if(tot.credit>.005)note('Credit / overpaid amounts: '+money(tot.credit)+'. Shown separately; not automatically offset against other months.');
 if(m.rows.some(r=>r.period_start.slice(0,7)>m.generatedAt.slice(0,7)))note('This overview includes saved future monthly accounts. Their outstanding amounts are not necessarily overdue.');
 if(m.receipts.length){section('Payments received');const receiptCols=[{l:'Date',w:100,numeric:false},{l:'Method / allocated period',w:323,numeric:false},{l:'Amount',w:100,numeric:true}];header(receiptCols);for(const e of m.receipts){let method=({bank:'Bank transfer',cash:'Cash',other:'Other',manual:'Manual',bank_transfer:'Bank transfer'})[e.method]||e.method||'Not recorded';// Payment entries are allocations; preserve each amount rather than double-counting a receipt.
 const vals=[date(e.date),method+' · '+e.period,money(e.amount)];const height=Math.max(23,wrap(vals[1],309,8).length*11+12);if(y+height>760){add();text('Payments received - continued',L,y,12,true,C.green);y+=27;header(receiptCols)}let x=L;vals.forEach((v,i)=>{wrap(v,receiptCols[i].w-14,8).forEach((s,k)=>i===2?right(s,x+receiptCols[i].w-7,y+8+k*11,8):text(s,x+7,y+8+k*11,8));x+=receiptCols[i].w});y+=height;rule(y)}y+=10}
 else note('No payments have been recorded.');
 room(51);rect(L,y,R-L,35,C.mint);text('Outstanding balance',L+12,y+11,10,true,C.green);right(money(tot.outstanding),R-12,y+7,17,true,C.green);
 const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;rule(799);text('ManageRent4U · Generated '+date(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(m.generatedAt))),L,808,8,false,C.muted);right('Page '+(i+1)+' of '+pages.length,R,808,8,false,C.muted)});
 return pdf.save();
}
async function combine(models,ownerName){const out=await PDFDocument.create();out.setTitle('Tenant overviews · '+String(ownerName||'Owner'));out.setAuthor('ManageRent4U');out.setCreator('ManageRent4U');for(const m of models){const doc=await PDFDocument.load(await build(m));for(const p of await out.copyPages(doc,doc.getPageIndices()))out.addPage(p)}return out.save()}
module.exports={build,combine};
