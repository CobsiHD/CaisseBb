// home.js — écran d'accueil "comptoir" : dashboard de familles + tuiles perso,
// on compose une sélection de produits puis on l'envoie vers une table.
import { state, emit, money, lineUnit, lineTotal, reloadTiles, tableLabel, areaName } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { isTableType } from './elements.js';
import { catColor, paginate } from './pos.js';

let selection = [];
let nav = { level: 'cats', catId: null, sub: null, page: 0 };
let editMode = false;
let leftEl = null, rightEl = null;

export function renderHome(container) {
  clear(container);
  leftEl = h('div', { class: 'ticket' });
  rightEl = h('div', { class: 'pos-right' });
  container.append(h('div', { class: 'home-screen' }, leftEl, rightEl));
  renderSelection();
  renderRight();
}

// ── Sélection (gauche) ───────────────────────────────────────
function renderSelection() {
  clear(leftEl);
  leftEl.append(h('div', { class: 'ticket-head' },
    h('div', {}, h('div', { class: 't-num' }, 'Comptoir'), h('div', { class: 't-sub' }, 'Compose puis envoie vers une table'))));

  const lines = h('div', { class: 'ticket-lines' });
  if (selection.length === 0) lines.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, 'Sélection vide'), h('div', { class: 'muted' }, 'Touche des produits à droite.')));
  else selection.forEach((item) => lines.append(renderLine(item)));
  leftEl.append(lines);

  const total = selection.reduce((s, it) => s + lineTotal(it), 0);
  leftEl.append(h('div', { class: 'ticket-foot' },
    h('div', { class: 'total-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, money(total))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', style: 'flex:2', disabled: selection.length === 0, onclick: sendToTable }, 'Envoyer vers une table'),
      h('button', { class: 'btn btn-ghost', disabled: selection.length === 0, onclick: () => { selection = []; renderSelection(); } }, 'Vider')),
  ));
}

function renderLine(item) {
  return h('div', { class: 'tk-line' },
    h('div', { style: 'min-width:0' },
      h('span', { class: 'nm' }, item.name),
      item.variantLabel ? h('span', { class: 'vr' }, '  ' + item.variantLabel) : null,
      item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null),
    h('div', { class: 'price' }, money(lineTotal(item))),
    h('div', { style: 'grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; margin-top:6px' },
      h('div', { class: 'qty' },
        h('button', { onclick: () => bump(item, -1) }, '−'),
        h('span', { class: 'n' }, item.qty),
        h('button', { onclick: () => bump(item, +1) }, '＋')),
      h('div', { class: 'faint', style: 'font-size:12px' }, `${money(lineUnit(item))}/u`)),
  );
}
function bump(item, d) {
  item.qty = Math.max(0, item.qty + d);
  if (item.qty === 0) selection = selection.filter((x) => x !== item);
  renderSelection();
}

// ── Dashboard / produits (droite) ────────────────────────────
function renderRight() {
  clear(rightEl);
  if (nav.level === 'cats') renderCats(); else renderProducts();
}

function renderCats() {
  rightEl.append(h('div', { class: 'pos-bar' },
    h('h3', {}, 'Familles'),
    h('div', { class: 'spacer' }),
    h('button', { class: `chip ${editMode ? 'active' : ''}`, onclick: () => { editMode = !editMode; renderRight(); } }, editMode ? '✓ Terminer' : '✎ Édition')));

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);

  const tiles = [];
  for (const c of state.categories) {
    if (!state.products.some((p) => p.categoryId === c.id)) continue;
    const count = state.products.filter((p) => p.categoryId === c.id && p.available !== false).length;
    tiles.push(h('button', { class: 'tile cat-tile', style: `--c:${catColor(c.id)}`, onclick: () => { nav = { level: 'products', catId: c.id, sub: null, page: 0 }; renderRight(); } },
      h('span', { class: 'tcount' }, `${count}`), h('div', { class: 'tt' }, c.name)));
  }
  // tuiles personnalisées
  for (const t of state.tiles) {
    tiles.push(h('button', { class: 'tile custom-tile', style: `--c:${t.color || '#4FA3C7'}`, onclick: () => editMode ? editTile(t) : tapCustom(t) },
      editMode ? h('span', { class: 'tedit' }, '✎') : null,
      h('div', { class: 'tt' }, t.label || 'Tuile'),
      t.productId ? h('div', { class: 'ts' }, 'Produit') : t.categoryId ? h('div', { class: 'ts' }, 'Famille') : null));
  }
  if (editMode) tiles.push(h('button', { class: 'tile add-tile', onclick: () => editTile(null) }, h('div', { class: 'plus' }, '＋'), h('div', { class: 'ts' }, 'Nouvelle tuile')));

  paginate(grid, tiles, null, nav);
}

function renderProducts() {
  const cat = state.categories.find((c) => c.id === nav.catId);
  const all = state.products.filter((p) => p.categoryId === nav.catId);
  const subs = [...new Set(all.map((p) => p.sub).filter(Boolean))];
  const pager = h('div', { class: 'pos-pager' });

  rightEl.append(h('div', { class: 'pos-bar' },
    h('button', { class: 'chip', onclick: () => { nav = { level: 'cats' }; renderRight(); } }, '‹ Familles'),
    h('h3', {}, cat?.name || ''), h('div', { class: 'spacer' }), pager));

  if (subs.length > 1) rightEl.append(h('div', { class: 'pos-subs' },
    h('button', { class: `chip ${nav.sub == null ? 'active' : ''}`, onclick: () => { nav.sub = null; nav.page = 0; renderRight(); } }, 'Tous'),
    subs.map((s) => h('button', { class: `chip ${nav.sub === s ? 'active' : ''}`, onclick: () => { nav.sub = s; nav.page = 0; renderRight(); } }, s))));

  const grid = h('div', { class: 'tile-grid' });
  rightEl.append(grid);
  const list = nav.sub ? all.filter((p) => p.sub === nav.sub) : all;
  const tiles = list.map((p) => h('button', { class: `tile prod-tile ${p.available === false ? 'unavail' : ''}`, style: `--c:${catColor(nav.catId)}`, onclick: () => p.available !== false && addProduct(p) },
    h('div', { class: 'tt' }, p.name),
    h('div', { class: 'tp' }, p.variants.map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · '))));
  paginate(grid, tiles, pager, nav);
}

// ── Ajout produit à la sélection ─────────────────────────────
async function addProduct(product) {
  let variant = product.variants[0];
  if (product.variants.length > 1) {
    const chosen = await modal({
      title: product.name, body: h('div', { class: 'row' }, []),
      actions: [{ label: 'Annuler', value: null }],
      onMount: (card, close) => { const row = card.querySelector('.row'); product.variants.forEach((v) => row.append(h('button', { class: 'btn btn-blue', onclick: () => close(v) }, `${v.label} · ${money(v.price)}`))); },
    });
    if (!chosen) return; variant = chosen;
  }
  const hhOn = state.settings.happyHour?.enabled && product.happyHour;
  const ex = selection.find((it) => it.productId === product.id && it.variantLabel === variant.label && (!it.options || !it.options.length) && !it.note);
  if (ex && (!product.options || !product.options.length)) ex.qty += 1;
  else selection.push({ productId: product.id, name: product.name, sub: product.sub, variantLabel: variant.label, price: variant.price, options: [], qty: 1, hh: !!hhOn, note: '' });
  toast(`${product.name} ajouté`);
  renderSelection();
}

function tapCustom(t) {
  if (t.productId) { const p = state.products.find((x) => x.id === t.productId); if (p) addProduct(p); else toast('Produit introuvable'); }
  else if (t.categoryId) { nav = { level: 'products', catId: t.categoryId, sub: null, page: 0 }; renderRight(); }
}

// ── Envoi vers une table ─────────────────────────────────────
async function sendToTable() {
  if (selection.length === 0) return;
  const tables = state.layout.filter((e) => isTableType(e.type)).sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
  if (!tables.length) { toast('Aucune table dans le plan'); return; }
  const grid = h('div', { class: 'tile-grid', style: '--cols:3; --rows:3; height:auto; min-height:220px' },
    tables.map((t) => h('button', { class: 'tile', onclick: () => choose(t) },
      h('div', { class: 'tt' }, `Table ${tableLabel(t)}`), h('div', { class: 'ts' }, areaName(t.area)))));
  await modal({ title: 'Envoyer vers…', body: grid, actions: [{ label: 'Annuler', value: null }] });
  async function choose(t) {
    const layer = document.getElementById('modal-layer'); layer.hidden = true; clear(layer);
    const order = { tableId: t.id, area: t.area, items: selection.map((it) => ({ ...it })), status: 'open', toPay: false, createdAt: Date.now(), paidAt: null };
    const id = await store.put('orders', order); order.id = id;
    state.orders.push(order); emit('orders');
    selection = []; renderSelection();
    toast(`Envoyé vers la table ${tableLabel(t)}`);
  }
}

// ── Édition d'une tuile personnalisée ────────────────────────
const TILE_COLORS = ['#C9A24B', '#4FA3C7', '#5FA8A0', '#9B5A6A', '#C98A4B', '#8AA15A', '#B0566A', '#6E7BB8'];

async function editTile(tile) {
  const isNew = !tile;
  tile = tile || { label: '', color: '#4FA3C7', productId: null, categoryId: null };
  const label = h('input', { class: 'input', value: tile.label || '', placeholder: 'ex. Mojito, Pression 50cl…' });

  const colorRow = h('div', { class: 'opt-toggle' });
  let color = tile.color || '#4FA3C7';
  TILE_COLORS.forEach((c) => {
    const dot = h('button', { class: `swatch ${c === color ? 'on' : ''}`, style: `background:${c}`, onclick: () => { color = c; colorRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on')); dot.classList.add('on'); } });
    colorRow.append(dot);
  });

  // lien : aucun / produit / famille
  const linkSel = h('select', { class: 'input' },
    h('option', { value: '' }, '— Aucun (juste un libellé) —'),
    h('optgroup', { label: 'Familles' }, state.categories.map((c) => h('option', { value: 'cat:' + c.id, selected: tile.categoryId === c.id }, c.name))),
    h('optgroup', { label: 'Produits' }, state.products.map((p) => h('option', { value: 'prod:' + p.id, selected: tile.productId === p.id }, `${p.name}`))));

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    field('Libellé', label),
    field('Couleur', colorRow),
    field('Raccourci', linkSel));

  const actions = [{ label: 'Annuler', value: null }, { label: isNew ? 'Créer' : 'Enregistrer', kind: 'primary', value: 'save' }];
  if (!isNew) actions.unshift({ label: 'Supprimer', kind: 'danger', value: 'del' });
  const v = await modal({ title: isNew ? 'Nouvelle tuile' : 'Modifier la tuile', body, actions });

  if (v === 'del') { await store.del('tiles', tile.id); await reloadTiles(); renderRight(); toast('Tuile supprimée'); return; }
  if (v !== 'save') return;
  const link = linkSel.value;
  const obj = { ...tile, label: label.value.trim() || 'Tuile', color, productId: link.startsWith('prod:') ? link.slice(5) : null, categoryId: link.startsWith('cat:') ? link.slice(4) : null };
  if (isNew) { obj.order = state.tiles.length; await store.put('tiles', obj); }
  else await store.put('tiles', obj);
  await reloadTiles(); renderRight();
  toast(isNew ? 'Tuile créée' : 'Tuile enregistrée');
}
