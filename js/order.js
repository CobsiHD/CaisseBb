// order.js — écran de prise de commande plein écran (façon POS, sans scroll de page) :
// ticket à gauche, familles → produits en tuiles paginées à droite.
import {
  state, emit, money, lineUnit, lineTotal, lineBilledQty,
  openOrdersForTable, productById, tableLabel, areaName,
} from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { isTableType, TYPE_MAP } from './elements.js';
import { catColor, paginate } from './pos.js';

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

// ── Données ──────────────────────────────────────────────────
function tableEl(id) { return state.layout.find((e) => e.id === id); }
function currentNotes() { return openOrdersForTable(activeTableId); }
function currentOrder() {
  const notes = currentNotes();
  return notes.find((o) => o.id === activeOrderId) || notes[0] || null;
}
function orderSum(o) { return (o.items || []).reduce((s, it) => s + lineTotal(it), 0); }

async function saveOrder(order) {
  const id = await store.put('orders', order);
  if (order.id == null) order.id = id;
  const i = state.orders.findIndex((o) => o.id === order.id);
  if (i >= 0) state.orders[i] = order; else state.orders.push(order);
  emit('orders');
}
async function removeOrder(order) {
  await store.del('orders', order.id);
  state.orders = state.orders.filter((o) => o.id !== order.id);
  emit('orders');
}
function newOrder(tableId) {
  const el = tableEl(tableId);
  return { tableId, area: el?.area || state.area, items: [], status: 'open', toPay: false, createdAt: Date.now(), paidAt: null };
}
async function ensureOrder() {
  let o = currentOrder();
  if (!o) { o = newOrder(activeTableId); await saveOrder(o); activeOrderId = o.id; }
  return o;
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
      h('div', { class: 't-num' }, isTableType(el?.type) ? `Table ${tableLabel(el)}` : (TYPE_MAP[el?.type]?.label || '')),
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
  leftEl.append(h('div', { class: 'ticket-foot' },
    h('div', { class: 'total-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, money(total))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', style: 'flex:2', disabled: !order || order.items.length === 0, onclick: () => payOrder(order) }, 'Encaisser'),
      h('button', { class: 'btn btn-ghost', style: 'flex:0 0 52px', onclick: () => noteMenu(order) }, '⋯'),
    ),
  ));
}

function renderLine(order, item) {
  const opts = (item.options || []).map((o) => o.label).join(' · ');
  return h('div', { class: 'tk-line' },
    h('div', { onclick: () => editLine(order, item), style: 'cursor:pointer; min-width:0' },
      h('span', { class: 'nm' }, item.name),
      item.variantLabel ? h('span', { class: 'vr' }, '  ' + item.variantLabel) : null,
      opts ? h('div', { class: 'opt' }, opts) : null,
      item.note ? h('div', { class: 'vr' }, '“' + item.note + '”') : null,
      item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null),
    h('div', { class: 'price' }, money(lineTotal(item))),
    h('div', { style: 'grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; margin-top:6px' },
      h('div', { class: 'qty' },
        h('button', { onclick: () => changeQty(order, item, -1) }, '−'),
        h('span', { class: 'n' }, item.qty),
        h('button', { onclick: () => changeQty(order, item, +1) }, '＋')),
      h('div', { class: 'faint', style: 'font-size:12px' }, item.hh ? `${lineBilledQty(item)} facturé(s)` : `${money(lineUnit(item))}/u`)),
  );
}

async function changeQty(order, item, delta) {
  item.qty = Math.max(0, (item.qty || 0) + delta);
  if (item.qty === 0) order.items = order.items.filter((x) => x !== item);
  await saveOrder(order);
  renderTicket();
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

  const cats = state.categories.filter((c) => state.products.some((p) => p.categoryId === c.id));
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
  const order = await ensureOrder();
  let variant = product.variants[0];
  if (product.variants.length > 1) {
    const chosen = await modal({
      title: product.name,
      body: h('div', { class: 'row' }, []),
      actions: [{ label: 'Annuler', value: null }],
      onMount: (card, close) => {
        const row = card.querySelector('.row');
        product.variants.forEach((v) => row.append(h('button', { class: 'btn btn-blue', onclick: () => close(v) }, `${v.label} · ${money(v.price)}`)));
      },
    });
    if (!chosen) return;
    variant = chosen;
  }
  const hhOn = state.settings.happyHour?.enabled && product.happyHour;
  const existing = order.items.find((it) => it.productId === product.id && it.variantLabel === variant.label && (!it.options || it.options.length === 0) && !it.note);
  if (existing && (!product.options || product.options.length === 0)) existing.qty += 1;
  else order.items.push({ productId: product.id, name: product.name, sub: product.sub, variantLabel: variant.label, price: variant.price, options: [], qty: 1, hh: !!hhOn, note: '' });
  await saveOrder(order);
  toast(`${product.name} ajouté`);
  renderTicket();
}

async function editLine(order, item) {
  const product = productById(item.productId);
  const variantSel = product && product.variants.length > 1
    ? h('select', { class: 'input' }, product.variants.map((v) => h('option', { value: v.label, selected: v.label === item.variantLabel }, `${v.label} · ${money(v.price)}`)))
    : null;

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
    (product?.options?.length) ? field('Options', optWrap) : null,
    field('Commentaire', noteInput),
    product?.happyHour ? h('label', { class: 'switch' }, hhToggle, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Bluebird\'s Hour (1+1 offert)')) : null,
  );
  const v = await modal({ title: item.name, body, actions: [{ label: 'Retirer', kind: 'danger', value: 'del' }, { label: 'Fermer', value: null }, { label: 'Enregistrer', kind: 'primary', value: 'save' }] });
  if (v === 'del') { order.items = order.items.filter((x) => x !== item); await saveOrder(order); renderTicket(); return; }
  if (v !== 'save') return;
  if (variantSel) { const vv = product.variants.find((x) => x.label === variantSel.value); item.variantLabel = vv.label; item.price = vv.price; }
  item.options = (product?.options || []).filter((o) => optState.get(o.label)).map((o) => ({ label: o.label, delta: o.delta }));
  item.note = noteInput.value.trim();
  if (product?.happyHour) item.hh = hhToggle.checked;
  await saveOrder(order);
  renderTicket();
}

function addNote() {
  const o = newOrder(activeTableId);
  saveOrder(o).then(() => { activeOrderId = o.id; renderTicket(); });
}

// ── Encaissement / menu de note ──────────────────────────────
async function payOrder(order) {
  if (!order || order.items.length === 0) return;
  if (!(await confirmDialog(`Encaisser cette note (${money(orderSum(order))}) ?`, { okLabel: 'Encaisser' }))) return;
  order.status = 'paid'; order.paidAt = Date.now(); order.toPay = false;
  await saveOrder(order);
  toast('Note encaissée');
  const remaining = currentNotes();
  if (remaining.length === 0) closeOrder();
  else { activeOrderId = remaining[0].id; renderTicket(); }
}

async function noteMenu(order) {
  if (!order) return;
  await modal({
    title: `Note · ${money(orderSum(order))}`,
    body: h('div', { class: 'modal-body', style: 'padding:0; gap:10px' },
      h('button', { class: 'btn', onclick: () => act('topay') }, order.toPay ? 'Retirer « à encaisser »' : 'Marquer « à encaisser »'),
      h('button', { class: 'btn', onclick: () => act('move') }, 'Transférer vers une autre table'),
      h('button', { class: 'btn btn-danger', onclick: () => act('del') }, 'Supprimer la note')),
    actions: [{ label: 'Fermer', value: null }],
  });
  function act(a) {
    const layer = document.getElementById('modal-layer'); layer.hidden = true; clear(layer);
    if (a === 'topay') toggleToPay(order);
    if (a === 'move') moveOrder(order);
    if (a === 'del') deleteOrder(order);
  }
}
async function toggleToPay(order) { order.toPay = !order.toPay; await saveOrder(order); renderTicket(); }
async function deleteOrder(order) {
  if (!(await confirmDialog('Supprimer définitivement cette note ?', { okLabel: 'Supprimer', danger: true }))) return;
  await removeOrder(order);
  const remaining = currentNotes();
  if (remaining.length === 0) closeOrder(); else { activeOrderId = remaining[0].id; renderTicket(); }
}
async function moveOrder(order) {
  const tables = state.layout.filter((e) => isTableType(e.type) && e.id !== activeTableId)
    .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
  const grid = h('div', { class: 'tile-grid', style: '--cols:3; --rows:3; height:auto; min-height:200px' },
    tables.map((t) => h('button', { class: 'tile', onclick: () => choose(t) },
      h('div', { class: 'tt' }, `Table ${tableLabel(t)}`),
      h('div', { class: 'ts' }, areaName(t.area)))));
  await modal({ title: 'Transférer vers…', body: grid, actions: [{ label: 'Annuler', value: null }] });
  async function choose(t) {
    const layer = document.getElementById('modal-layer'); layer.hidden = true; clear(layer);
    order.tableId = t.id; order.area = t.area; await saveOrder(order);
    toast(`Note transférée vers la table ${tableLabel(t)}`);
    const remaining = currentNotes();
    if (remaining.length === 0) closeOrder(); else { activeOrderId = remaining[0]?.id; renderTicket(); }
  }
}
