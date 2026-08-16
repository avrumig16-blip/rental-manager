const crypto=require("crypto");
const API="https://api.enablebanking.com";
function b64url(v){return Buffer.from(v).toString("base64url")}
function jwt(){
  const app=process.env.ENABLE_BANKING_APP_ID;
  const key=(process.env.ENABLE_BANKING_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  if(!app||!key)throw new Error("Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_PRIVATE_KEY");
  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({typ:"JWT",alg:"RS256",kid:app}));
  const body=b64url(JSON.stringify({iss:"enablebanking.com",aud:"api.enablebanking.com",iat:now,exp:now+3600}));
  const input=`${header}.${body}`;
  const sig=crypto.sign("RSA-SHA256",Buffer.from(input),key).toString("base64url");
  return `${input}.${sig}`;
}
async function eb(path,options={}){
  const r=await fetch(API+path,{...options,headers:{Authorization:`Bearer ${jwt()}`,Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
  const txt=await r.text();let data;try{data=JSON.parse(txt)}catch{data={message:txt}}
  if(!r.ok)throw new Error(`Enable Banking ${r.status}: ${data.detail||data.message||data.error||"Request failed"}`);
  return data;
}
function supabaseBase(){
  let url=String(process.env.SUPABASE_URL||"").trim();
  if(!url)throw new Error("Missing SUPABASE_URL");
  url=url.replace(/\/+$/,"");
  url=url.replace(/\/rest\/v1$/i,"");
  return url;
}
async function supa(path,options={}){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if(!key)throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  let clean=String(path||"").replace(/^\/+/,"").replace(/^rest\/v1\//i,"");
  const target=`${supabaseBase()}/rest/v1/${clean}`;
  const headers={apikey:key,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...(options.headers||{})};
  // Legacy service_role keys are JWTs and may also be supplied as Bearer tokens.
  // New sb_secret_ keys must be sent only via apikey.
  if(!key.startsWith("sb_secret_")) headers.Authorization=`Bearer ${key}`;
  const r=await fetch(target,{...options,headers});
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data={message:txt}}
  if(!r.ok){
    const msg=data?.message||data?.details||data?.hint||`HTTP ${r.status}`;
    throw new Error(`Supabase ${r.status} (${clean.split("?")[0]}): ${msg}`);
  }
  return data;
}
module.exports={eb,supa};
