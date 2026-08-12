/* ══════════════════════════════════════════════════════════
   DEVKËF — Authentification (Supabase)
   Ce fichier ne casse rien si Supabase n'est pas encore
   configuré (config.js avec des valeurs par défaut) : le site
   continue de fonctionner en mode invité, localStorage only.
   Charger dans cet ordre : config.js, supabase-js (CDN), auth.js
══════════════════════════════════════════════════════════ */

let dkSupabaseClient = null;

function dkIsConfigured() {
  return typeof SUPABASE_URL !== 'undefined'
    && typeof SUPABASE_ANON_KEY !== 'undefined'
    && !SUPABASE_URL.includes('xxxxx')
    && !SUPABASE_ANON_KEY.includes('colle-ta-clé');
}

function dkSupabase() {
  if (!dkIsConfigured()) return null;
  if (!dkSupabaseClient && window.supabase) {
    dkSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return dkSupabaseClient;
}

/* Drapeau synchrone (localStorage) — permet aux autres pages de
   savoir si on est connecté SANS attendre un appel réseau. */
function dkIsGuest() {
  return localStorage.getItem('devkef_authed') !== 'true';
}

async function dkRefreshAuthFlag() {
  const sb = dkSupabase();
  if (!sb) { localStorage.setItem('devkef_authed', 'false'); return null; }
  const { data } = await sb.auth.getSession();
  localStorage.setItem('devkef_authed', data.session ? 'true' : 'false');
  return data.session;
}

async function dkSignUpEmail(email, password, username) {
  const sb = dkSupabase();
  if (!sb) throw new Error('Backend non configuré (voir config.js).');
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { username: username || email.split('@')[0] } }
  });
  if (error) throw error;
  return data;
}

async function dkSignInEmail(email, password) {
  const sb = dkSupabase();
  if (!sb) throw new Error('Backend non configuré (voir config.js).');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await dkRefreshAuthFlag();
  return data;
}

async function dkSignInOAuth(provider) {
  const sb = dkSupabase();
  if (!sb) throw new Error('Backend non configuré (voir config.js).');
  const { error } = await sb.auth.signInWithOAuth({
    provider, // 'google' | 'github'
    options: { redirectTo: window.location.origin + '/dashboard/index.html' }
  });
  if (error) throw error;
}

async function dkSignOut() {
  const sb = dkSupabase();
  if (sb) await sb.auth.signOut();
  localStorage.setItem('devkef_authed', 'false');
  localStorage.removeItem('devkef_user_id');
}

/* ── Synchronisation avec Supabase ──
   Le localStorage reste la source rapide/synchrone utilisée par
   progress.js. Supabase est la source de vérité multi-appareil :
   on "tire" (pull) au chargement si connecté, et on "pousse"
   (push) à chaque sauvegarde locale. */

async function dkSyncPull() {
  const sb = dkSupabase();
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { localStorage.setItem('devkef_authed', 'false'); return; }
  localStorage.setItem('devkef_authed', 'true');
  localStorage.setItem('devkef_user_id', session.user.id);

  const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  const { data: levels } = await sb.from('level_progress').select('*').eq('user_id', session.user.id);

  const local = dkLoad();
  if (profile) {
    local.name = profile.username || local.name;
    local.xp = profile.xp || 0;
    local.streak = profile.streak || 1;
    local.lastActiveDay = profile.last_active_day || local.lastActiveDay;
  }
  local.tracks = { web: {}, python: {}, c: {} };
  (levels || []).forEach(l => {
    if (!local.tracks[l.track]) local.tracks[l.track] = {};
    local.tracks[l.track][l.level_id] = { done: true, xp: l.xp_earned };
  });
  dkSave(local, true); // true = ne pas repousser immédiatement ce qu'on vient de tirer
}

async function dkSyncPushProfile(data) {
  const sb = dkSupabase();
  if (!sb || dkIsGuest()) return;
  const userId = localStorage.getItem('devkef_user_id');
  if (!userId) return;
  await sb.from('profiles').update({
    username: data.name, xp: data.xp, streak: data.streak, last_active_day: data.lastActiveDay
  }).eq('id', userId);
}

async function dkSyncPushLevel(track, levelId, xpEarned) {
  const sb = dkSupabase();
  if (!sb || dkIsGuest()) return;
  const userId = localStorage.getItem('devkef_user_id');
  if (!userId) return;
  await sb.from('level_progress').upsert({
    user_id: userId, track, level_id: levelId, xp_earned: xpEarned
  }, { onConflict: 'user_id,track,level_id' });
}

/* Classement réel (top 20 par XP) — utilisé par dashboard/classement.html */
async function dkFetchLeaderboard() {
  const sb = dkSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('profiles').select('username, xp').order('xp', { ascending: false }).limit(20);
  if (error) return null;
  return data;
}

async function dkSyncReset() {
  const sb = dkSupabase();
  if (!sb || dkIsGuest()) return;
  const userId = localStorage.getItem('devkef_user_id');
  if (!userId) return;
  await sb.from('level_progress').delete().eq('user_id', userId);
  await sb.from('profiles').update({ xp: 0, streak: 1 }).eq('id', userId);
}
