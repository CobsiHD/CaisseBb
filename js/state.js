// state.js — état partagé en mémoire + dérivations + petit bus d'événements.
import * as store from './store.js';

export const state = {
  settings: { ...{} },
  categories: [],
  products: [],
  layout: [],
  orders: [],
  tiles: [],
  area: 'terrasse',      // onglet actif du plan
  planMode: 'service',   // 'service' | 'edition'
};

const listeners = new Map();
export function on(evt, cb) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(cb);
  return () => listeners.get(evt).delete(cb);
}
export function emit(evt, payload) {
  (listeners.get(evt) || []).forEach((cb) => cb(payload));
  (listeners.get('*') || []).forEach((cb) => cb(evt, payload));
}

export async function loadAll() {
  await store.init();
  const [settings, categories, products, layout, orders, tiles] = await Promise.all([
    store.getSettings(),
    store.getAll('categories'),
    store.getAll('products'),
    store.getAll('layout'),
    store.getAll('orders'),
    store.getAll('tiles'),
  ]);
  state.settings = settings;
  state.categories = categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.products = products.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.layout = layout;
  state.orders = orders;
  state.tiles = tiles;
  state.area = settings.activeArea || 'terrasse';
}

export async function reloadTiles() {
  state.tiles = await store.getAll('tiles');
  emit('tiles');
}

export async function reloadOrders() {
  state.orders = await store.getAll('orders');
  emit('orders');
}
export async function reloadLayout() {
  state.layout = await store.getAll('layout');
  emit('layout');
}
export async function reloadCatalog() {
  state.categories = (await store.getAll('categories')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.products = (await store.getAll('products')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  emit('catalog');
}

// ── Formatage ────────────────────────────────────────────────
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const money = (n) => eur.format(n || 0);

// ── Dérivations notes / tables ───────────────────────────────
export function lineUnit(item) {
  const opts = (item.options || []).reduce((s, o) => s + (o.delta || 0), 0);
  return (item.price || 0) + opts;
}
// "1 acheté = 1 offert" : on ne facture qu'une unité sur deux.
export function lineBilledQty(item) {
  return item.hh ? Math.ceil((item.qty || 0) / 2) : (item.qty || 0);
}
export function lineTotal(item) {
  return lineUnit(item) * lineBilledQty(item);
}
export function orderTotal(order) {
  return (order.items || []).reduce((s, it) => s + lineTotal(it), 0);
}

export function openOrdersForTable(tableId) {
  return state.orders.filter((o) => o.tableId === tableId && o.status === 'open');
}
export function tableTotal(tableId) {
  return openOrdersForTable(tableId).reduce((s, o) => s + orderTotal(o), 0);
}
// 'libre' | 'occupee' | 'encaisser'
export function tableStatus(tableId) {
  const open = openOrdersForTable(tableId);
  if (open.length === 0) return 'libre';
  if (open.some((o) => o.toPay)) return 'encaisser';
  return 'occupee';
}

// Zones du plan + base de numérotation des tables (Extérieur 3XX, Arcade 2XX, Intérieur 1XX).
export const AREAS = [
  { id: 'terrasse',  name: 'Terrasse',  base: 300 },
  { id: 'arcade',    name: 'Arcade',    base: 200 },
  { id: 'interieur', name: 'Intérieur', base: 100 },
];
export const areaName = (a) => AREAS.find((x) => x.id === a)?.name || a;
export const areaBase = (a) => AREAS.find((x) => x.id === a)?.base ?? 0;

// Libellé d'une table = préfixe + numéro (ex. "T1", "VIP2"). '—' si vide.
export function tableLabel(el) {
  if (!el) return '—';
  const s = `${el.prefix || ''}${el.number || ''}`.trim();
  return s || '—';
}

export function productById(id) {
  return state.products.find((p) => p.id === id);
}
export function categoryName(id) {
  return state.categories.find((c) => c.id === id)?.name || id;
}

// CA des notes ouvertes sur une zone (ou toutes).
export function liveRevenue(area = null) {
  return state.orders
    .filter((o) => o.status === 'open' && (!area || o.area === area))
    .reduce((s, o) => s + orderTotal(o), 0);
}
