import { state, val } from './state.js';
import { upsert, loadAll } from './api.js';
import { render } from './app.js';
import { sb } from './supabaseClient.js';

let mode = '', editId = null;

export function openModal(m, id=null){
  mode=m; editId=id;
  modal.classList.remove('hidden');
  modalTitle.textContent = `${id ? 'Edit' : 'Add'} ${m}`;
  const table = tableFor(m);
  const v = id && table ? state.tables[table].find(x=>String(x.id)===String(id)) || {} : {};
  if(m==='owner') modalBody.innerHTML = `<label>Name<input id="name" value="${v.name||''}"></label><label>Email<input id="email" value="${v.email||''}"></label><label>Phone<input id="phone" value="${v.phone||''}"></label><label>IBAN<input id="iban" value="${v.iban||''}"></label><label class="wide">Notes<textarea id="notes">${v.notes||''}</textarea></label>`;
  if(m==='building') modalBody.innerHTML = `<label>Owner<select id="owner_id">${options(state.tables.owners,v.owner_id,x=>x.name)}</select></label><label>Name<input id="name" value="${v.name||''}"></label><label class="wide">Address<input id="address" value="${v.address||''}"></label>`;
  if(m==='unit') modalBody.innerHTML = `<label>Building<select id="building_id">${options(state.tables.buildings,v.building_id || state.currentBuilding,x=>x.name)}</select></label><label>Unit number<input id="unit_number" value="${v.unit_number||''}"></label><label>Floor<input id="floor" value="${v.floor||''}"></label>`;
  if(m==='tenant'){
    const selected = [v.unit_id, ...state.tables.tenant_units.filter(x=>String(x.tenant_id)===String(v.id)).map(x=>x.unit_id)].filter(Boolean).map(String);
    modalBody.innerHTML = `<label class="wide">Units<div class="checkgrid">${state.tables.units.map(u=>`<label><input type="checkbox" class="unitCheck" value="${u.id}" ${selected.includes(String(u.id))?'checked':''}> ${u.unit_number}</label>`).join('')}</div></label><label>Name<input id="name" value="${v.name||''}"></label><label>Base rent<input id="base_rent" type="number" value="${v.base_rent??v.rent??0}"></label><label>Costs<input id="additional_costs" type="number" value="${v.additional_costs||0}"></label><label>Email<input id="email" value="${v.email||''}"></label><label>IBAN<input id="iban" value="${v.iban||''}"></label>`;
  }
  if(m==='utilityForUnit') modalBody.innerHTML = `<input type="hidden" id="unit_id" value="${id}"><label>Type<select id="utility_type"><option>electricity</option><option>gas</option><option>water</option><option>internet</option><option>other</option></select></label><label>EAN/code<input id="ean_code"></label><label>Meter number<input id="meter_number"></label><label>Provider<input id="provider"></label><label class="wide">Notes<textarea id="notes"></textarea></label>`;
  modalClose.onclick = close; modalCancel.onclick = close; modalSave.onclick = save;
}

function close(){ modal.classList.add('hidden'); }
function options(arr, selected, label){ return arr.map(x=>`<option value="${x.id}" ${String(x.id)===String(selected)?'selected':''}>${label(x)}</option>`).join(''); }
function tableFor(m){ return {owner:'owners',building:'buildings',unit:'units',tenant:'tenants',utilityForUnit:'utility_ean_codes'}[m]; }

async function save(){
  const table = tableFor(mode);
  let payload = {};
  if(mode==='owner') payload = {name:val('name'),email:val('email'),phone:val('phone'),iban:val('iban'),notes:val('notes')};
  if(mode==='building') payload = {owner_id:Number(val('owner_id')),name:val('name'),address:val('address')};
  if(mode==='unit') payload = {building_id:Number(val('building_id')),unit_number:val('unit_number'),floor:val('floor')};
  if(mode==='tenant'){
    const checked = [...document.querySelectorAll('.unitCheck:checked')].map(x=>Number(x.value));
    payload = {unit_id:checked[0]||null,name:val('name'),base_rent:Number(val('base_rent')||0),additional_costs:Number(val('additional_costs')||0),rent:Number(val('base_rent')||0)+Number(val('additional_costs')||0),email:val('email'),iban:val('iban'),active:true};
  }
  if(mode==='utilityForUnit'){
    const unit = state.tables.units.find(x=>String(x.id)===String(val('unit_id')));
    payload = {unit_id:Number(val('unit_id')),building_id:unit?.building_id||null,utility_type:val('utility_type'),ean_code:val('ean_code'),meter_number:val('meter_number'),provider:val('provider'),notes:val('notes')};
  }
  try{
    const saved = await upsert(table,payload,editId);
    if(mode==='tenant'){
      const id = editId || saved.id;
      await sb.from('tenant_units').delete().eq('tenant_id',id);
      const checked = [...document.querySelectorAll('.unitCheck:checked')].map(x=>({tenant_id:id,unit_id:Number(x.value)}));
      if(checked.length) await sb.from('tenant_units').insert(checked);
    }
    close(); await loadAll(); render();
  }catch(e){ alert(e.message); }
}
