/* ══════════════════════════════════════════════════════════
   DEVKËF — Moteur de progression (localStorage)
   Inclus sur toutes les pages : dashboard, niveaux, éditeur,
   classement, profil. Une seule source de vérité.
══════════════════════════════════════════════════════════ */

const DK_KEY = 'devkef_progress_v1';

function dkDefault() {
  return {
    name: 'Toi',
    xp: 0,
    streak: 1,
    lastActiveDay: null,
    tracks: {
      web: {},
      python: {},
      c: {}
    },
    badges: []
  };
}

function dkLoad() {
  try {
    const raw = localStorage.getItem(DK_KEY);
    if (!raw) return dkDefault();
    const saved = JSON.parse(raw);
    const base = dkDefault();
    return {
      ...base,
      ...saved,
      tracks: {
        web: { ...(saved.tracks && saved.tracks.web) },
        python: { ...(saved.tracks && saved.tracks.python) },
        c: { ...(saved.tracks && saved.tracks.c) }
      }
    };
  } catch (e) {
    return dkDefault();
  }
}

function dkSave(data, skipSync) {
  try {
    localStorage.setItem(DK_KEY, JSON.stringify(data));
  } catch (e) { /* stockage indisponible (mode privé, etc.) */ }
  if (!skipSync && typeof dkSyncPushProfile === 'function' && typeof dkIsGuest === 'function' && !dkIsGuest()) {
    dkSyncPushProfile(data); // fire-and-forget, ne bloque jamais l'UI
  }
  return data;
}

/* Marque un niveau comme complété et crédite l'XP (une seule fois par niveau) */
function dkCompleteLevel(track, levelId, xpGained) {
  const data = dkLoad();
  const already = data.tracks[track] && data.tracks[track][levelId] && data.tracks[track][levelId].done;
  data.tracks[track][levelId] = { done: true, xp: xpGained };
  if (!already) data.xp += xpGained;
  dkTouchStreak(data);
  const result = dkSave(data);
  if (typeof dkSyncPushLevel === 'function' && typeof dkIsGuest === 'function' && !dkIsGuest()) {
    dkSyncPushLevel(track, levelId, xpGained);
  }
  return result;
}

function dkIsDone(track, levelId) {
  const data = dkLoad();
  return !!(data.tracks[track] && data.tracks[track][levelId] && data.tracks[track][levelId].done);
}

/* Le niveau 1 est toujours ouvert ; les suivants demandent le précédent complété */
function dkIsUnlocked(track, levelId) {
  if (levelId <= 1) return true;
  return dkIsDone(track, levelId - 1);
}

function dkGetXP() { return dkLoad().xp; }

/* Formule simple de niveau de compte : 1 niveau tous les 400 XP */
function dkGetAccountLevel() { return 1 + Math.floor(dkGetXP() / 400); }
function dkGetXPForNextAccountLevel() {
  const lvl = dkGetAccountLevel();
  return { current: dkGetXP() - (lvl - 1) * 400, needed: 400, level: lvl };
}

function dkGetCompletedCount(track) {
  const data = dkLoad();
  return Object.values(data.tracks[track] || {}).filter(l => l.done).length;
}

/* Mise à jour très simple du streak — incrémente si nouveau jour, sinon inchangé */
function dkTouchStreak(data) {
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastActiveDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    data.streak = data.lastActiveDay === yesterday ? data.streak + 1 : 1;
    data.lastActiveDay = today;
  }
}

function dkReset() {
  localStorage.removeItem(DK_KEY);
}
