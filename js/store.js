// store.js — persistance locale (IndexedDB), sans dépendance.
// Stores : settings, categories, products, layout, orders.
import { CATEGORIES, PRODUCTS, DEMO_LAYOUT, SETTINGS_DEFAULTS, TILES } from './seed.js';

const DB_NAME = 'bluebird-caisse';
const DB_VERSION = 2;
const STORES = ['settings', 'categories', 'products', 'layout', 'orders', 'tiles'];

let dbPromise = null;

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
  const os = await tx(store, 'readwrite');
  const key = await asPromise(os.put(value));
  return value.id ?? key;
}
export async function bulkPut(store, values) {
  const os = await tx(store, 'readwrite');
  await Promise.all(values.map((v) => asPromise(os.put(v))));
}
export async function del(store, id) {
  const os = await tx(store, 'readwrite');
  return asPromise(os.delete(id));
}
export async function clear(store) {
  const os = await tx(store, 'readwrite');
  return asPromise(os.clear());
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
  const [settings, categories, products, layout, orders] = await Promise.all(
    STORES.map((s) => getAll(s))
  );
  return {
    app: 'bluebird-caisse', version: DB_VERSION,
    data: { settings, categories, products, layout, orders },
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

// Réinitialise le catalogue/plan aux valeurs de la carte officielle
// (ne touche pas aux notes en cours).
export async function resetCatalog() {
  await clear('categories');
  await clear('products');
  await bulkPut('categories', CATEGORIES.map((c, i) => ({ ...c, order: i })));
  await bulkPut('products', PRODUCTS.map((p, i) => ({ ...p, order: i })));
}

// Recharge TOUTE la configuration par défaut (plan + carte + tuiles) sur cet appareil.
// Efface aussi les notes en cours (sinon elles pointeraient vers d'anciennes tables).
// Ne touche pas aux réglages (PIN, happy hour).
export async function loadDefaults() {
  for (const s of ['categories', 'products', 'layout', 'tiles', 'orders']) await clear(s);
  await bulkPut('categories', CATEGORIES.map((c, i) => ({ ...c, order: i })));
  await bulkPut('products', PRODUCTS.map((p, i) => ({ ...p, order: i })));
  await bulkPut('layout', DEMO_LAYOUT);
  if (TILES && TILES.length) await bulkPut('tiles', TILES);
}
