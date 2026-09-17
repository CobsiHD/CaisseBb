// cloud.js — synchronisation temps réel entre iPads via le serveur du VPS.
//
// Principe : IndexedDB reste la source d'affichage (l'appli marche hors-ligne) ;
// le serveur garde la copie de référence et diffuse les changements aux autres
// appareils. Chaque écriture locale part au serveur ; ce qui vient du serveur est
// appliqué en local sans repartir (pas d'écho).
import { CLOUD } from './cloud-config.js';
import * as store from './store.js';

// Tables synchronisées → nom de leur clé primaire.
const SYNCED = { categories: 'id', products: 'id', optiongroups: 'id', layout: 'id', tiles: 'id', orders: 'id', tickets: 'id', prints: 'id', settings: 'key' };
// Réglages qui restent propres à chaque appareil.
const LOCAL_SETTINGS = new Set(['activeArea']);

const LS_TOKEN = 'bb-sync-token';
const LS_REV = 'bb-sync-rev';
const LS_CLIENT = 'bb-sync-client';
const LS_OUTBOX = 'bb-sync-outbox';

let token = null;
let ready = false;
let applyingRemote = false;
let notify = null;
let es = null;
let pulling = null;

const clientId = (() => {
  let v = localStorage.getItem(LS_CLIENT);
  if (!v) { v = uid(); localStorage.setItem(LS_CLIENT, v); }
  return v;
})();

function uid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const base = () => (CLOUD.URL || '').replace(/\/$/, '');
const lastRev = () => Number(localStorage.getItem(LS_REV) || 0);
const setLastRev = (r) => localStorage.setItem(LS_REV, String(r));

export function cloudEnabled() { return !!CLOUD.ENABLED; }
export function syncActive() { return ready; }

// ── Connexion ───────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(base() + path, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { token = null; localStorage.removeItem(LS_TOKEN); throw new Error('non autorisé'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Jeton d'accès ───────────────────────────────────────────────────────────
// Le même jeton sert au verrou d'entrée (gate.js) et à la synchro : l'équipe ne
// saisit le mot de passe du bar qu'une fois par iPad.
export function savedToken() {
  try { return localStorage.getItem(LS_TOKEN); } catch { return null; }
}
export function clearToken() {
  try { localStorage.removeItem(LS_TOKEN); } catch {}
}

// Un jeton s'écrit `role.expiration.signature`. Sa date d'expiration se lit donc
// sans le serveur — c'est ce qui permet d'ouvrir la caisse quand le Wi-Fi du bar
// est tombé. La signature, elle, n'est vérifiable que côté serveur : un jeton
// bricolé ne donne accès à aucune donnée.
export function tokenValid(t) {
  const parts = String(t || '').split('.');
  if (parts.length !== 2 && parts.length !== 3) return false;
  const exp = Number(parts.length === 2 ? parts[0] : parts[1]);
  return exp > Date.now();
}

// Échange le mot de passe du bar contre un jeton. Lève 'motdepasse' s'il est
// refusé, 'serveur' si l'API est injoignable.
export async function login(password) {
  let res;
  try {
    res = await fetch(base() + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // La réponse pose le cookie de session que nginx vérifie avant de livrer
      // les fichiers. Sans ce drapeau, un mot de passe saisi DANS l'appli ne
      // rouvrirait pas la serrure des fichiers, et le lancement suivant
      // repartirait bêtement sur /connexion.html.
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
  } catch { throw new Error('serveur'); }
  if (res.status === 401) throw new Error('motdepasse');
  if (!res.ok) throw new Error('serveur');
  const r = await res.json();
  // Le mot de passe de l'agent d'impression du Pi n'ouvre pas la caisse : il ne
  // donne droit qu'aux bons de cuisine, et son rôle le dit.
  if (r.role && r.role !== 'full') throw new Error('motdepasse');
  token = r.token;
  localStorage.setItem(LS_TOKEN, r.token);
  return r;
}

// Échange le cookie de session contre le jeton de synchro. C'est ce qui fait
// qu'on ne saisit le mot de passe QU'UNE fois : si les fichiers de l'appli sont
// arrivés, c'est que nginx a déjà validé le cookie — redemander la même phrase
// devant le verrou d'entrée n'apprendrait rien à personne.
// Renvoie le jeton, ou null s'il n'y a pas de cookie valide (on demandera alors).
export async function session() {
  try {
    const res = await fetch(base() + '/api/session', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const r = await res.json();
    if (!r.token || (r.role && r.role !== 'full')) return null;
    token = r.token;
    localStorage.setItem(LS_TOKEN, r.token);
    return r.token;
  } catch { return null; }   // serveur injoignable : on retombera sur le formulaire
}

// ── Démarrage ───────────────────────────────────────────────────────────────
// `onChange(tables)` reçoit l'ensemble des tables modifiées à rafraîchir.
export async function initCloud(onChange) {
  if (!cloudEnabled()) return false;
  notify = onChange;
  token = localStorage.getItem(LS_TOKEN);

  try { await fetch(base() + '/api/health').then((r) => r.json()); }
  catch { console.warn('[sync] serveur injoignable, mode local'); return false; }

  // Le verrou d'entrée (gate.js) a déjà obtenu le jeton ; sans lui, mode local.
  if (!token) return false;

  try {
    const first = !lastRev();
    if (first) await firstSync();
    else await pullAndApply();
  } catch (e) {
    console.warn('[sync] synchro initiale échouée, mode local', e);
    return false;
  }

  ready = true;
  store.setSyncHook(hook);
  flushOutbox();
  openStream();

  // Filets de sécurité : reprise au retour de l'app et si le flux temps réel tombe.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { flushOutbox(); pullAndApply().catch(() => {}); }
  });
  setInterval(() => { if (!es || es.readyState === 2) { openStream(); pullAndApply().catch(() => {}); } }, 20000);
  return true;
}

// Première synchro de cet appareil : le serveur fait foi s'il contient déjà
// quelque chose, sinon on l'initialise avec les données de cet iPad.
async function firstSync() {
  const { rev, changes } = await api('/api/pull?since=0');
  if (rev > 0) {
    applyingRemote = true;
    try {
      for (const t of Object.keys(SYNCED)) await store.clear(t);
      await applyChanges(changes);
    } finally { applyingRemote = false; }
    setLastRev(rev);
    notifyTables(Object.keys(changes));
  } else {
    const ops = [];
    for (const t of Object.keys(SYNCED)) {
      for (const row of await store.getAll(t)) {
        if (t === 'settings' && LOCAL_SETTINGS.has(row.key)) continue;
        ops.push({ op: 'put', table: t, value: row });
      }
    }
    if (ops.length) await envoie(ops);
    else setLastRev(rev || 1);
  }
}

async function pullAndApply() {
  if (pulling) return pulling;
  pulling = (async () => {
    const { rev, changes } = await api(`/api/pull?since=${lastRev()}`);
    if (rev === lastRev()) return;
    applyingRemote = true;
    try { await applyChanges(changes); } finally { applyingRemote = false; }
    setLastRev(rev);
    notifyTables(Object.keys(changes));
  })().finally(() => { pulling = null; });
  return pulling;
}

async function applyChanges(changes) {
  for (const [t, rows] of Object.entries(changes || {})) {
    if (!SYNCED[t]) continue;
    for (const row of rows) {
      if (row.deleted) await store.del(t, castKey(t, row.id));
      else if (row.data) await store.put(t, row.data);
    }
  }
}

// Les ids voyagent en texte ; ceux d'origine auto-incrémentée sont numériques en local.
function castKey(table, id) {
  if (table === 'settings') return id;
  return /^\d+$/.test(id) ? Number(id) : id;
}

function notifyTables(tables) {
  if (notify && tables && tables.length) notify(new Set(tables));
}

// ── Flux temps réel ─────────────────────────────────────────────────────────
function openStream() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource(`${base()}/api/events?token=${encodeURIComponent(token)}`);
  es.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (d.hello || d.from === clientId) return;
    pullAndApply().catch(() => {});
  };
  es.onerror = () => { /* reconnexion assurée par le filet de sécurité */ };
}

// ── Écritures locales → serveur ─────────────────────────────────────────────
function hook(op, table, arg) {
  if (applyingRemote || !ready || !SYNCED[table]) return;
  const ops = [];
  if (op === 'put') ops.push({ op: 'put', table, value: arg });
  else if (op === 'bulkPut') for (const v of arg || []) ops.push({ op: 'put', table, value: v });
  else if (op === 'del') ops.push({ op: 'del', table, id: String(arg) });
  else if (op === 'clear') ops.push({ op: 'clear', table });
  const kept = ops.filter((o) => !(table === 'settings' && o.op === 'put' && LOCAL_SETTINGS.has(o.value?.key)));
  if (kept.length) push(kept);
}

// File d'attente : ce qui n'a pas pu partir (coupure réseau) est renvoyé plus tard.
function outbox() {
  try { return JSON.parse(localStorage.getItem(LS_OUTBOX) || '[]'); } catch { return []; }
}
function setOutbox(v) {
  try { localStorage.setItem(LS_OUTBOX, JSON.stringify(v.slice(-2000))); } catch {}
}

// Le serveur refuse une requête de plus de 8 Mo. Une carte dont les fiches
// portent des photos peut peser plusieurs mégaoctets, et la première synchro
// d'un iPad neuf pousse la base entière d'un coup : on la découpe pour ne
// jamais s'approcher du plafond.
const PUSH_MAX_OCTETS = 3 * 1024 * 1024;

function lots(ops) {
  const out = [];
  let courant = [], taille = 0;
  for (const o of ops) {
    const t = JSON.stringify(o).length;
    // Une opération seule au-delà du plafond part quand même : la refuser ici
    // la perdrait en silence, et le serveur dira non plus clairement.
    if (courant.length && taille + t > PUSH_MAX_OCTETS) { out.push(courant); courant = []; taille = 0; }
    courant.push(o); taille += t;
  }
  if (courant.length) out.push(courant);
  return out;
}

// Laisse remonter l'erreur : à l'appelant de choisir entre la file d'attente et
// l'abandon de la synchro.
async function envoie(ops) {
  for (const paquet of lots(ops)) {
    const r = await api('/api/push', { method: 'POST', body: JSON.stringify({ ops: paquet, clientId }) });
    setLastRev(r.rev);
  }
}

async function push(ops) {
  // Tout repart en file, y compris ce qui était déjà passé dans un paquet
  // précédent : réécrire la même ligne avec le même contenu est sans effet.
  try { await envoie(ops); } catch { setOutbox([...outbox(), ...ops]); }
}

async function flushOutbox() {
  const pending = outbox();
  if (!pending.length) return;
  setOutbox([]);
  try { await envoie(pending); }
  catch { setOutbox([...pending, ...outbox()]); }
}
