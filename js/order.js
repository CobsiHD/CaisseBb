// order.js — écran de prise de commande plein écran (façon POS, sans scroll de page) :
// ticket à gauche, familles → produits en tuiles paginées à droite.
// Version iPad / paysage. L'équivalent téléphone vit dans mobile/morder.js ;
// toute la logique de note est partagée dans note.js.
import { state, money, lineUnit, lineTotal, lineBilledQty, openOrdersForTable, tableLabel } from './state.js';
import { h, clear, toast } from './ui.js';
import { catColor, paginate, tileStyle } from './pos.js';
import { familyProducts, enterFamily, productsIn, prodColor, productTileParts, groupPage, crumbs } from './rangement.js';
import { optionLabel } from './options.js';
import {
  tableEl, placeLabel, orderSum, saveOrder, newOrder, ensureOrder,
  changeQty, addProduct, editLine, printMark, printOrder, printOrderBill, printOrderExpense, unsentCount, hasCuisineLines,
  payOrder, toggleToPay, deleteOrder, moveOrder, noteMenu,
} from './note.js';
import { visibleCategories } from './profile.js';

let activeTableId = null;
let activeOrderId = null;
let nav = { level: 'cats', catId: null, group: null, page: 0 };
let screenEl = null, leftEl = null, rightEl = null;
let onResize = null;

// ── Cycle de vie de l'écran ──────────────────────────────────
function ensureScreen() {
  if (screenEl) return;
  leftEl = h('div', { class: 'ticket' });
  rightEl = h('div', { class: 'pos-right' });
  screenEl = h('div', { class: 'order-screen', hidden: true }, leftEl, rightEl);
  document.body.append(screenEl);
}

export function openNote(tableId) {
  ensureScreen();
  activeTableId = tableId;
  const open = openOrdersForTable(tableId);
  activeOrderId = open[0]?.id ?? null;
  nav = { level: 'cats', catId: null, group: null, page: 0 };
  screenEl.hidden = false;
  onResize = () => renderRight();
  window.addEventListener('resize', onResize);
  renderAll();
}
export function closeOrder() {
  if (screenEl) screenEl.hidden = true;
  if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  activeTableId = null; activeOrderId = null;
}

function renderAll() { renderTicket(); renderRight(); }

function currentNotes() { return openOrdersForTable(activeTableId); }
function currentOrder() {
  const notes = currentNotes();
  return notes.find((o) => o.id === activeOrderId) || notes[0] || null;
}

// ── TICKET (gauche) ──────────────────────────────────────────
function renderTicket() {
  const el = tableEl(activeTableId);
  const notes = currentNotes();
  const order = currentOrder();
  if (order) activeOrderId = order.id;
  clear(leftEl);

  leftEl.append(h('div', { class: 'ticket-head' },
    h('button', { class: 'icon-btn', onclick: closeOrder, 'aria-label': 'Retour à la salle' }, '‹'),
    h('div', {},
      h('div', { class: 't-num' }, placeLabel(el)),
      h('div', { class: 't-sub' }, el?.capacity ? `${el.capacity} couverts${el.zone ? ' · ' + el.zone : ''}` : (el?.zone || 'Note'))),
  ));

  leftEl.append(h('div', { class: 'ticket-notetabs' },
    notes.map((o, i) => h('button', { class: `chip ${o.id === activeOrderId ? 'active' : ''}`, onclick: () => { activeOrderId = o.id; renderTicket(); } },
      notes.length > 1 ? `Note ${i + 1} · ${money(orderSum(o))}` : `Note · ${money(orderSum(o))}`)),
    h('button', { class: 'chip', onclick: addNote }, '＋ Note'),
  ));

  const lines = h('div', { class: 'ticket-lines' });
  if (!order || order.items.length === 0) {
    lines.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, 'Note vide'), h('div', { class: 'muted' }, 'Touche un produit à droite.')));
  } else {
    for (const item of order.items) lines.append(renderLine(order, item));
  }
  leftEl.append(lines);

  const total = order ? orderSum(order) : 0;
  const empty = !order || order.items.length === 0;
  // Ce qui n'est pas encore parti sur un bon. Tout imprimé : le bouton passe en
  // réimpression, pour le jour où le papier bourre.
  const toPrint = unsentCount(order?.items);
  leftEl.append(h('div', { class: 'ticket-foot' },
    h('div', { class: 'row' },
      h('button', {
        class: `btn ${toPrint > 0 ? 'btn-send-inline' : ''}`, style: 'flex:1', disabled: empty,
        onclick: () => doPrint(order, toPrint === 0),
      }, toPrint > 0 ? `🖨 Imprimer · ${toPrint}` : '🖨 Réimprimer'),
      h('button', { class: 'btn btn-ghost', style: 'flex:0 0 52px', onclick: () => doNoteMenu(order) }, '⋯'),
    ),
    // Le geste principal porte le total : un seul endroit à regarder.
    h('button', { class: 'btn btn-pay', disabled: empty, onclick: () => doPay(order) },
      h('span', { class: 'lbl' }, 'Encaisser'), h('span', { class: 'val' }, money(total))),
  ));
}

function renderLine(order, item) {
  const opts = (item.options || []).map(optionLabel).join(' · ');
  return h('div', { class: 'tk-line' },
    h('div', { onclick: () => doEditLine(order, item), style: 'cursor:pointer; min-width:0' },
      h('span', { class: 'nm' }, item.name),
      item.variantLabel ? h('span', { class: 'vr' }, '  ' + item.variantLabel) : null,
      opts ? h('div', { class: 'opt' }, opts) : null,
      item.note ? h('div', { class: 'vr' }, '“' + item.note + '”') : null,
      item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null,
      printMark(item)),
    h('div', { class: 'price' }, money(lineTotal(item))),
    h('div', { style: 'grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; margin-top:6px' },
      h('div', { class: 'qty' },
        h('button', { onclick: () => doQty(order, item, -1) }, '−'),
        h('span', { class: 'n' }, item.qty),
        h('button', { onclick: () => doQty(order, item, +1) }, '＋')),
      h('div', { class: 'faint', style: 'font-size:12px' }, item.hh ? `${lineBilledQty(item)} facturé(s)` : `${money(lineUnit(item))}/u`)),
  );
}

async function doQty(order, item, delta) {
  await changeQty(order, item, delta);
  renderTicket();
}

async function doPrint(order, reprint) {
  const ticket = await printOrder(order, { reprint });
  if (!ticket) { toast('Rien à imprimer'); return; }
  toast(`Bon #${ticket.num} imprimé${hasCuisineLines(ticket) ? ' · cuisine prévenue' : ''}`);
  renderTicket();
}

// ── PANE DROITE : familles → produits (tuiles, pagination) ───
function renderRight() {
  clear(rightEl);
  if (nav.level === 'cats') renderCats();
  else if (nav.level === 'groups') renderGroups();
  else renderProducts();
}

const go = (n) => { nav = n; renderRight(); };

// La page des rangements d'une famille (Signature, Créations… Gin, Rhum…).
function renderGroups() {
  rightEl.append(h('div', { class: 'pos-bar' }, crumbs(nav, go), h('div', { class: 'spacer' })));
  rightEl.append(groupPage(nav.catId, (g) => go({ level: 'products', catId: nav.catId, group: g, page: 0 })));
}

function renderCats() {
  rightEl.append(h('div', { class: 'pos-bar' },
    h('h3', {}, 'Familles'),
    h('div', { class: 'spacer' }),
    h('div', { class: 'muted' }, 'Touche une famille')));

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);

  const cats = visibleCategories().filter((c) => familyProducts(c.id).length);
  const tiles = cats.map((c) => {
    const count = familyProducts(c.id).filter((p) => p.available !== false).length;
    return h('button', { class: 'tile cat-tile', style: tileStyle(catColor(c.id)), onclick: () => go(enterFamily(c.id)) },
      h('span', { class: 'tcount' }, `${count}`),
      h('div', { class: 'tt' }, c.name));
  });
  paginate(grid, tiles, null, nav);
}

function renderProducts() {
  const pager = h('div', { class: 'pos-pager' });
  rightEl.append(h('div', { class: 'pos-bar' }, crumbs(nav, go), h('div', { class: 'spacer' }), pager));

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);

  const tiles = productsIn(nav.catId, nav.group).map((p) => h('button', {
    class: `tile prod-tile ${p.available === false ? 'unavail' : ''}`, style: tileStyle(prodColor(p)),
    onclick: () => p.available !== false && quickAdd(p),
  }, productTileParts(p, nav.group, nav.catId, money)));
  paginate(grid, tiles, pager, nav);
}

// ── Ajout / configuration ────────────────────────────────────
async function quickAdd(product) {
  const order = await ensureOrder(activeTableId, currentOrder());
  activeOrderId = order.id;
  const item = await addProduct(order, product);
  if (!item) return;
  toast(`${product.name} ajouté`);
  renderTicket();
}

async function doEditLine(order, item) {
  const r = await editLine(order, item);
  if (r) renderTicket();
}

function addNote() {
  const o = newOrder(activeTableId);
  saveOrder(o).then(() => { activeOrderId = o.id; renderTicket(); });
}

// ── Encaissement / menu de note ──────────────────────────────
async function doPay(order) {
  if (!(await payOrder(order))) return;
  toast('Note encaissée');
  afterNoteGone();
}

async function doNoteMenu(order) {
  const action = await noteMenu(order);
  if (action === 'bill') {
    const t = await printOrderBill(order);
    toast(t ? `Addition ${placeLabel(tableEl(order.tableId))} envoyée à l'imprimante` : 'Note vide');
  }
  if (action === 'frais') {
    const t = await printOrderExpense(order);
    if (t) toast(`Note de frais ${placeLabel(tableEl(order.tableId))} envoyée à l'imprimante`);
  }
  if (action === 'topay') { await toggleToPay(order); renderTicket(); }
  if (action === 'del') { if (await deleteOrder(order)) afterNoteGone(); }
  if (action === 'move') {
    const t = await moveOrder(order, activeTableId);
    if (t) { toast(`Note transférée vers la table ${tableLabel(t)}`); afterNoteGone(); }
  }
}

// Après encaissement / suppression / transfert : on reste sur la table s'il
// reste une note ouverte, sinon on referme l'écran.
function afterNoteGone() {
  const remaining = currentNotes();
  if (remaining.length === 0) closeOrder();
  else { activeOrderId = remaining[0].id; renderTicket(); }
}
