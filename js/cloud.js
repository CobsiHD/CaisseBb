// cloud.js — synchronisation temps réel entre iPads via le serveur du VPS.
//
// Principe : IndexedDB reste la source d'affichage (l'appli marche hors-ligne) ;
// le serveur garde la copie de référence et diffuse les changements aux autres
// appareils. Chaque écriture locale part au serveur ; ce qui vient du serveur est
// appliqué en local sans repartir (pas d'écho).
import { CLOUD } from './cloud-config.js';
import * as store from './store.js';
import { h, modal, field, toast } from './ui.js';

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

// Demande le mot de passe partagé du bar. Une seule fois par iPad.
async function askPassword() {
  const input = h('input', { class: 'input', type: 'password', placeholder: '••••••••' });
  const v = await modal({
    title: 'Connexion à la caisse partagée',
    body: h('div', {},
      field('Mot de passe du bar', input),
      h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' },
        'Une seule fois sur cet iPad. Sans mot de passe, la caisse fonctionne en local.')),
    actions: [{ label: 'Plus tard', value: false }, { label: 'Connecter', kind: 'primary', value: true }],
    onMount: () => setTimeout(() => input.focus(), 50),
  });
  if (v !== true || !input.value) return null;
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: input.value }) });
    localStorage.setItem(LS_TOKEN, r.token);
    return r.token;
  } catch (e) {
    toast('Mot de passe incorrect ou serveur injoignable');
    return null;
  }
}

// ── Démarrage ───────────────────────────────────────────────────────────────
// `onChange(tables)` reçoit l'ensemble des tables modifiées à rafraîchir.
export async function initCloud(onChange) {
  if (!cloudEnabled()) return false;
  notify = onChange;
  token = localStorage.getItem(LS_TOKEN);

  try { await fetch(base() + '/api/health').then((r) => r.json()); }
  catch { console.warn('[sync] serveur injoignable, mode local'); return false; }

  if (!token) { token = await askPassword(); if (!token) return false; }

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
    if (ops.length) { const r = await api('/api/push', { method: 'POST', body: JSON.stringify({ ops, clientId }) }); setLastRev(r.rev); }
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

async function push(ops) {
  try {
    const r = await api('/api/push', { method: 'POST', body: JSON.stringify({ ops, clientId }) });
    setLastRev(r.rev);
  } catch {
    setOutbox([...outbox(), ...ops]);
  }
}

async function flushOutbox() {
  const pending = outbox();
  if (!pending.length) return;
  setOutbox([]);
  try {
    const r = await api('/api/push', { method: 'POST', body: JSON.stringify({ ops: pending, clientId }) });
    setLastRev(r.rev);
  } catch {
    setOutbox([...pending, ...outbox()]);
  }
}

// Déconnecte cet iPad de la caisse partagée (garde les données locales).
export function disconnectCloud() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_REV);
  localStorage.removeItem(LS_OUTBOX);
  ready = false;
  store.setSyncHook(null);
  if (es) { try { es.close(); } catch {} es = null; }
}
