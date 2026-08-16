const {eb,supa}=require("./_lib");
function firstIban(d){
  if(!d||typeof d!=="object")return "";
  if(typeof d.iban==="string")return d.iban;
  if(d.account_id&&typeof d.account_id.iban==="string")return d.account_id.iban;
  const ids=d.identifications||d.account_identifications||[];
  const hit=ids.find(x=>String(x?.scheme_name||x?.schemeName||x?.scheme||"").toLowerCase()==="iban");
  return hit?.identification||hit?.value||"";
}
function accountName(d){return d?.name||d?.product||d?.details||d?.display_name||"Account"}
module.exports=async(req,res)=>{
  const base=process.env.BANK_APP_URL||`https://${req.headers.host}`;
  try{
    const code=String(req.query.code||""),state=String(req.query.state||""),id=state.split(".")[0];
    if(!code||!/^\d+$/.test(id))throw new Error("Invalid bank callback");
    const session=await eb("/sessions",{method:"POST",body:JSON.stringify({code})});
    const sessionId=session.session_id||session.sessionId;
    if(!sessionId)throw new Error("Enable Banking did not return a session ID");
    await supa(`bank_connections?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({status:"connected",external_session_id:sessionId,consent_expires_at:session.access?.valid_until||session.access?.validUntil||null,error_message:null,updated_at:new Date().toISOString()})});

    const sessionAccounts=Array.isArray(session.accounts_data)&&session.accounts_data.length
      ? session.accounts_data
      : (session.accounts||[]).map(x=>typeof x==="string"?{uid:x}:{...x});

    for(const meta of sessionAccounts){
      const uid=meta?.uid||meta?.account_id||meta?.accountId;
      if(!uid)continue;
      let details=null;
      try{details=await eb(`/accounts/${encodeURIComponent(uid)}/details`)}catch(e){console.warn("account details",uid,e.message)}
      const iban=firstIban(details)||firstIban(meta);
      const row={
        connection_id:Number(id),
        external_account_id:String(uid),
        identification_hash:meta?.identification_hash||meta?.identificationHash||null,
        bank_name:session.aspsp?.name||"Bank",
        account_name:accountName(details),
        iban,
        currency:details?.currency||details?.account_currency||"EUR"
      };
      await supa("bank_accounts?on_conflict=connection_id,external_account_id",{method:"POST",prefer:"resolution=merge-duplicates,return=representation",body:JSON.stringify(row)});
    }
    res.writeHead(302,{Location:`${base}/?bank=connected`});res.end();
  }catch(e){
    console.error("BANK_CALLBACK_ERROR",e);
    res.writeHead(302,{Location:`${base}/?bank_error=${encodeURIComponent(e.message)}`});res.end();
  }
};
