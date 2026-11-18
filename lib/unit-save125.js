'use strict';
// Only the server's authenticated workspace is used for unit writes.
async function save({workspace,body,access,supa}){
 const enc=encodeURIComponent,q='workspace_id=eq.'+enc(workspace),p=body.payload||{},building=String(p.building_id||''),id=body.unit_id?String(body.unit_id):null;
 if(!building)throw Error('Choose a building for this unit.');
 const allowed=new Set((access.building_ids||[]).map(String)),canBuilding=b=>access.scope!=='buildings'||allowed.has(String(b));
 if(!canBuilding(building))throw Error('You do not have permission to edit this building.');
 const buildings=await supa('buildings?'+q+'&id=eq.'+enc(building)+'&select=id');if(!buildings?.length)throw Error('The selected building is not available in this workspace.');
 if(id){const old=(await supa('units?'+q+'&id=eq.'+enc(id)+'&select=id,building_id'))?.[0];if(!old)throw Error('Unit not found in this workspace.');if(!canBuilding(old.building_id))throw Error('You do not have permission to edit this unit.');}
 const payload={workspace_id:workspace,building_id:building,unit_number:String(p.unit_number??'').trim().slice(0,120),floor:String(p.floor??'').trim().slice(0,80)};
 const rows=await supa(id?'units?'+q+'&id=eq.'+enc(id):'units',{method:id?'PATCH':'POST',prefer:'return=representation',body:JSON.stringify(payload)});if(!rows?.[0]?.id)throw Error('The server did not confirm the unit save.');return {ok:true,unit:rows[0]};
}
module.exports={save};
