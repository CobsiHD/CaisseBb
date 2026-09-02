// mobile/mhome.js — le comptoir sur téléphone.
//
// Même principe que l'écran de commande : les touches occupent tout l'écran,
// la sélection en cours vit dans la feuille du bas. L'édition des tuiles et des
// familles reste réservée à l'iPad — au comptoir on compose, on n'administre pas.
import { state, money, lineUnit, lineTotal, tableLabel } from '../state.js';
import { h, clear, toast } from '../ui.js';
import { catColor } from '../pos.js';
import { addProductToItems, pickTable, saveOrder } from '../note.js';
import { pendingCount, sendSelectionToKitchen, printTicket } from '../kitchen.js';
import { visibleCategories } from '../profile.js';

let selection = [];
let nav = { level: 'cats', catId: null, sub: null };
let query = '';
let searchOn = false;
let tickOpen = false;

let rootEl = null, topEl = null, subEl = null, gridEl = null, tickEl = null;

export function renderMHome(container) {
  clear(container);
  topEl = h('div', { class: 'm-order-top flat' });
  subEl = h('div', { class: 'm-order-sub' });
  gridEl = h('div', { class: 'm-grid' });
  tickEl = h('div', { class: 'm-tick' });
  rootEl = h('div', { class: 'm-home' }, topEl, subEl, gridEl, tickEl);
  container.append(rootEl);
  renderTop(); renderSub(); renderGrid(); renderTick();
}

// ── En-tête ──────────────────────────────────────────────────
function renderTop() {
  clear(topEl).append(
    h('div', { class: 'm-order-ttl' },
      h('div', { class: 'm-order-name' }, 'Comptoir'),
      h('div', { class: 'm-order-sub2' }, 'Compose puis envoie vers une table')),
    h('button', { class: `m-iconbtn ${searchOn ? 'on' : ''}`, onclick: toggleSearch, 'aria-label': 'Rechercher' }, '🔍'),
  );
}

function toggleSearch() {
  searchOn = !searchOn;
  if (!searchOn) query = '';
  renderTop(); renderSub(); renderGrid();
}

// ── Barre secondaire ─────────────────────────────────────────
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
    subEl.append(h('div', { class: 'm-crumb' }, 'Touches et familles'));
    return;
  }

  const cat = state.categories.find((c) => c.id === nav.catId);
  const all = state.products.filter((p) => p.categoryId === nav.catId);
  const subs = [...new Set(all.map((p) => p.sub).filter(Boolean))];

  subEl.append(h('div', { class: 'm-chips' },
    h('button', { class: 'chip', onclick: () => { nav = { level: 'cats', catId: null, sub: null }; renderSub(); renderGrid(); } }, '‹ Retour'),
    subs.length > 1
      ? h('button', { class: `chip ${nav.sub == null ? 'active' : ''}`, onclick: () => { nav.sub = null; renderSub(); renderGrid(); } }, cat?.name || 'Tous')
      : h('span', { class: 'm-crumb' }, cat?.name || ''),
    subs.length > 1 ? subs.map((s) => h('button', { class: `chip ${nav.sub === s ? 'active' : ''}`, onclick: () => { nav.sub = s; renderSub(); renderGrid(); } }, s)) : null,
  ));
}

// ── Grille ───────────────────────────────────────────────────
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function renderGrid() {
  clear(gridEl);
  gridEl.scrollTop = 0;

  if (query.trim()) {
    const q = norm(query.trim());
    const list = state.products.filter((p) => norm(p.name).includes(q) || norm(p.sub).includes(q));
    if (!list.length) {
      gridEl.append(h('div', { class: 'm-empty' }, h('div', { class: 'big' }, 'Aucun produit')));
      return;
    }
    list.slice(0, 60).forEach((p) => gridEl.append(productTile(p)));
    return;
  }

  if (nav.level === 'products') {
    const all = state.products.filter((p) => p.categoryId === nav.catId);
    const list = nav.sub ? all.filter((p) => p.sub === nav.sub) : all;
    list.forEach((p) => gridEl.append(productTile(p)));
    return;
  }

  // Niveau d'accueil : les touches perso d'abord (elles sont là pour ça),
  // puis les familles.
  const tiles = [...state.tiles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  tiles.forEach((t) => gridEl.append(h('button', {
    class: 'tile custom-tile', style: `--c:${t.color || '#4FA3C7'}`,
    onclick: () => tapCustom(t),
  },
    h('div', { class: 'tt' }, t.label || 'Tuile'),
    h('div', { class: 'ts' }, t.productId ? 'Produit' : t.categoryId ? 'Famille' : ''))));

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

function productTile(p) {
  return h('button', {
    class: `tile prod-tile ${p.available === false ? 'unavail' : ''}`,
    style: `--c:${p.color || catColor(p.categoryId)}`,
    onclick: () => p.available !== false && addToSelection(p),
  },
    h('div', { class: 'tt' }, p.name),
    h('div', { class: 'tp' }, p.variants.map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · ')));
}

function tapCustom(t) {
  if (t.productId) {
    const p = state.products.find((x) => x.id === t.productId);
    if (p) addToSelection(p); else toast('Produit introuvable');
  } else if (t.categoryId) {
    nav = { level: 'products', catId: t.categoryId, sub: null };
    renderSub(); renderGrid();
  }
}

// ── Sélection ────────────────────────────────────────────────
// Format et sous-choix : même chemin que sur une note (note.js).
async function addToSelection(product) {
  const item = await addProductToItems(selection, product);
  if (!item) return;
  toast(`${product.name} ajouté`);
  renderTick();
  pulse();
}

function pulse() {
  const bar = tickEl?.querySelector('.m-tick-bar');
  if (!bar) return;
  bar.classList.remove('pulse');
  void bar.offsetWidth;
  bar.classList.add('pulse');
}

function renderTick() {
  const count = selection.reduce((s, it) => s + (it.qty || 0), 0);
  const total = selection.reduce((s, it) => s + lineTotal(it), 0);

  clear(tickEl);
  tickEl.classList.toggle('open', tickOpen);

  tickEl.append(h('button', { class: 'm-tick-bar', onclick: () => { tickOpen = !tickOpen; renderTick(); } },
    h('span', { class: 'm-tick-chev' }, tickOpen ? '⌄' : '⌃'),
    h('span', { class: 'm-tick-count' }, count ? `${count} art.` : 'Sélection vide'),
    h('span', { class: 'spacer' }),
    h('span', { class: 'm-tick-total' }, money(total))));

  const lines = h('div', { class: 'm-tick-lines' });
  if (!selection.length) {
    lines.append(h('div', { class: 'm-empty' },
      h('div', { class: 'big' }, 'Sélection vide'),
      h('div', { class: 'muted' }, 'Touche des produits au-dessus.')));
  } else {
    selection.forEach((item) => lines.append(h('div', { class: 'm-line' },
      h('div', { class: 'm-line-main' },
        h('div', { class: 'nm' }, item.name, item.variantLabel ? h('span', { class: 'vr' }, ' ' + item.variantLabel) : null),
        (item.options || []).length ? h('div', { class: 'opt' }, item.options.map((o) => o.label).join(' · ')) : null,
        item.hh ? h('div', { class: 'hh' }, '1+1 offert') : null),
      h('div', { class: 'm-line-side' },
        h('div', { class: 'price' }, money(lineTotal(item))),
        h('div', { class: 'faint' }, `${money(lineUnit(item))}/u`)),
      h('div', { class: 'qty' },
        h('button', { onclick: () => bump(item, -1) }, '−'),
        h('span', { class: 'n' }, item.qty),
        h('button', { onclick: () => bump(item, +1) }, '＋')))));
  }
  tickEl.append(lines);

  // `pendingCount` raisonne sur une note ; une sélection de comptoir en a la forme.
  const toSend = pendingCount({ items: selection });
  tickEl.append(h('div', { class: 'm-tick-foot' },
    toSend > 0
      ? h('button', { class: 'btn btn-send', onclick: sendKitchenBon }, `🖨 Bon de cuisine · ${toSend}`)
      : null,
    h('div', { class: 'total-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, money(total))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', style: 'flex:2', disabled: !selection.length, onclick: sendToTable }, 'Envoyer vers une table'),
      h('button', { class: 'btn', style: 'flex:1', disabled: !selection.length, onclick: printBon }, '🖨 Imprimer'),
      h('button', { class: 'btn btn-ghost', style: 'flex:0 0 88px', disabled: !selection.length, onclick: () => { selection = []; renderTick(); } }, 'Vider'))));
}

function bump(item, d) {
  item.qty = Math.max(0, item.qty + d);
  if (item.qty === 0) selection = selection.filter((x) => x !== item);
  renderTick();
}

// Imprime la sélection telle quelle, sans la vider (voir home.js).
async function printBon() {
  const ticket = await printTicket(selection, { place: 'Comptoir' });
  toast(ticket ? `Bon de commande #${ticket.num} envoyé à l'imprimante` : 'Sélection vide');
}

// Envoie la bouffe du comptoir en cuisine sans passer par une table (voir home.js).
async function sendKitchenBon() {
  const ticket = await sendSelectionToKitchen(selection, 'Comptoir');
  if (!ticket) { toast('Rien à envoyer en cuisine'); return; }
  toast(`Bon #${ticket.num} envoyé en cuisine`);
  renderTick();
}

async function sendToTable() {
  if (!selection.length) return;
  const t = await pickTable('Envoyer vers…');
  if (!t) { if (!state.layout.some((e) => e.number)) toast('Aucune table dans le plan'); return; }
  await saveOrder({
    tableId: t.id, area: t.area,
    items: selection.map((it) => ({ ...it })),
    status: 'open', toPay: false, createdAt: Date.now(), paidAt: null,
  });
  selection = [];
  tickOpen = false;
  renderTick();
  toast(`Envoyé vers la table ${tableLabel(t)}`);
}
