import { sb } from './supabaseClient.js';
import { loadAll } from './api.js';
import { render } from './app.js';

export async function initAuth(){
  loginBtn.onclick = loginUser;
  logoutBtn.onclick = logoutUser;
  const {data:{session}} = await sb.auth.getSession();
  if(session) await enter(session);
}

async function loginUser(){
  loginError.textContent = '';
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  const {data,error} = await sb.auth.signInWithPassword({email,password});
  if(error){ loginError.textContent = error.message; return; }
  await enter(data.session);
}

async function enter(session){
  login.classList.add('hidden');
  userEmail.textContent = session.user.email;
  await loadAll();
  render();
}

async function logoutUser(){
  await sb.auth.signOut();
  location.reload();
}
