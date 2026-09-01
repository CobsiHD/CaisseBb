// mobile/morder.js — prise de commande sur téléphone.
//
// Une seule colonne : les produits occupent tout l'écran, la note vit dans une
// feuille du bas qui reste toujours visible en résumé (nb d'articles + total)
// et se déplie d'un doigt. Toute la logique est dans ../note.js — cet écran
// n'est qu'une mise en page.
import { state, money, lineUnit, lineTotal, lineBilledQty, openOrdersForTable, tableLabel } from '../state.js';
import { h, clear, toast } from '../ui.js';
import { catColor } from '../pos.js';
import {
  tableEl, placeLabel, orderSum, saveOrder, newOrder, ensureOrder,
  changeQty, addProduct, editLine, cuisineMark, sendOrder, pendingCount,
  payOrder, toggleToPay, deleteOrder, moveOrder, noteMenu,
} from '../note.js';
import { visibleCategories } from '../profile.js';

let tableId = null;
let activeOrderId = null;
let nav = { level: 'cats', catId: null, sub: null };
let query = '';
let searchOn = false;
let tickOpen = false;

let screenEl = null, topEl = null, subEl = null, gridEl = null, tickEl = null;

// ── Cycle de vie ─────────────────────────────────────────────
export function openMOrder(id) {
  tableId = id;
  activeOrderId = openOrdersForTable(id)[0]?.id ?? null;
  nav = { level: 'cats', catId: null, sub: null };
  query = ''; searchOn = false; tickOpen = false;

  topEl = h('header', { class: 'm-order-top' });
  subEl = h('div', { class: 'm-order-sub' });
  gridEl = h('div', { class: 'm-grid' });
  tickEl = h('div', { class: 'm-tick' });
  screenEl = h('div', { class: 'm-order' }, topEl, subEl, gridEl, tickEl);
  document.body.append(screenEl);

  renderAll();
}

export function closeMOrder() {
  if (screenEl) screenEl.remove();
  screenEl = topEl = subEl = gridEl = tickEl = null;
  tableId = null; activeOrderId = null;
}

function renderAll() { renderTop(); renderSub(); renderGrid(); renderTick(); }

// ── Données ──────────────────────────────────────────────────
function currentNotes() { return openOrdersForTable(tableId); }
function currentOrder() {
  const notes = currentNotes();
  return notes.find((o) => o.id === activeOrderId) || notes[0] || null;
}

// ── En-tête ──────────────────────────────────────────────────
function renderTop() {
  const el = tableEl(tableId);
  clear(topEl).append(
    h('button', { class: 'm-iconbtn', onclick: closeMOrder, 'aria-label': 'Retour à la salle' }, '‹'),
    h('div', { class: 'm-order-ttl' },
      h('div', { class: 'm-order-name' }, placeLabel(el)),
      h('div', { class: 'm-order-sub2' }, el?.capacity ? `${el.capacity} couverts` : (el?.zone || 'Note'))),
    h('button', { class: `m-iconbtn ${searchOn ? 'on' : ''}`, onclick: toggleSearch, 'aria-label': 'Rechercher' }, '🔍'),
  );
}

function toggleSearch() {
  searchOn = !searchOn;
  if (!searchOn) query = '';
  renderTop(); renderSub(); renderGrid();
}

// ── Barre secondaire : recherche, ou familles / sous-familles ─
function renderSub() {
  clear(subEl);

  if (searchOn) {
    const input = h('input', {
      class: 'input', type: 'search', placeholder: 'Chercher un produit…', value: query,
      oninput: (e) => { query = e.target.value; renderGrid(); },
    });
    subEl.append(input);
    setTimeout(() => input.focus(), 30);
    return;
  }

  if (nav.level === 'cats') {
    subEl.append(h('div', { class: 'm-crumb' }, 'Familles'));
    return;
  }

  const cat = state.categories.find((c) => c.id === nav.catId);
  const all = state.products.filter((p) => p.categoryId === nav.catId);
  const subs = [...new Set(all.map((p) => p.sub).filter(Boolean))];

  subEl.append(h('div', { class: 'm-chips' },
    h('button', { class: 'chip', onclick: () => { nav = { level: 'cats', catId: null, sub: null }; renderSub(); renderGrid(); } }, '‹ Familles'),
    subs.length > 1 ? h('button', { class: `chip ${nav.sub == null ? 'active' : ''}`, onclick: () => { nav.sub = null; renderSub(); renderGrid(); } }, cat?.name || 'Tous') : h('span', { class: 'm-crumb' }, cat?.name || ''),
    subs.length > 1 ? subs.map((s) => h('button', { class: `chip ${nav.sub === s ? 'active' : ''}`, onclick: () => { nav.sub = s; renderSub(); renderGrid(); } }, s)) : null,
  ));
}

// ── Grille de tuiles (2 colonnes, défilement) ────────────────
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function renderGrid() {
  clear(gridEl);
  gridEl.scrollTop = 0;

  if (query.trim()) return renderSearchResults();
  if (nav.level === 'cats') return renderCatTiles();
  renderProductTiles();
}

function renderSearchResults() {
  const q = norm(query.trim());
  const list = state.products.filter((p) => norm(p.name).includes(q) || norm(p.sub).includes(q));
  if (!list.length) {
    gridEl.append(h('div', { class: 'm-empty' }, h('div', { class: 'big' }, 'Aucun produit'), h('div', { class: 'muted' }, `Rien ne correspond à « ${query.trim()} ».`)));
    return;
  }
  list.slice(0, 60).forEach((p) => gridEl.append(productTile(p)));
}

function renderCatTiles() {
  const cats = visibleCategories().filter((c) => state.products.some((p) => p.categoryId === c.id));
  cats.forEach((c) => {
    const count = state.products.filter((p) => p.categoryId === c.id && p.available !== false).length;
    gridEl.append(h('button', {
      class: 'tile cat-tile', style: `--c:${catColor(c.id)}`,
      onclick: () => { nav = { level: 'products', catId: c.id, sub: null }; renderSub(); renderGrid(); },
    },
      h('span', { class: 'tcount' }, `${count}`),
      h('div', { class: 'tt' }, c.name)));
  });
}

function renderProductTiles() {
  const all = state.products.filter((p) => p.categoryId === nav.catId);
  const list = nav.sub ? all.filter((p) => p.sub === nav.sub) : all;
  if (!list.length) {
    gridEl.append(h('div', { class: 'm-empty' }, h('div', { class: 'big' }, 'Famille vide')));
    return;
  }
  list.forEach((p) => gridEl.append(productTile(p)));
}

function productTile(p) {
  return h('button', {
    class: `tile prod-tile ${p.available === false ? 'unavail' : ''}`,
    style: `--c:${p.color || catColor(p.categoryId)}`,
    onclick: () => p.available !== false && quickAdd(p),
  },
    h('div', { class: 'tt' }, p.name),
    h('div', { class: 'tp' }, p.variants.map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · ')));
}

async function quickAdd(product) {
  const order = await ensureOrder(tableId, currentOrder());
  activeOrderId = order.id;
  const item = await addProduct(order, product);
  if (!item) return;
  toast(`${product.name} ajouté`);
  renderTick();
  pulse();
}

// Retour visuel discret quand la note change sans que la feuille soit ouverte.
function pulse() {
  const bar = tickEl?.querySelector('.m-tick-bar');
  if (!bar) return;
  bar.classList.remove('pulse');
  void bar.offsetWidth;
  bar.classList.add('pulse');
}

// ── Feuille de note ──────────────────────────────────────────
function renderTick() {
  const notes = currentNotes();
  const order = currentOrder();
  if (order) activeOrderId = order.id;

  const count = (order?.items || []).reduce((s, it) => s + (it.qty || 0), 0);
  const total = orderSum(order);
  const toSend = pendingCount(order);

  clear(tickEl);
  tickEl.classList.toggle('open', tickOpen);

  tickEl.append(h('button', { class: 'm-tick-bar', onclick: () => { tickOpen = !tickOpen; renderTick(); } },
    h('span', { class: 'm-tick-chev' }, tickOpen ? '⌄' : '⌃'),
    h('span', { class: 'm-tick-count' }, count ? `${count} art.` : 'Note vide'),
    toSend > 0 ? h('span', { class: 'm-tick-dot', title: 'À envoyer en cuisine' }) : null,
    h('span', { class: 'spacer' }),
    h('span', { class: 'm-tick-total' }, money(total))));

  if (notes.length > 1 || (notes.length === 1 && count > 0)) {
    tickEl.append(h('div', { class: 'm-tick-notes' },
      notes.map((o, i) => h('button', {
        class: `chip ${o.id === activeOrderId ? 'active' : ''}`,
        onclick: () => { activeOrderId = o.id; renderTick(); },
      }, notes.length > 1 ? `Note ${i + 1} · ${money(orderSum(o))}` : `Note · ${money(orderSum(o))}`)),
      h('button', { class: 'chip', onclick: addNote }, '＋ Note')));
  }

  const lines = h('div', { class: 'm-tick-lines' });
  if (!order || order.items.length === 0) {
    lines.append(h('div', { class: 'm-empty' },
      h('div', { class: 'big' }, 'Note vide'),
      h('div', { class: 'muted' }, 'Touche un produit au-dessus.')));
  } else {
    order.items.forEach((item) => lines.append(renderLine(order, item)));
  }
  tickEl.append(lines);

  tickEl.append(h('div', { class: 'm-tick-foot' },
    toSend > 0 ? h('button', { class: 'btn btn-send', onclick: () => doSend(order) }, `🍳 Envoyer en cuisine · ${toSend}`) : null,
    h('div', { class: 'total-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, money(total))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', style: 'flex:2', disabled: !order || order.items.length === 0, onclick: () => doPay(order) }, 'Encaisser'),
      h('button', { class: 'btn btn-ghost', style: 'flex:0 0 56px', onclick: () => doNoteMenu(order) }, '⋯'))));
}

function renderLine(order, item) {
  const opts = (item.options || []).map((o) => o.label).join(' · ');
  return h('div', { class: 'm-line' },
    h('div', { class: 'm-line-main', onclick: () => doEditLine(order, item) },
      h('div', { class: 'nm' }, item.name, item.variantLabel ? h('span', { class: 'vr' }, ' ' + item.variantLabel) : null),
      opts ? h('div', { class: 'opt' }, opts) : null,
      item.note ? h('div', { class: 'vr' }, '“' + item.note + '”') : null,
      item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null,
      cuisineMark(item)),
    h('div', { class: 'm-line-side' },
      h('div', { class: 'price' }, money(lineTotal(item))),
      h('div', { class: 'faint' }, item.hh ? `${lineBilledQty(item)} facturé(s)` : `${money(lineUnit(item))}/u`)),
    h('div', { class: 'qty' },
      h('button', { onclick: () => doQty(order, item, -1) }, '−'),
      h('span', { class: 'n' }, item.qty),
      h('button', { onclick: () => doQty(order, item, +1) }, '＋')));
}

// ── Actions ──────────────────────────────────────────────────
async function doQty(order, item, delta) {
  await changeQty(order, item, delta);
  renderTick();
}

async function doEditLine(order, item) {
  const r = await editLine(order, item);
  if (r) renderTick();
}

async function doSend(order) {
  const ticket = await sendOrder(order);
  if (!ticket) return;
  toast(`Bon #${ticket.num} envoyé en cuisine`);
  renderTick();
}

function addNote() {
  const o = newOrder(tableId);
  saveOrder(o).then(() => { activeOrderId = o.id; renderTick(); });
}

async function doPay(order) {
  if (!(await payOrder(order))) return;
  toast('Note encaissée');
  afterNoteGone();
}

async function doNoteMenu(order) {
  const action = await noteMenu(order);
  if (action === 'topay') { await toggleToPay(order); renderTick(); }
  if (action === 'del') { if (await deleteOrder(order)) afterNoteGone(); }
  if (action === 'move') {
    const t = await moveOrder(order, tableId);
    if (t) { toast(`Note transférée vers la table ${tableLabel(t)}`); afterNoteGone(); }
  }
}

function afterNoteGone() {
  const remaining = currentNotes();
  if (remaining.length === 0) closeMOrder();
  else { activeOrderId = remaining[0].id; renderTick(); }
}
