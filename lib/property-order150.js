'use strict';
const natural=(a,b)=>String(a??'').localeCompare(String(b??''),'en',{numeric:true,sensitivity:'base'});
const label=u=>String(u.unit_number??u.number??u.name??'');
function floorValue(u){const raw=u.floor,explicit=raw!==null&&raw!==undefined&&String(raw).trim()!=='',s=String(explicit?raw:label(u)).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(explicit&&/^-?\d+(?:\.\d+)?$/.test(s))return Number(s);
 if(/basement|cellar|kelder|sous.sol/.test(s))return -1;
 if(/ground|gelijkvloers|begane|beneden|rez.de.chaussee|^gv$|^glv$|^g$|^rdc$/.test(s))return 0;
 const words=[[/\b(first|eerste|premier|premiere)\b/,1],[/\b(second|tweede|deuxieme)\b/,2],[/\b(third|derde|troisieme)\b/,3],[/\b(fourth|vierde|quatrieme)\b/,4],[/\b(fifth|vijfde|cinquieme)\b/,5],[/\b(sixth|zesde|sixieme)\b/,6]];for(const [re,n]of words)if(re.test(s))return n;
 const n=s.match(/-?\d+/);if(n){const value=Number(n[0]);return explicit?value:/^\d{3,4}(?:\D|$)/.test(s)?Math.floor(value/100):value}return Infinity;
}
function side(u){const s=label(u).toLowerCase();return /\bright\b|\brechts\b|\bdroite?\b/.test(s)?0:/\bleft\b|\blinks\b|\bgauche\b/.test(s)?1:2}
function compareBuildings(a,b){return natural(a.name||a.address||a.id,b.name||b.address||b.id)||natural(a.id,b.id)}
function compareUnits(a,b,buildings=[]){const bs=[...buildings].sort(compareBuildings),rank=new Map(bs.map((b,i)=>[String(b.id),i])),ar=rank.get(String(a.building_id))??Infinity,br=rank.get(String(b.building_id))??Infinity;return (ar===br?0:ar-br)||natural(ar===Infinity?a.building_id:'',br===Infinity?b.building_id:'')||(floorValue(a)===floorValue(b)?0:floorValue(a)-floorValue(b))||side(a)-side(b)||natural(label(a),label(b))||natural(a.id,b.id)}
function orderTenants(tenants,units,buildings,links=[]){const ordered=[...units].sort((a,b)=>compareUnits(a,b,buildings)),first=t=>ordered.findIndex(u=>String(u.id)===String(t.unit_id)||links.some(l=>String(l.unit_id)===String(u.id)&&String(l.tenant_id)===String(t.id)));return [...tenants].sort((a,b)=>{const ai=first(a),bi=first(b);return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||natural(a.name,b.name)||natural(a.id,b.id)})}
module.exports={floorValue,compareBuildings,compareUnits,orderTenants};
