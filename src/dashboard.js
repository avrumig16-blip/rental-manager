import { state, eur } from './state.js';

export function renderDashboard(){
  pageTitle.textContent = 'Dashboard';
  const t = state.tables;
  const outstanding = t.payments.reduce((s,p)=>s + Math.max(0, Number(p.expected_amount||0)-Number(p.paid_amount||0)), 0);
  const missingUtilities = t.units.filter(u=>!t.utility_ean_codes.some(e=>String(e.unit_id)===String(u.id))).length;
  content.innerHTML = `
  <div class="grid">
    <div class="card"><small>Owners</small><b>${t.owners.length}</b></div>
    <div class="card"><small>Buildings</small><b>${t.buildings.length}</b></div>
    <div class="card"><small>Units</small><b>${t.units.length}</b></div>
    <div class="card"><small>Outstanding</small><b>${eur(outstanding)}</b></div>
  </div>
  <div class="panel"><div class="panel-head"><h3>Action required</h3></div>
  <div class="panel-body">⚠ Outstanding rent: <b>${eur(outstanding)}</b><br>⚠ Units missing utilities: <b>${missingUtilities}</b></div></div>`;
}
