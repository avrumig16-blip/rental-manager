/* Real PDF export: visible, itemized charge and credit lines for every month. */
async function buildPaymentStatementPdf(model,runtime={}) {
 const {PDFDocument,StandardFonts,rgb,PDFName,PDFString,PDFHexString}=runtime.PDFLib||PDFLib;
 const fonts=runtime.fonts||MR4U_STATEMENT_FONTS;
 const pdf=await PDFDocument.create();pdf.registerFontkit(runtime.fontkit||fontkit);const decode=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const font=await pdf.embedFont(decode(fonts.Regular),{subset:true}),bold=await pdf.embedFont(decode(fonts.Bold),{subset:true});
 pdf.setTitle('Payment statement - '+model.name);pdf.setAuthor('ManageRent4U');
 const ink=rgb(.08,.16,.21),muted=rgb(.38,.45,.49),accent=rgb(.08,.40,.36),line=rgb(.86,.90,.89),bg=rgb(.96,.97,.96);
 const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\u20ac]/g,'?');
 const money=v=>'€ '+Number(v||0).toLocaleString('nl-BE',{minimumFractionDigits:2,maximumFractionDigits:2});
 const wrap=(value,width,size=9)=>{let lines=[],part='';for(const word of clean(value).split(/\s+/)){if(part&&font.widthOfTextAtSize(part+' '+word,size)>width){lines.push(part);part='';}for(const ch of word){if(font.widthOfTextAtSize(part+ch,size)>width){lines.push(part);part='';}part+=ch;}part+=' ';}if(part.trim())lines.push(part.trim());return lines.length?lines:[''];};
 let page,y;const pages=[],draw=(v,x,yy,size=10,b=false,c=ink)=>page.drawText(clean(v),{x,y:yy,size,font:b?bold:font,color:c});
 function newPage(title='Monthly payment statement'){page=pdf.addPage([841.89,595.28]);pages.push(page);page.drawRectangle({x:0,y:581,width:841.89,height:14,color:accent});draw('MANAGERENT4U',36,551,10,true,accent);draw(title,36,522,24,true);draw(model.name+' - '+model.units,36,501,10,false,muted);y=476;}
 const cols=[36,300,384,470,560,650,746];
 function heading(){page.drawRectangle({x:36,y:y-27,width:770,height:33,color:bg});['Month / current reference','Rent','Charges / credits','Total due','Paid','Outstanding','Status'].forEach((v,i)=>{if(i===2){draw('Charges /',cols[i]+5,y-9,8,true,muted);draw('credits',cols[i]+5,y-20,8,true,muted);}else draw(v,cols[i]+5,y-15,8,true,muted)});y-=42;}
 newPage();const totals=key=>model.rows.reduce((s,r)=>s+Number(r[key]||0),0);
 [['Total due',totals('due')],['Allocated payments',totals('paid')],['Outstanding',totals('bal')],['Credit / overpaid',totals('credit')]].forEach(([label,value],i)=>{const x=36+i*195;page.drawRectangle({x,y:405,width:185,height:65,color:bg});draw(label,x+14,450,9,false,muted);draw(money(value),x+14,425,Math.min(21,157/bold.widthOfTextAtSize(money(value),1)),true,i===2?accent:ink);});y=382;heading();
 for(const r of model.rows){const refs=wrap(r.reference,244,8),h=Math.max(55,28+refs.length*11);if(y-h<52){newPage();heading();}draw(r.month,41,y,10,true);refs.forEach((t,i)=>draw(t,41,y-16-i*11,8,false,muted));[r.rent,r.adj,r.due,r.paid,r.bal].forEach((v,i)=>{const text=money(v),f=i===4?bold:font,max=cols[i+2]-cols[i+1]-13,size=Math.min(9,max/f.widthOfTextAtSize(text,1));draw(text,cols[i+1]+5,y,size,i===4);});draw(r.status,751,y,9,false,r.status==='Paid'?accent:muted);
 y-=h;page.drawLine({start:{x:36,y:y+13},end:{x:806,y:y+13},thickness:.5,color:line});
 for(const d of r.details){const lines=wrap((d.type==='charge'?'Charge: ':'Credit: ')+d.reason,585,10),height=lines.length*15+13;if(y-height<55){newPage();heading();draw(r.month+' (continued)',41,y,10,true);y-=25;}page.drawRectangle({x:42,y:y-height+9,width:758,height:height,color:d.type==='credit'?rgb(.94,.97,.95):rgb(.97,.98,.98)});lines.forEach((t,i)=>draw(t,52,y-i*15,10,false,ink));const value=(d.type==='charge'?'+ ':'- ')+money(d.amount);draw(value,790-bold.widthOfTextAtSize(value,10),y,10,true,d.type==='credit'?accent:ink);y-=height+5;}
 for(const e of r.entries){const lines=wrap((e.date||'')+' - '+money(e.amount)+' - '+(e.method||'Bank'),750,8);if(y-lines.length*11<50){newPage();heading();}lines.forEach(t=>{draw(t,48,y,8,false,muted);y-=12;});}if(Number(r.credit||0)>.005){if(y<55){newPage();heading();}draw('Credit / overpaid in this account: '+money(r.credit),48,y,9,true,accent);y-=15;}y-=5;
 }
 if(y<85){newPage();heading();}draw('TOTAL',41,y,10,true);['rent','adj','due','paid','bal'].forEach((k,i)=>{const text=money(totals(k)),max=cols[i+2]-cols[i+1]-13,size=Math.min(9,max/bold.widthOfTextAtSize(text,1));draw(text,cols[i+1]+5,y,size,true);});
 pages.forEach((p,i)=>{p.drawText('ManageRent4U | '+(i+1)+' / '+pages.length,{x:36,y:25,size:8,font,color:muted});});return pdf.save();
}
if(typeof module==='object'&&module.exports)module.exports={buildPaymentStatementPdf};
