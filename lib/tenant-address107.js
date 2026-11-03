'use strict';
const address=require('../assets/address-model');
// Address components belong to the existing JSON column, not optional legacy columns.
module.exports=function normalizeTenantAddress(input,payload){
 const has=Object.prototype.hasOwnProperty;
 if(has.call(input,'postal_address')||['address','postal_code','city','country'].some(k=>has.call(input,k))){
  const postal=address.read(input);
  if(!postal.region)postal.region=String(input.lease_region||'').trim();
  payload.postal_address=postal;
  payload.address=address.format({postal_address:postal});
  if(input.lease_region===undefined&&postal.region)payload.lease_region=postal.region;
 }
 for(const key of ['city','postal_code','country'])delete payload[key];
 return payload;
};
