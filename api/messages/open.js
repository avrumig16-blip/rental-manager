const {supa,event}=require('./_lib');
const pixel=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
module.exports=async(req,res)=>{try{const token=String(req.query?.token||'');if(token){const rows=await supa(`tenant_messages?tracking_token=eq.${encodeURIComponent(token)}&select=id`);if(rows?.[0])await event(rows[0].id,'opened',{user_agent:req.headers['user-agent']||''})}}catch{}res.setHeader('Content-Type','image/gif');res.setHeader('Cache-Control','no-store');return res.status(200).send(pixel)}
