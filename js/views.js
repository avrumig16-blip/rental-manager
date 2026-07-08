import { state, eur, byId, tenantsForUnit } from './state.js';
import { openForm, openView } from './modal.js';

function outstandingTotal(){
  return state.tables.payments.reduce((s,p)=>s + Math.max(0, Number(p.expected_amount||0)-Number(p.paid_amount||0)), 0);
}

export function renderDashboard(){
  pageTitle.textContent = 'Dashboard';
  pageSubtitle.textContent = 'Sprint 1: stable owners, buildings, units';
  content.innerHTML = `
    <div class="grid">
      <div class="card"><small>Owners</small><b>${state.tables.owners.length}</b></div>
      <div class="card"><small>Buildings</small><b>${state.tables.buildings.length}</b></div>
      <div class="card"><small>Units</small><b>${state.tables.units.length}</b></div>
      <div class="card"><small>Outstanding</small><b>${eur(outstandingTotal())}</b></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Quick Actions</h3></div>
      <div class="panel-body popup-menu">
        <div class="tile" id="qaOwner"><b>+ Owner</b><br><span class="hint">Add owner details</span></div>
        <div class="tile" id="qaBuilding"><b>+ Building</b><br><span class="hint">Link to owner</span></div>
        <div class="tile" id="qaUnit"><b>+ Unit</b><br><span class="hint">Add unit to building</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Important</h3></div>
      <div class="panel-body">Sprint 1 is intentionally clean: owners, buildings, and units only. Tenants and payments will be added in Sprint 2 after this foundation saves correctly.</div>
    </div>`;
  qaOwner.onclick = () => openForm('owner');
  qaBuilding.onclick = () => openForm('building');
  qaUnit.onclick = () => openForm('unit');
}

export function renderOwners(){
  pageTitle.textContent = 'Owners';
  pageSubtitle.textContent = 'Add / edit / delete owners';
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>Owners</h3><button id="addOwner" class="primary">+ Owner</button></div>
  ${state.tables.owners.map(o=>`<div class="list-row" data-id="${o.id}"><b>${o.name||'Owner'}</b><span>${o.email||''}<br>${o.phone||''}</span></div>`).join('') || '<div class="empty">No owners yet.</div>'}
  </div>`;
  addOwner.onclick = () => openForm('owner');
  content.querySelectorAll('[data-id]').forEach(x => x.onclick = () => openForm('owner', x.dataset.id));
}

export function renderBuildings(){
  pageTitle.textContent = 'Buildings';
  pageSubtitle.textContent = 'Add / edit / delete buildings';
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>Buildings</h3><button id="addBuilding" class="primary">+ Building</button></div>
  ${state.tables.buildings.map(b=>{
    const owner = byId(state.tables.owners,b.owner_id);
    const units = state.tables.units.filter(u=>String(u.building_id)===String(b.id));
    return `<div class="list-row" data-id="${b.id}"><b>${b.name||'Building'}</b><span>${owner?.name||'No owner'} · ${units.length} units<br>${b.address||''}</span></div>`;
  }).join('') || '<div class="empty">No buildings yet.</div>'}
  </div>`;
  addBuilding.onclick = () => openForm('building');
  content.querySelectorAll('[data-id]').forEach(x => x.onclick = () => openBuildingView(x.dataset.id));
}

export function renderUnits(){
  pageTitle.textContent = 'Units';
  pageSubtitle.textContent = 'Add / edit / delete units';
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>Units</h3><button id="addUnit" class="primary">+ Unit</button></div>
  ${state.tables.units.map(u=>{
    const building = byId(state.tables.buildings,u.building_id);
    const tenants = tenantsForUnit(u.id).map(t=>t.name).join(', ');
    return `<div class="list-row" data-id="${u.id}"><b>${building?.name||'Building'} · Unit ${u.unit_number||''}</b><span>${tenants||'Vacant'}<br>${u.floor||''}</span></div>`;
  }).join('') || '<div class="empty">No units yet.</div>'}
  </div>`;
  addUnit.onclick = () => openForm('unit');
  content.querySelectorAll('[data-id]').forEach(x => x.onclick = () => openUnitView(x.dataset.id));
}

export function openBuildingView(id){
  const b = byId(state.tables.buildings,id);
  const owner = byId(state.tables.owners,b?.owner_id);
  const units = state.tables.units.filter(u=>String(u.building_id)===String(id));
  openView(`Building: ${b?.name||''}`, `
    <div class="wide"><b>Owner:</b> ${owner?.name||'No owner'}<br><b>Address:</b> ${b?.address||''}</div>
    <div class="wide popup-menu">
      <div class="tile" id="editBuildingTile"><b>Edit Building</b><br><span class="hint">Change name/address</span></div>
      <div class="tile"><b>Units</b><br><span class="badge">${units.length}</span></div>
      <div class="tile"><b>Documents</b><br><span class="hint">Coming in later sprint</span></div>
      <div class="tile"><b>Maintenance</b><br><span class="hint">Coming in later sprint</span></div>
    </div>`);
  setTimeout(()=>{ editBuildingTile.onclick = () => openForm('building',id); },0);
}

export function openUnitView(id){
  const u = byId(state.tables.units,id);
  const b = byId(state.tables.buildings,u?.building_id);
  const tenants = tenantsForUnit(id);
  openView(`Unit: ${u?.unit_number||''}`, `
    <div class="wide"><b>Building:</b> ${b?.name||''}<br><b>Floor:</b> ${u?.floor||''}<br><b>Tenant:</b> ${tenants.map(t=>t.name).join(', ')||'Vacant'}</div>
    <div class="wide popup-menu">
      <div class="tile" id="editUnitTile"><b>Edit Unit</b><br><span class="hint">Change unit details</span></div>
      <div class="tile"><b>Tenant</b><br><span class="hint">Sprint 2</span></div>
      <div class="tile"><b>Payments</b><br><span class="hint">Sprint 2</span></div>
      <div class="tile"><b>Utilities</b><br><span class="hint">Sprint 3</span></div>
    </div>`);
  setTimeout(()=>{ editUnitTile.onclick = () => openForm('unit',id); },0);
}
