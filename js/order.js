// order.js — écran de prise de commande plein écran (façon POS, sans scroll de page) :
// ticket à gauche, familles → produits en tuiles paginées à droite.
// Version iPad / paysage. L'équivalent téléphone vit dans mobile/morder.js ;
// toute la logique de note est partagée dans note.js.
import { state, money, lineUnit, lineTotal, lineBilledQty, openOrdersForTable, tableLabel } from './state.js';
import { h, clear, toast } from './ui.js';
import { catColor, paginate } from './pos.js';
import {
  tableEl, placeLabel, orderSum, saveOrder, newOrder, ensureOrder,
  changeQty, addProduct, editLine, cuisineMark, sendOrder, pendingCount, printOrder,
  payOrder, toggleToPay, deleteOrder, moveOrder, noteMenu,
} from './note.js';
import { visibleCategories } from './profile.js';

let activeTableId = null;
let activeOrderId = null;
let nav = { level: 'cats', catId: null, sub: null, page: 0 };
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
  nav = { level: 'cats', catId: null, sub: null, page: 0 };
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
  const toSend = pendingCount(order);
  leftEl.append(h('div', { class: 'ticket-foot' },
    toSend > 0
      ? h('button', { class: 'btn btn-send', onclick: () => doSend(order) },
          `🍳 Envoyer en cuisine · ${toSend}`)
      : null,
    h('div', { class: 'total-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, money(total))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', style: 'flex:2', disabled: !order || order.items.length === 0, onclick: () => doPay(order) }, 'Encaisser'),
      h('button', { class: 'btn', style: 'flex:1', disabled: !order || order.items.length === 0, onclick: () => doPrint(order) }, '🖨 Imprimer'),
      h('button', { class: 'btn btn-ghost', style: 'flex:0 0 52px', onclick: () => doNoteMenu(order) }, '⋯'),
    ),
  ));
}

function renderLine(order, item) {
  const opts = (item.options || []).map((o) => o.label).join(' · ');
  return h('div', { class: 'tk-line' },
    h('div', { onclick: () => doEditLine(order, item), style: 'cursor:pointer; min-width:0' },
      h('span', { class: 'nm' }, item.name),
      item.variantLabel ? h('span', { class: 'vr' }, '  ' + item.variantLabel) : null,
      opts ? h('div', { class: 'opt' }, opts) : null,
      item.note ? h('div', { class: 'vr' }, '“' + item.note + '”') : null,
      item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null,
      cuisineMark(item)),
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

async function doSend(order) {
  const ticket = await sendOrder(order);
  if (!ticket) return;
  toast(`Bon #${ticket.num} envoyé en cuisine`);
  renderTicket();
}

async function doPrint(order) {
  const ticket = await printOrder(order);
  toast(ticket ? `Bon de commande #${ticket.num} envoyé à l'imprimante` : 'Note vide');
}

// ── PANE DROITE : familles → produits (tuiles, pagination) ───
function renderRight() {
  clear(rightEl);
  if (nav.level === 'cats') renderCats();
  else renderProducts();
}

function renderCats() {
  rightEl.append(h('div', { class: 'pos-bar' },
    h('h3', {}, 'Familles'),
    h('div', { class: 'spacer' }),
    h('div', { class: 'muted' }, 'Touche une famille')));

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);

  const cats = visibleCategories().filter((c) => state.products.some((p) => p.categoryId === c.id));
  const tiles = cats.map((c) => {
    const count = state.products.filter((p) => p.categoryId === c.id && p.available !== false).length;
    return h('button', { class: 'tile cat-tile', style: `--c:${catColor(c.id)}`, onclick: () => { nav = { level: 'products', catId: c.id, sub: null, page: 0 }; renderRight(); } },
      h('span', { class: 'tcount' }, `${count}`),
      h('div', { class: 'tt' }, c.name));
  });
  paginate(grid, tiles, null, nav);
}

function renderProducts() {
  const cat = state.categories.find((c) => c.id === nav.catId);
  const all = state.products.filter((p) => p.categoryId === nav.catId);
  const subs = [...new Set(all.map((p) => p.sub).filter(Boolean))];

  const pager = h('div', { class: 'pos-pager' });
  const bar = h('div', { class: 'pos-bar' },
    h('button', { class: 'chip', onclick: () => { nav = { level: 'cats' }; renderRight(); } }, '‹ Familles'),
    h('h3', {}, cat?.name || ''),
    h('div', { class: 'spacer' }),
    pager,
  );
  rightEl.append(bar);

  if (subs.length > 1) {
    rightEl.append(h('div', { class: 'pos-subs' },
      h('button', { class: `chip ${nav.sub == null ? 'active' : ''}`, onclick: () => { nav.sub = null; nav.page = 0; renderRight(); } }, 'Tous'),
      subs.map((s) => h('button', { class: `chip ${nav.sub === s ? 'active' : ''}`, onclick: () => { nav.sub = s; nav.page = 0; renderRight(); } }, s)),
    ));
  }

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);

  const list = (nav.sub ? all.filter((p) => p.sub === nav.sub) : all);
  const tiles = list.map((p) => h('button', {
    class: `tile prod-tile ${p.available === false ? 'unavail' : ''}`, style: `--c:${p.color || catColor(nav.catId)}`,
    onclick: () => p.available !== false && quickAdd(p),
  },
    h('div', { class: 'tt' }, p.name),
    h('div', { class: 'tp' }, p.variants.map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · ')),
  ));
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
