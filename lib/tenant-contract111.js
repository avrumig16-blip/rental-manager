'use strict';
// EPC grade is part of the existing inline lease metadata. V95 does not define
// a standalone tenants.epc_label column; never pass that optional alias to SQL.
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const token=/__MR4U_CONTRACT:([A-Za-z0-9+/=]+)__/;
function read(notes){
 try{const raw=String(notes||'').match(token);if(!raw)return {};
  const value=JSON.parse(Buffer.from(raw[1],'base64').toString('utf8'));
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 }catch{return {}}}
function normalize(input,payload,existing){
 delete payload.epc_label;
 const incoming=read(payload.stay_notes),explicit=has(input,'epc_label')&&input.epc_label!==undefined;
 if(!explicit&&!has(incoming,'epc_label'))return payload;
 const grade=String((explicit?input.epc_label:incoming.epc_label)??'').trim().toUpperCase();
 if(!['','A+','A','B','C','D','E','F','G'].includes(grade))throw Error('Choose a valid EPC grade.');
 const notes=payload.stay_notes===undefined?String(existing?.stay_notes||''):String(payload.stay_notes||'');
 const metadata={...read(existing?.stay_notes),...read(notes),epc_label:grade};
 const plain=notes.replace(/__MR4U_CONTRACT:[A-Za-z0-9+/=]+__/g,'').trim();
 payload.stay_notes=[plain,'__MR4U_CONTRACT:'+Buffer.from(JSON.stringify(metadata),'utf8').toString('base64')+'__'].filter(Boolean).join(' ');
 return payload;
}
module.exports=normalize;
