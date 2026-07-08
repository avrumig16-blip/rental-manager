import {sb} from './supabase.js';import {loadAll} from './api.js';import {renderApp} from './app.js';
export async function initAuth(){loginBtn.onclick=login;logoutBtn.onclick=logout;const {data:{session}}=await sb.auth.getSession();if(session)await enter(session);}
async function login(){loginError.textContent='';const {data,error}=await sb.auth.signInWithPassword({email:loginEmail.value.trim(),password:loginPassword.value});if(error){loginError.textContent=error.message;return;}await enter(data.session);}
async function enter(session){loginScreen.classList.add('hidden');loggedInUser.textContent=session.user.email;await loadAll();renderApp();}
async function logout(){await sb.auth.signOut();location.reload();}