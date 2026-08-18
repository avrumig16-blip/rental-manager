const {eb}=require('./_lib');
module.exports=async(req,res)=>{try{const country=String(req.query.country||'BE').toUpperCase(),psu=String(req.query.psu_type||'business');const q=new URLSearchParams({country,psu_type:psu,service:'AIS'});const data=await eb(`/aspsps?${q.toString()}`);res.status(200).json({aspsps:data.aspsps||[]})}catch(e){res.status(500).json({error:e.message})}};
