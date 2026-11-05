'use strict';
const address=require('../assets/address-model');
// Address components belong to the existing JSON column, not optional legacy columns.
module.exports=function normalizeTenantAddress(input,payload){
 const has=Object.prototype.hasOwnProperty;
 if(has.call(input,'postal_address')||['address','postal_code','city','country'].some(k=>has.call(input,k))){
  const postal=address.read(input);
  if(!postal.region)postal.region=String(input.lease_region||'').trim();
  payload.postal_address=postal;
  if(input.lease_region===undefined&&postal.region)payload.lease_region=postal.region;
 }
 // Read legacy aliases, but never send them to SQL: V95 stores the full address
 // in postal_address and does not require any of these standalone columns.
 for(const key of ['address','city','postal_code','country'])delete payload[key];
 return payload;
};
