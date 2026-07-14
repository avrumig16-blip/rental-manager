export const state = {
  page: 'dashboard',
  currentOwner: null,
  currentBuilding: null,
  currentUnit: null,
  tables: {
    owners: [], buildings: [], units: [], tenants: [], tenant_units: [],
    payments: [], credits: [], documents: [], maintenance: [],
    utility_ean_codes: [], meter_readings: [], contract_registrations: [],
    indexations: [], compliance_items: [], bank_transactions: []
  }
};

export const eur = n => new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n||0));
export const val = id => document.getElementById(id)?.value || '';
export const tenantRent = t => Number(t?.base_rent ?? t?.rent ?? 0) + Number(t?.additional_costs ?? 0);
export const byId = (arr,id) => arr.find(x => String(x.id) === String(id));
