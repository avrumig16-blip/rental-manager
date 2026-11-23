'use strict';
// One callback builder for new connections and reconnects. BANK_APP_URL is an origin,
// not a callback path; a trailing slash must never produce //api/bank/callback.
function urls(req,env=process.env){
 const configured=String(env.BANK_REDIRECT_URL||'').trim();
 const base=String(env.BANK_APP_URL||'').trim()||`https://${req.headers.host}`;
 let u;try{u=new URL(configured||base)}catch{throw Error('Bank callback configuration is invalid. Set BANK_APP_URL to https://managerent4u.com.')}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Bank callback must use an HTTPS address without credentials, query or fragment.');
 if(!configured){if(u.hostname==='www.managerent4u.com')u.hostname='managerent4u.com';u.pathname='/api/bank/callback'}
 return {origin:u.origin,callback:u.href};
}
module.exports={urls};
