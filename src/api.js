import { sb } from './supabaseClient.js';
import { state } from './state.js';

export async function loadAll(){
  for(const table of Object.keys(state.tables)){
    const {data,error} = await sb.from(table).select('*');
    state.tables[table] = error ? [] : (data || []);
    if(error) console.warn(table, error.message);
  }
}

export async function upsert(table, payload, id=null){
  const q = id ? sb.from(table).update(payload).eq('id', id).select().single()
               : sb.from(table).insert(payload).select().single();
  const {data,error} = await q;
  if(error) throw error;
  return data;
}
