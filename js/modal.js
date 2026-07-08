import { state, val } from './state.js';
import { saveRow, deleteRow, loadAll } from './api.js';
import { render } from './app.js';

let current = { type:null, id:null };

function options(arr, selected, label){
  return arr.map(x => `<option value="${x.id}" ${String(x.id)===String(selected)?'selected':''}>${label(x)}</option>`).join('');
}

export function openForm(type, id=null){
  current = { type, id };
  modal.classList.remove('hidden');
  modalSave.classList.remove('hidden');
  modalDelete.classList.toggle('hidden', !id);
  modalCancel.textContent = 'Cancel';
  modalTitle.textContent = `${id ? 'Edit' : 'Add'} ${title(type)}`;
  modalBody.innerHTML = formHtml(type, id);

  modalX.onclick = closeModal;
  modalCancel.onclick = closeModal;
  modalSave.onclick = saveForm;
  modalDelete.onclick = deleteCurrent;
}

export function openView(titleText, html){
  current = { type:null, id:null };
  modal.classList.remove('hidden');
  modalSave.classList.add('hidden');
  modalDelete.classList.add('hidden');
  modalCancel.textContent = 'Close';
  modalTitle.textContent = titleText;
  modalBody.innerHTML = html;
  modalX.onclick = closeModal;
  modalCancel.onclick = closeModal;
}

export function closeModal(){ modal.classList.add('hidden'); }

function title(type){ return { owner:'Owner', building:'Building', unit:'Unit' }[type] || type; }
function tableFor(type){ return { owner:'owners', building:'buildings', unit:'units' }[type]; }

function formHtml(type,id){
  const table = tableFor(type);
  const v = id ? (state.tables[table].find(x => String(x.id) === String(id)) || {}) : {};

  if (type === 'owner') return `
    <label>Name<input id="name" value="${v.name||''}"></label>
    <label>Email<input id="email" value="${v.email||''}"></label>
    <label>Phone<input id="phone" value="${v.phone||''}"></label>
    <label>IBAN<input id="iban" value="${v.iban||''}"></label>
    <label class="wide">Notes<textarea id="notes">${v.notes||''}</textarea></label>`;

  if (type === 'building') return `
    <label>Owner<select id="owner_id"><option value="">No owner</option>${options(state.tables.owners, v.owner_id, x=>x.name||'Owner')}</select></label>
    <label>Name<input id="name" value="${v.name||''}"></label>
    <label class="wide">Address<input id="address" value="${v.address||''}"></label>`;

  if (type === 'unit') return `
    <label>Building<select id="building_id"><option value="">Select building</option>${options(state.tables.buildings, v.building_id, x=>x.name||'Building')}</select></label>
    <label>Unit number<input id="unit_number" value="${v.unit_number||''}"></label>
    <label>Floor<input id="floor" value="${v.floor||''}"></label>
    <label class="wide hint">Sprint 1 handles owners, buildings, and units only. Tenants/payments come in Sprint 2.</label>`;

  return `<div class="wide">Unknown form.</div>`;
}

async function saveForm(){
  const type = current.type;
  const table = tableFor(type);
  let payload = {};

  if (type === 'owner'){
    payload = { name:val('name'), email:val('email'), phone:val('phone'), iban:val('iban'), notes:val('notes') };
    if (!payload.name) return alert('Name is required.');
  }

  if (type === 'building'){
    payload = { owner_id:val('owner_id') ? Number(val('owner_id')) : null, name:val('name'), address:val('address') };
    if (!payload.name) return alert('Building name is required.');
  }

  if (type === 'unit'){
    payload = { building_id:val('building_id') ? Number(val('building_id')) : null, unit_number:val('unit_number'), floor:val('floor') };
    if (!payload.building_id) return alert('Choose a building.');
    if (!payload.unit_number) return alert('Unit number is required.');
  }

  try{
    await saveRow(table, payload, current.id);
    closeModal();
    await loadAll();
    render();
  }catch(e){ alert(e.message); }
}

async function deleteCurrent(){
  if (!current.id || !current.type) return;
  if (!confirm('Delete this item?')) return;
  try{
    await deleteRow(tableFor(current.type), current.id);
    closeModal();
    await loadAll();
    render();
  }catch(e){ alert(e.message); }
}
