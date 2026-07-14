import { state, byId, eur, tenantRent } from './state.js';
import { tenantsForUnit } from './explorer.js';
import { openModal } from './modal.js';

export function renderOwner(id){
  const o = byId(state.tables.owners,id);
  pageTitle.textContent = o?.name || 'Owner';
  const buildings = state.tables.buildings.filter(b=>String(b.owner_id)===String(id));
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>👤 ${o?.name||''}</h3><button class="light" id="editOwner">Edit</button></div><div class="panel-body">${o?.email||''}<br>${o?.phone||''}<br>${o?.iban||''}</div></div><div class="panel"><div class="panel-head"><h3>Buildings</h3></div>${buildings.map(b=>`<div class="list-row" data-building="${b.id}"><b>${b.name}</b><span>${b.address||''}</span></div>`).join('')}</div>`;
  editOwner.onclick=()=>openModal('owner',id);
}

export function renderBuilding(id){
  const b = byId(state.tables.buildings,id);
  pageTitle.textContent = b?.name || 'Building';
  const units = state.tables.units.filter(u=>String(u.building_id)===String(id));
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>🏢 ${b?.name||''}</h3><button class="light" id="editBuilding">Edit</button></div><div class="panel-body">${b?.address||''}</div></div><div class="panel"><div class="panel-head"><h3>Units</h3><button class="primary" id="addUnitHere">+ Unit</button></div>${units.map(u=>{const tenants=tenantsForUnit(u.id).map(t=>t.name).join(', ');return `<div class="list-row" data-unit="${u.id}"><b>Unit ${u.unit_number}</b><span>${tenants || 'Vacant'}</span></div>`}).join('')}</div>`;
  editBuilding.onclick=()=>openModal('building',id);
  addUnitHere.onclick=()=>openModal('unit');
}

export function renderUnit(id){
  const u = byId(state.tables.units,id);
  pageTitle.textContent = `Unit ${u?.unit_number || ''}`;
  const sections = [['overview','📋 Overview'],['tenant','👤 Tenant'],['payments','💳 Payments'],['utilities','⚡ Utilities'],['documents','📁 Documents'],['maintenance','🔧 Maintenance'],['timeline','📅 Timeline'],['compliance','✅ Compliance']];
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>🚪 Unit ${u?.unit_number||''}</h3><button class="light" id="editUnit">Edit</button></div><div class="panel-body">${u?.floor||''}</div></div><div class="panel">${sections.map(s=>`<div class="section-row" data-section="${s[0]}"><b>${s[1]}</b><span>›</span></div>`).join('')}</div><div id="sectionContent"></div>`;
  editUnit.onclick=()=>openModal('unit',id);
  content.querySelectorAll('[data-section]').forEach(x=>x.onclick=()=>renderUnitSection(id,x.dataset.section));
}

function renderUnitSection(unitId, section){
  const tenants = tenantsForUnit(unitId);
  if(section==='tenant'){
    sectionContent.innerHTML = `<div class="panel"><div class="panel-head"><h3>Tenant</h3><button class="primary" id="addTenant">+ Tenant</button></div>${tenants.map(t=>`<div class="list-row"><b>${t.name}</b><span>${eur(tenantRent(t))}</span></div>`).join('') || '<div class="panel-body">Vacant</div>'}</div>`;
    addTenant.onclick=()=>openModal('tenant');
  }
  if(section==='utilities'){
    const utilities = state.tables.utility_ean_codes.filter(x=>String(x.unit_id)===String(unitId));
    sectionContent.innerHTML = `<div class="panel"><div class="panel-head"><h3>Utilities</h3><button class="primary" id="addUtility">+ Utility</button></div><div class="panel-body">${utilities.map(ut=>{const readings=state.tables.meter_readings.filter(r=>String(r.utility_id)===String(ut.id));const last=readings.at(-1);return `<div class="utility-summary"><b>${ut.utility_type}</b><span>${last ? `${last.reading_value} ${last.reading_unit||''}` : 'No reading'} ›</span></div>`}).join('') || 'No utilities yet.'}</div></div>`;
    addUtility.onclick=()=>openModal('utilityForUnit',unitId);
  }
  if(section==='payments'){
    const tenantIds = tenants.map(t=>String(t.id));
    const pays = state.tables.payments.filter(p=>tenantIds.includes(String(p.tenant_id)));
    sectionContent.innerHTML = `<div class="panel"><div class="panel-head"><h3>Payments</h3><button class="primary" id="addPayment">+ Payment</button></div><div class="panel-body">${pays.map(p=>`${p.year}-${String(p.month).padStart(2,'0')} · expected ${eur(p.expected_amount)} · paid ${eur(p.paid_amount)}<br>`).join('') || 'No payments.'}</div></div>`;
    addPayment.onclick=()=>openModal('payment');
  }
}
