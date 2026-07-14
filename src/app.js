import { initAuth } from './auth.js';
import { state } from './state.js';
import { renderDashboard } from './dashboard.js';
import { renderTree } from './explorer.js';
import { renderOwner, renderBuilding, renderUnit } from './workspace.js';
import { renderBanking } from './banking.js';
import { renderDocuments } from './documents.js';
import { openModal } from './modal.js';

export function render(){
  renderTree();
  if(state.currentUnit) return renderUnit(state.currentUnit);
  if(state.currentBuilding) return renderBuilding(state.currentBuilding);
  if(state.currentOwner) return renderOwner(state.currentOwner);
  if(state.page === 'banking') return renderBanking();
  if(state.page === 'documents') return renderDocuments();
  if(state.page === 'roles') return renderRoles();
  return renderDashboard();
}

function renderRoles(){
  pageTitle.textContent = 'Users & Roles';
  content.innerHTML = `<div class="panel"><div class="panel-head"><h3>Users & Roles</h3></div>
  <div class="panel-body"><b>Admin</b>: everything<br><b>Editor</b>: add/edit data<br><b>Viewer</b>: read only<br><b>Owner</b>: read only, only their portfolio<br><br>Next step: profiles table + role policies.</div></div>`;
}

document.querySelectorAll('nav button[data-page]').forEach(btn=>{
  btn.onclick = () => {
    state.page = btn.dataset.page;
    state.currentOwner = state.currentBuilding = state.currentUnit = null;
    render();
  };
});
addOwner.onclick = () => openModal('owner');
addBuilding.onclick = () => openModal('building');
addUnit.onclick = () => openModal('unit');
searchBox.oninput = render;
initAuth();
