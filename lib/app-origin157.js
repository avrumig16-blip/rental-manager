'use strict';
// Worker/authenticated API traffic must go directly to the production host.
// OAuth bank callback registration is configured separately in bank-redirect142.
function appUrl(env=process.env){
 const raw=(String(env.BANK_APP_URL||'').trim()||String(env.APP_BASE_URL||'').trim()).replace(/\/+$/,'');
 if(!raw)return '';
 try{const u=new URL(raw);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&['managerent4u.com','www.managerent4u.com'].includes(u.hostname))return 'https://www.managerent4u.com'}catch{}
 return raw;
}
module.exports={appUrl};
