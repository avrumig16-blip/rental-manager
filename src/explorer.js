import { state } from './state.js';
import { render } from './app.js';

export function tenantsForUnit(unitId){
  const links = state.tables.tenant_units.filter(x => String(x.unit_id) === String(unitId)).map(x => String(x.tenant_id));
  return state.tables.tenants.filter(t => String(t.unit_id) === String(unitId) || links.includes(String(t.id)));
}

export function renderTree(){
  const q = searchBox.value.toLowerCase();
  let html = '';
  for(const owner of state.tables.owners){
    const buildings = state.tables.buildings.filter(b => String(b.owner_id) === String(owner.id));
    html += `<div class="tree-item" data-owner="${owner.id}">👤 ${owner.name || 'Owner'}</div><div class="tree-child">`;
    for(const building of buildings){
      if(q && !(`${owner.name} ${building.name} ${building.address}`.toLowerCase().includes(q))) continue;
      html += `<div class="tree-item" data-building="${building.id}">🏢 ${building.name}</div><div class="tree-child">`;
      for(const unit of state.tables.units.filter(u => String(u.building_id) === String(building.id))){
        const tenants = tenantsForUnit(unit.id).map(t=>t.name).join(', ');
        html += `<div class="tree-item" data-unit="${unit.id}">🚪 ${unit.unit_number} ${tenants ? '· '+tenants : ''}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  portfolioTree.innerHTML = html || '<div class="tree-item">No portfolio yet.</div>';
  portfolioTree.querySelectorAll('[data-owner]').forEach(x=>x.onclick=()=>{state.currentOwner=x.dataset.owner;state.currentBuilding=state.currentUnit=null;render();});
  portfolioTree.querySelectorAll('[data-building]').forEach(x=>x.onclick=()=>{state.currentBuilding=x.dataset.building;state.currentUnit=null;render();});
  portfolioTree.querySelectorAll('[data-unit]').forEach(x=>x.onclick=()=>{state.currentUnit=x.dataset.unit;render();});
}
