// store.js — persistance locale (IndexedDB), sans dépendance.
// Stores : settings, categories, products, layout, orders.
import { CATEGORIES, PRODUCTS, DEMO_LAYOUT, SETTINGS_DEFAULTS } from './seed.js';

const DB_NAME = 'bluebird-caisse';
const DB_VERSION = 4;
const STORES = ['settings', 'categories', 'products', 'layout', 'orders', 'tiles', 'tickets', 'prints'];

let dbPromise = null;

// Hook de synchronisation (branché par cloud.js). Appelé après chaque écriture :
// syncHook(op, store, valueOuId). Reste null tant que le cloud n'est pas actif.
let syncHook = null;
export function setSyncHook(fn) { syncHook = fn; }

// Stores dont les ids étaient auto-incrémentés : avec la synchro entre iPads, deux
// appareils attribueraient le même numéro. On génère donc un id unique côté client.
const UID_STORES = new Set(['layout', 'orders', 'tiles', 'tickets']);
export function uid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('categories'))
        db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('products'))
        db.createObjectStore('products', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('layout'))
        db.createObjectStore('layout', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('orders'))
        db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('tiles'))
        db.createObjectStore('tiles', { keyPath: 'id', autoIncrement: true });
      // Bons de commande cuisine (envoyés du 22 vers le Bluebird).
      if (!db.objectStoreNames.contains('tickets'))
        db.createObjectStore('tickets', { keyPath: 'id' });
      // Accusés d'impression, écrits UNIQUEMENT par l'agent du Raspberry Pi.
      // Table séparée des bons : la synchro applique le dernier-écrit-gagne par
      // ligne, donc l'agent et la cuisine ne doivent jamais viser la même.
      if (!db.objectStoreNames.contains('prints'))
        db.createObjectStore('prints', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  return asPromise((await tx(store)).getAll());
}
export async function get(store, id) {
  return asPromise((await tx(store)).get(id));
}
export async function put(store, value) {
  if (value && value.id == null && UID_STORES.has(store)) value.id = uid();
  const os = await tx(store, 'readwrite');
  const key = await asPromise(os.put(value));
  if (value.id == null) value = { ...value, id: key };
  syncHook && syncHook('put', store, value);
  return value.id ?? key;
}
export async function bulkPut(store, values) {
  if (UID_STORES.has(store)) for (const v of values) if (v && v.id == null) v.id = uid();
  const os = await tx(store, 'readwrite');
  await Promise.all(values.map((v) => asPromise(os.put(v))));
  syncHook && syncHook('bulkPut', store, values);
}
export async function del(store, id) {
  const os = await tx(store, 'readwrite');
  const r = await asPromise(os.delete(id));
  syncHook && syncHook('del', store, id);
  return r;
}
export async function clear(store) {
  const os = await tx(store, 'readwrite');
  const r = await asPromise(os.clear());
  syncHook && syncHook('clear', store);
  return r;
}

// ── Réglages (clé/valeur) ────────────────────────────────────
export async function getSettings() {
  const rows = await getAll('settings');
  const out = { ...SETTINGS_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export async function setSetting(key, value) {
  return put('settings', { key, value });
}

// ── Initialisation / seed au premier lancement ───────────────
export async function init() {
  const cats = await getAll('categories');
  if (cats.length === 0) {
    await bulkPut('categories', CATEGORIES.map((c, i) => ({ ...c, order: i })));
    await bulkPut('products', PRODUCTS.map((p, i) => ({ ...p, order: i })));
    await bulkPut('layout', DEMO_LAYOUT);
    for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
      await setSetting(key, value);
    }
  }
}

// ── Sauvegarde / restauration JSON ───────────────────────────
export async function exportAll() {
  const [settings, categories, products, layout, orders, tiles, tickets, prints] = await Promise.all(
    STORES.map((s) => getAll(s))
  );
  return {
    app: 'bluebird-caisse', version: DB_VERSION,
    data: { settings, categories, products, layout, orders, tiles, tickets, prints },
  };
}

export async function importAll(dump) {
  const data = dump?.data;
  if (!data) throw new Error('Sauvegarde invalide.');
  for (const s of STORES) {
    await clear(s);
    if (Array.isArray(data[s]) && data[s].length) await bulkPut(s, data[s]);
  }
}

// Il n'y a volontairement pas de « remise à la carte par défaut » : avec la
// synchro, un `clear` part sur le serveur et efface tous les autres appareils.
// Le seed ci-dessus ne joue qu'au tout premier lancement, base vide.
