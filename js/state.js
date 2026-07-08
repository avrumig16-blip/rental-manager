export const state={route:'dashboard',selected:{owner:null,building:null,unit:null},tables:{owners:[],buildings:[],units:[],tenants:[],tenant_units:[],payments:[],utility_ean_codes:[],meter_readings:[],documents:[],maintenance:[],contract_registrations:[],compliance_items:[]}};
export const eur=n=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(Number(n||0));
export const val=id=>document.getElementById(id)?.value||'';
export const byId=(arr,id)=>arr.find(x=>String(x.id)===String(id));
export const tenantRent=t=>Number(t?.base_rent??t?.rent??0)+Number(t?.additional_costs??0);