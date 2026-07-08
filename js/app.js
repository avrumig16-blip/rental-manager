import { initAuth } from './auth.js';
import { state } from './state.js';
import { renderExplorer } from './explorer.js';
import { renderDashboard, renderOwners, renderBuildings, renderUnits } from './views.js';
import { openForm } from './modal.js';

export function render(){
  renderExplorer();
  if (state.page === 'owners') return renderOwners();
  if (state.page === 'buildings') return renderBuildings();
  if (state.page === 'units') return renderUnits();
  return renderDashboard();
}

document.querySelectorAll('[data-page]').forEach(btn => {
  btn.onclick = () => {
    state.page = btn.dataset.page;
    render();
  };
});

topAddOwner.onclick = () => openForm('owner');
topAddBuilding.onclick = () => openForm('building');
topAddUnit.onclick = () => openForm('unit');
searchInput.oninput = render;

initAuth();
