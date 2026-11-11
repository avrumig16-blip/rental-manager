(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4UAddress=factory()})(typeof window==='object'?window:globalThis,function(){
 const keys=['street','number','box','postal_code','city','country','region'],clean=v=>String(v??'').trim().slice(0,500);
 function read(row={}){if(row.postal_address&&typeof row.postal_address==='object'&&!Array.isArray(row.postal_address))return Object.fromEntries(keys.map(k=>[k,clean(row.postal_address[k])]));
  const full=clean(row.address),parts=full.split(',').map(s=>s.trim()).filter(Boolean),first=parts.shift()||'',streetMatch=first.match(/^(.*?)\s+(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)(?:\s+(?:bus|box|bte)\s*(.+))?$/i),out={street:row.street||streetMatch?.[1]||first,number:row.house_number||streetMatch?.[2]||'',box:row.box||streetMatch?.[3]||'',postal_code:row.postal_code||'',city:row.city||'',country:row.country||'',region:row.region||''};
  for(const part of parts){const pc=part.match(/^(?:BE[- ]?)?(\d{4})\s+(.+)$/i);if(pc){out.postal_code=out.postal_code||pc[1];out.city=out.city||pc[2]}else if(/^(belgium|belgi[eë]|belgique|BE)$/i.test(part)){out.country=out.country||part}else if(!out.city)out.city=part;else if(!out.country)out.country=part;else out.street=[out.street,part].filter(Boolean).join(', ')}
  return Object.fromEntries(keys.map(k=>[k,clean(out[k])]))
 }
 function street(p){return [p.street,p.number,p.box?'box '+p.box:''].filter(Boolean).join(' ')}
 function format(row){const p=read(row);return [street(p),[p.postal_code,p.city].filter(Boolean).join(' '),p.country].filter(Boolean).join(', ')}
 return {keys,read,street,format};
});
