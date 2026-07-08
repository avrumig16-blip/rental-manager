export const state = {
  page: 'dashboard',
  tables: { owners: [], buildings: [], units: [], tenants: [], tenant_units: [], payments: [] }
};

export const eur = n => new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n||0));
export const byId = (arr,id) => arr.find(x => String(x.id) === String(id));
export const val = id => document.getElementById(id)?.value || '';

export function tenantsForUnit(unitId){
  const links = state.tables.tenant_units.filter(x => String(x.unit_id) === String(unitId)).map(x => String(x.tenant_id));
  return state.tables.tenants.filter(t => String(t.unit_id) === String(unitId) || links.includes(String(t.id)));
}
