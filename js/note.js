// note.js — opérations et dialogues d'une note, indépendants de la mise en page.
//
// L'écran iPad (order.js) et l'écran téléphone (mobile/morder.js) affichent la
// même note de deux façons très différentes, mais encaissent, transfèrent et
// envoient en cuisine exactement pareil : tout ce qui touche aux données vit
// ici, pour qu'une correction n'ait jamais à être faite deux fois.
import {
  state, emit, money, lineTotal, openOrdersForTable, productById, tableLabel, areaName,
} from './state.js';
import { h, clear, modal, field, toast, confirmDialog } from './ui.js';
import * as store from './store.js';
import { isTableType, TYPE_MAP } from './elements.js';
import { isCuisineProduct, isCuisineItem, pendingItems, pendingCount, sendToKitchen, printTicket } from './kitchen.js';
import { hasGroups, pickOptions, groupsPicker, optionsKey } from './options.js';

// ── Lecture ──────────────────────────────────────────────────
export function tableEl(id) { return state.layout.find((e) => e.id === id); }

// Libellé de la place, tel qu'il apparaîtra sur le bon en cuisine.
export function placeLabel(el) {
  if (isTableType(el?.type)) return `Table ${tableLabel(el)}`;
  return TYPE_MAP[el?.type]?.label || 'Sur place';
}

export function orderSum(o) { return (o?.items || []).reduce((s, it) => s + lineTotal(it), 0); }

// ── Écriture ─────────────────────────────────────────────────
export async function saveOrder(order) {
  const id = await store.put('orders', order);
  if (order.id == null) order.id = id;
  const i = state.orders.findIndex((o) => o.id === order.id);
  if (i >= 0) state.orders[i] = order; else state.orders.push(order);
  emit('orders');
  return order;
}

export async function removeOrder(order) {
  await store.del('orders', order.id);
  state.orders = state.orders.filter((o) => o.id !== order.id);
  emit('orders');
}

export function newOrder(tableId) {
  const el = tableEl(tableId);
  return { tableId, area: el?.area || state.area, items: [], status: 'open', toPay: false, createdAt: Date.now(), paidAt: null };
}

// Renvoie la note en cours de la table, en la créant si elle n'existe pas.
export async function ensureOrder(tableId, current) {
  if (current) return current;
  const open = openOrdersForTable(tableId);
  if (open.length) return open[0];
  const o = newOrder(tableId);
  await saveOrder(o);
  return o;
}

export async function changeQty(order, item, delta) {
  item.qty = Math.max(0, (item.qty || 0) + delta);
  if (item.qty === 0) order.items = order.items.filter((x) => x !== item);
  await saveOrder(order);
}

// Fabrique une ligne de note à partir d'un produit + son format.
export function makeItem(product, variant, options = []) {
  const hhOn = state.settings.happyHour?.enabled && product.happyHour;
  return {
    productId: product.id, name: product.name, sub: product.sub,
    variantLabel: variant.label, price: variant.price,
    options, qty: 1, hh: !!hhOn, note: '',
    cuisine: isCuisineProduct(product), sent: 0,
  };
}

// Demande le format quand le produit en a plusieurs. `null` si annulé.
export async function pickVariant(product) {
  if (product.variants.length <= 1) return product.variants[0];
  return modal({
    title: product.name,
    body: h('div', { class: 'row' }, []),
    actions: [{ label: 'Annuler', value: null }],
    onMount: (card, close) => {
      const row = card.querySelector('.row');
      product.variants.forEach((v) => row.append(
        h('button', { class: 'btn btn-blue', onclick: () => close(v) }, `${v.label} · ${money(v.price)}`)));
    },
  });
}

// Ajoute un produit à une liste de lignes (note ou sélection du comptoir) :
// format, puis sous-choix si le produit en a. Deux lignes identiques fusionnent,
// deux sauces différentes restent deux lignes.
// Renvoie la ligne touchée, ou null si l'utilisateur a annulé en route.
export async function addProductToItems(items, product) {
  const variant = await pickVariant(product);
  if (!variant) return null;

  let options = [];
  if (hasGroups(product)) {
    options = await pickOptions(product);
    if (options === null) return null;
  }

  const key = optionsKey(options);
  const existing = items.find((it) =>
    it.productId === product.id && it.variantLabel === variant.label &&
    optionsKey(it.options) === key && !it.note);

  // Les options « libres » (l'ancienne liste plate) se règlent ligne par ligne :
  // pour ces produits-là on n'empile jamais, sinon on perdrait le réglage.
  if (existing && !(product.options || []).length) { existing.qty += 1; return existing; }

  const item = makeItem(product, variant, options);
  items.push(item);
  return item;
}

// Ajoute un produit à la note. Renvoie la ligne touchée, ou null si annulé.
export async function addProduct(order, product) {
  const item = await addProductToItems(order.items, product);
  if (!item) return null;
  await saveOrder(order);
  return item;
}

// ── Dialogue : édition d'une ligne ───────────────────────────
// Renvoie 'del' | 'save' | null. Les modifications sont déjà enregistrées.
export async function editLine(order, item) {
  const product = productById(item.productId);
  const variantSel = product && product.variants.length > 1
    ? h('select', { class: 'input' }, product.variants.map((v) =>
        h('option', { value: v.label, selected: v.label === item.variantLabel }, `${v.label} · ${money(v.price)}`)))
    : null;

  // Sous-choix du produit (sauces, cuisson…) : mêmes pastilles qu'à l'ajout.
  const picker = hasGroups(product) ? groupsPicker(product, item.options || []) : null;

  const optWrap = h('div', { class: 'opt-toggle' });
  const optState = new Map();
  (product?.options || []).forEach((o) => {
    const on = (item.options || []).some((x) => x.label === o.label);
    optState.set(o.label, on);
    const chip = h('button', { class: `chip ${on ? 'active' : ''}`, onclick: () => { const v = !optState.get(o.label); optState.set(o.label, v); chip.classList.toggle('active', v); } },
      o.delta ? `${o.label} (+${money(o.delta)})` : o.label);
    optWrap.append(chip);
  });
  const noteInput = h('input', { class: 'input', value: item.note || '', placeholder: 'ex. sans glace, bien frais' });
  const hhToggle = h('input', { type: 'checkbox', checked: !!item.hh });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    variantSel ? field('Format', variantSel) : null,
    picker ? picker.el : null,
    (product?.options?.length) ? field('Options', optWrap) : null,
    field('Commentaire', noteInput),
    product?.happyHour ? h('label', { class: 'switch' }, hhToggle, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Bluebird\'s Hour (1+1 offert)')) : null,
  );
  // On rouvre tant qu'un sous-choix obligatoire est vide : le dialogue garde son
  // état (le commentaire déjà tapé n'est pas perdu).
  let v;
  for (;;) {
    v = await modal({
      title: item.name, body,
      actions: [{ label: 'Retirer', kind: 'danger', value: 'del' }, { label: 'Fermer', value: null }, { label: 'Enregistrer', kind: 'primary', value: 'save' }],
    });
    if (v !== 'save' || !picker?.missing()) break;
    toast(`Choisis : ${picker.missing()}`);
  }

  if (v === 'del') { order.items = order.items.filter((x) => x !== item); await saveOrder(order); return 'del'; }
  if (v !== 'save') return null;
  if (variantSel) { const vv = product.variants.find((x) => x.label === variantSel.value); item.variantLabel = vv.label; item.price = vv.price; }
  item.options = [
    ...(picker ? picker.get() : []),
    ...(product?.options || []).filter((o) => optState.get(o.label)).map((o) => ({ label: o.label, delta: o.delta })),
  ];
  item.note = noteInput.value.trim();
  if (product?.happyHour) item.hh = hhToggle.checked;
  await saveOrder(order);
  return 'save';
}

// ── Cuisine ──────────────────────────────────────────────────
// Pastille d'état d'une ligne bouffe : rien, « en cuisine », ou le reste à envoyer.
export function cuisineMark(item) {
  if (!isCuisineItem(item)) return null;
  const sent = item.sent || 0;
  const rest = (item.qty || 0) - sent;
  if (sent > 0 && rest <= 0) return h('div', { class: 'k-sent' }, '🍳 en cuisine');
  if (sent > 0) return h('div', { class: 'k-sent partial' }, `🍳 ${sent} envoyé(s) · ${rest} à envoyer`);
  return h('div', { class: 'k-sent todo' }, '🍳 à envoyer');
}

// Envoie les quantités bouffe pas encore parties. La note reste ouverte : le
// serveur continue d'encaisser sur Clyo, l'envoi ne fait que prévenir la cuisine.
// Renvoie le bon créé, ou null s'il n'y avait rien à envoyer.
export async function sendOrder(order) {
  if (!order) return null;
  const ticket = await sendToKitchen(order, placeLabel(tableEl(order.tableId)));
  if (!ticket) return null;
  await saveOrder(order);   // enregistre les item.sent mis à jour
  return ticket;
}

export { pendingItems, pendingCount };

// ── Impression du bon de commande ────────────────────────────
// Imprime la note entière (boissons comprises), sans rien changer à son état :
// ni encaissement, ni envoi en cuisine. Renvoie le bon créé, ou null si vide.
export async function printOrder(order) {
  if (!order || !order.items?.length) return null;
  return printTicket(order.items, {
    orderId: order.id ?? null,
    tableId: order.tableId ?? null,
    place: placeLabel(tableEl(order.tableId)),
    area: order.area || null,
  });
}

// ── Encaissement et gestion de la note ───────────────────────
// Renvoie true si la note a été encaissée.
export async function payOrder(order) {
  if (!order || order.items.length === 0) return false;
  if (!(await confirmDialog(`Encaisser cette note (${money(orderSum(order))}) ?`, { okLabel: 'Encaisser' }))) return false;
  order.status = 'paid'; order.paidAt = Date.now(); order.toPay = false;
  await saveOrder(order);
  return true;
}

export async function toggleToPay(order) {
  order.toPay = !order.toPay;
  await saveOrder(order);
  return order.toPay;
}

// Renvoie true si la note a été supprimée.
export async function deleteOrder(order) {
  if (!(await confirmDialog('Supprimer définitivement cette note ?', { okLabel: 'Supprimer', danger: true }))) return false;
  await removeOrder(order);
  return true;
}

// Menu « ⋯ » d'une note. Renvoie l'action choisie sans l'exécuter :
// 'topay' | 'move' | 'del' | null. C'est l'écran appelant qui sait ce qu'il
// doit redessiner ou fermer ensuite.
export async function noteMenu(order) {
  if (!order) return null;
  let action = null;
  await modal({
    title: `Note · ${money(orderSum(order))}`,
    body: h('div', { class: 'modal-body', style: 'padding:0; gap:10px' },
      h('button', { class: 'btn', onclick: () => pick('topay') }, order.toPay ? 'Retirer « à encaisser »' : 'Marquer « à encaisser »'),
      h('button', { class: 'btn', onclick: () => pick('move') }, 'Transférer vers une autre table'),
      h('button', { class: 'btn btn-danger', onclick: () => pick('del') }, 'Supprimer la note')),
    actions: [{ label: 'Fermer', value: null }],
  });
  return action;

  function pick(a) {
    action = a;
    const layer = document.getElementById('modal-layer');
    layer.hidden = true; clear(layer);
  }
}

// Toutes les tables du plan, dans l'ordre de numérotation.
export function allTables(excludeId = null) {
  return state.layout
    .filter((e) => isTableType(e.type) && e.id !== excludeId)
    .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
}

// Choix d'une table dans une grille de tuiles. Renvoie la table ou null.
export async function pickTable(title = 'Choisir une table', excludeId = null) {
  const tables = allTables(excludeId);
  if (!tables.length) return null;
  let chosen = null;
  const grid = h('div', { class: 'tile-grid', style: '--cols:3; --rows:3; height:auto; min-height:200px' },
    tables.map((t) => h('button', { class: 'tile', onclick: () => pick(t) },
      h('div', { class: 'tt' }, `Table ${tableLabel(t)}`),
      h('div', { class: 'ts' }, areaName(t.area)))));
  await modal({ title, body: grid, actions: [{ label: 'Annuler', value: null }] });
  return chosen;

  function pick(t) {
    chosen = t;
    const layer = document.getElementById('modal-layer');
    layer.hidden = true; clear(layer);
  }
}

// Transfère la note vers une autre table. Renvoie la table d'arrivée ou null.
export async function moveOrder(order, fromTableId = null) {
  const t = await pickTable('Transférer vers…', fromTableId ?? order.tableId);
  if (!t) return null;
  order.tableId = t.id; order.area = t.area;
  await saveOrder(order);
  return t;
}
