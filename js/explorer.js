import { state, tenantsForUnit } from './state.js';
import { render } from './app.js';
import { openBuildingView, openUnitView } from './views.js';

export function renderExplorer(){
  const q = (searchInput.value || '').toLowerCase();
  let html = '';

  for (const owner of state.tables.owners){
    const buildings = state.tables.buildings.filter(b => String(b.owner_id) === String(owner.id));
    const hay = `${owner.name} ${owner.email} ${owner.phone}`.toLowerCase();
    if (q && !hay.includes(q) && !buildings.some(b=>`${b.name} ${b.address}`.toLowerCase().includes(q))) continue;

    html += `<div class="tree-item" data-owner="${owner.id}">👤 ${owner.name||'Owner'}</div><div class="tree-child">`;
    for (const b of buildings){
      const units = state.tables.units.filter(u => String(u.building_id) === String(b.id));
      html += `<div class="tree-item" data-building="${b.id}">🏢 ${b.name||'Building'}</div><div class="tree-child">`;
      for (const u of units){
        const tenants = tenantsForUnit(u.id).map(t=>t.name).join(', ');
        html += `<div class="tree-item" data-unit="${u.id}">🚪 ${u.unit_number||'Unit'} ${tenants?'<div class="tree-small">'+tenants+'</div>':''}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  portfolioTree.innerHTML = html || '<div class="tree-item">No portfolio yet</div>';
  portfolioTree.querySelectorAll('[data-owner]').forEach(x => x.onclick = () => { state.page='owners'; render(); });
  portfolioTree.querySelectorAll('[data-building]').forEach(x => x.onclick = () => openBuildingView(x.dataset.building));
  portfolioTree.querySelectorAll('[data-unit]').forEach(x => x.onclick = () => openUnitView(x.dataset.unit));
}
