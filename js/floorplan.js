// floorplan.js — plan de salle visuel (assets), fit-to-écran SANS scroll,
// modes Service / Édition (drag, resize, rotation, numéro), fond texturé.
import { state, on, money, tableStatus, tableTotal, AREAS, areaBase } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { TYPE_MAP, assetFor, isTableType, typesForArea } from './elements.js';
import { requirePin } from './app.js';
import { openNote } from './order.js';

const STAGE = { w: 1200, h: 760 };
const GRID = 10;
const snap = (v) => Math.round(v / GRID) * GRID;
const ASSET = (p) => `${p}.png`;

let selectedId = null;
let scale = 1;
let stageEl = null, fitEl = null;
let offOrders = null, offResize = null;
let clipboardEl = null;

export function renderFloor(container) {
  cleanup();
  selectedId = null;
  clear(container);

  stageEl = h('div', { class: `stage ${state.planMode} area-${state.area}` });
  stageEl.style.width = STAGE.w + 'px';
  stageEl.style.height = STAGE.h + 'px';
  fitEl = h('div', { class: 'stage-fit' }, stageEl);

  // Colonne flex qui remplit l'écran : zone plan (flex:1) + toolbar en bas → aucun scroll.
  // En édition, le plan partage la rangée avec le panneau d'éléments à droite.
  const main = h('div', { class: 'floor-main' }, fitEl);
  const view = h('div', { class: 'floor-view' }, main, buildViewbar(container));
  container.append(view);

  drawElements();
  if (state.planMode === 'edition') {
    main.append(buildPalette());
    fitEl.addEventListener('pointerdown', (e) => { if (e.target === fitEl || e.target === stageEl) { selectedId = null; drawElements(); } });
    document.addEventListener('keydown', onKey);
  }

  fit();
  offResize = () => fit();
  window.addEventListener('resize', offResize);
  offOrders = on('orders', () => { if (state.planMode === 'service') drawElements(); });
}

function cleanup() {
  if (offOrders) { offOrders(); offOrders = null; }
  if (offResize) { window.removeEventListener('resize', offResize); offResize = null; }
  document.removeEventListener('keydown', onKey);
}

// ── Raccourcis clavier (mode édition) : copier / coller / supprimer ──
function onKey(e) {
  if (state.planMode !== 'edition' || !stageEl || !stageEl.isConnected) return;
  const layer = document.getElementById('modal-layer');
  if (layer && !layer.hidden) return; // un dialogue est ouvert
  const tag = (e.target.tagName || '').toUpperCase();
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.isContentEditable) return;

  const mod = e.ctrlKey || e.metaKey;
  const sel = state.layout.find((x) => x.id === selectedId);
  const k = e.key.toLowerCase();

  if (mod && k === 'c') {
    if (sel) { const { id, ...rest } = sel; clipboardEl = rest; toast('Élément copié'); }
    e.preventDefault();
  } else if (mod && k === 'v') {
    if (clipboardEl) pasteElement(clipboardEl);
    e.preventDefault();
  } else if (mod && k === 'd') {
    if (sel) { const { id, ...rest } = sel; pasteElement(rest); }
    e.preventDefault();
  } else if (k === 'delete' || k === 'backspace') {
    if (sel) { e.preventDefault(); removeSelected(sel); }
  } else if (k === 'escape') {
    if (selectedId != null) { selectedId = null; drawElements(); }
  }
}

// Prochain numéro libre dans une zone, selon sa base (Extérieur 3XX, Arcade 2XX, Intérieur 1XX).
function nextTableNumber(area) {
  const base = areaBase(area);
  const nums = state.layout.filter((e) => e.area === area && isTableType(e.type))
    .map((e) => parseInt(e.number)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : base;
  return String(Math.max(max, base) + 1);
}

async function pasteElement(data) {
  const el = { ...data, area: state.area, x: snap((data.x || 0) + 24), y: snap((data.y || 0) + 24) };
  delete el.id;
  if (isTableType(el.type)) el.number = nextTableNumber(state.area);
  const id = await store.put('layout', el);
  el.id = id; state.layout.push(el); selectedId = id; drawElements();
  toast('Élément collé');
}

async function removeSelected(el) {
  await store.del('layout', el.id);
  state.layout = state.layout.filter((x) => x.id !== el.id);
  selectedId = null; drawElements(); toast('Élément supprimé');
}

function fit() {
  if (!fitEl) return;
  const pad = 24;
  const fw = fitEl.clientWidth - pad * 2;
  const fh = fitEl.clientHeight - pad * 2;
  scale = Math.max(0.2, Math.min(fw / STAGE.w, fh / STAGE.h));
  stageEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function buildViewbar(container) {
  const areaSeg = h('div', { class: 'segment' },
    AREAS.map((a) =>
      h('button', { class: `chip ${state.area === a.id ? 'active' : ''}`, onclick: () => { state.area = a.id; store.setSetting('activeArea', a.id); renderFloor(container); } },
        a.name)));

  const modeSeg = h('div', { class: 'segment' },
    [['service', 'Service'], ['edition', 'Édition']].map(([m, lbl]) =>
      h('button', { class: `chip ${state.planMode === m ? 'active' : ''}`, onclick: async () => {
        if (m === 'edition' && !(await requirePin('Édition du plan'))) return;
        state.planMode = m; renderFloor(container);
      } }, lbl)));

  const rev = money(state.orders.filter((o) => o.status === 'open' && o.area === state.area)
    .reduce((s, o) => s + (o.items || []).reduce((x, it) => x + it.price * (it.hh ? Math.ceil(it.qty / 2) : it.qty), 0), 0));

  return h('div', { class: 'viewbar floor-bar' }, areaSeg, modeSeg, h('div', { class: 'spacer' }),
    h('div', { style: 'text-align:right' }, h('div', { class: 'eyebrow' }, 'CA en cours'),
      h('div', { style: 'font-weight:800; font-variant-numeric:tabular-nums' }, rev)));
}

function areaElements() { return state.layout.filter((el) => el.area === state.area); }

function drawElements() {
  clear(stageEl);
  for (const el of areaElements()) stageEl.append(buildElement(el));
}

function buildElement(el) {
  const table = isTableType(el.type);
  const status = table ? tableStatus(el.id) : '';
  const asset = assetFor(el.type);
  const node = h('div', {
    class: `el ${table ? 'is-table ' + status : ''} ${asset ? 'has-img' : 'el-shape ' + el.type} ${selectedId === el.id ? 'selected' : ''}`,
    style: `left:${el.x}px; top:${el.y}px; width:${el.w}px; height:${el.h}px; transform:rotate(${el.rotation || 0}deg);`,
  });

  if (asset) node.append(h('img', { class: 'el-img', src: ASSET(asset), draggable: false, alt: '' }));
  else node.append(h('span', { class: 'shape-label' }, TYPE_MAP[el.type]?.label || el.type));

  if (table) {
    node.append(h('span', { class: 'el-num' }, ((el.prefix || '') + (el.number || '')) || '?'));
    const tot = tableTotal(el.id);
    if (tot > 0) node.append(h('span', { class: 'el-amount' }, money(tot)));
    node.append(h('span', { class: 'state-dot' }));
  }

  if (state.planMode === 'service') {
    if (table) node.addEventListener('click', () => openNote(el.id));
  } else {
    enableEdit(node, el);
    if (selectedId === el.id) addHandles(node, el);
  }
  return node;
}

// ── Édition : drag / sélection / tap ─────────────────────────
function enableEdit(node, el) {
  node.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('handle')) return;
    e.stopPropagation();
    node.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) moved = true;
      el.x = snap(ox + dx); el.y = snap(oy + dy);
      node.style.left = el.x + 'px'; node.style.top = el.y + 'px';
    };
    const up = async () => {
      node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up);
      if (moved) await store.put('layout', el);
      else if (selectedId === el.id) editElement(el);
      else { selectedId = el.id; drawElements(); }
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  });
}

function addHandles(node, el) {
  const hs = 26 / scale; // taille constante à l'écran
  const rs = h('div', { class: 'handle resize', style: `width:${hs}px;height:${hs}px;right:${-hs / 2}px;bottom:${-hs / 2}px` });
  rs.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); rs.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ow = el.w, oh = el.h, ratio = oh / ow;
    const move = (ev) => {
      const dw = (ev.clientX - sx) / scale;
      el.w = Math.max(28, snap(ow + dw));
      el.h = Math.max(20, snap((ow + dw) * ratio)); // garde le ratio de l'image
      node.style.width = el.w + 'px'; node.style.height = el.h + 'px';
    };
    const up = async () => { rs.removeEventListener('pointermove', move); rs.removeEventListener('pointerup', up); await store.put('layout', el); drawElements(); };
    rs.addEventListener('pointermove', move); rs.addEventListener('pointerup', up);
  });

  const rot = h('div', { class: 'handle rotate', style: `width:${hs}px;height:${hs}px;left:50%;top:${-hs - 18 / scale}px;margin-left:${-hs / 2}px` });
  rot.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); rot.setPointerCapture(e.pointerId);
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const move = (ev) => {
      let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      el.rotation = Math.round(deg / 5) * 5;
      node.style.transform = `rotate(${el.rotation}deg)`;
    };
    const up = async () => { rot.removeEventListener('pointermove', move); rot.removeEventListener('pointerup', up); await store.put('layout', el); };
    rot.addEventListener('pointermove', move); rot.addEventListener('pointerup', up);
  });

  const del = h('button', {
    class: 'handle del',
    style: `width:${hs}px;height:${hs}px;left:${-hs / 2}px;top:${-hs / 2}px;font-size:${hs * 0.5}px`,
    onclick: (e) => { e.stopPropagation(); deleteElement(el); },
  }, '✕');

  node.append(rs, rot, del);
}

async function deleteElement(el) {
  if (await confirmDialog('Supprimer cet élément du plan ?', { okLabel: 'Supprimer', danger: true })) {
    await store.del('layout', el.id);
    state.layout = state.layout.filter((x) => x.id !== el.id);
    selectedId = null; drawElements(); toast('Élément supprimé');
  }
}

async function editElement(el) {
  const table = isTableType(el.type);
  const prefInput = h('input', { class: 'input', value: el.prefix || '', placeholder: 'ex. T, B, VIP' });
  const numInput = h('input', { class: 'input', value: el.number || '', placeholder: 'ex. 12' });
  const capInput = h('input', { class: 'input', type: 'number', min: 0, value: el.capacity || 0 });
  const zoneInput = h('input', { class: 'input', value: el.zone || '', placeholder: 'ex. Terrasse rue' });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    table ? h('div', { class: 'row' }, field('Préfixe', prefInput), field('Numéro', numInput), field('Couverts', capInput)) : null,
    table ? h('div', { class: 'faint', style: 'font-size:13px; margin-top:-4px' }, `Affiché sur la table : « ${((prefInput.value || el.prefix || '') + (numInput.value || el.number || '')) || '?'} »`) : null,
    field('Zone (optionnel)', zoneInput),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-sm', onclick: () => quickRotate(el, -15) }, '⟲ −15°'),
      h('button', { class: 'btn btn-sm', onclick: () => quickRotate(el, 15) }, '⟳ +15°'),
      h('button', { class: 'btn btn-sm', onclick: () => duplicate(el) }, '⧉ Dupliquer')),
    table ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { const layer = document.getElementById('modal-layer'); layer.hidden = true; clear(layer); renumberArea(); } }, '↻ Renuméroter toutes les tables') : null,
  );
  const v = await modal({
    title: TYPE_MAP[el.type]?.label || 'Élément',
    body,
    actions: [{ label: 'Supprimer', kind: 'danger', value: 'del' }, { label: 'Fermer', value: 'close' }, { label: 'Enregistrer', kind: 'primary', value: 'save' }],
  });
  if (v === 'del') {
    await deleteElement(el);
  } else if (v === 'save') {
    if (table) { el.prefix = prefInput.value.trim(); el.number = numInput.value.trim(); el.capacity = Number(capInput.value) || 0; }
    el.zone = zoneInput.value.trim();
    await store.put('layout', el); drawElements();
  }
}

// Renumérote toutes les tables de la zone active dans l'ordre de lecture
// (haut→bas par rangées, puis gauche→droite), en conservant le préfixe.
async function renumberArea() {
  const tables = state.layout.filter((e) => e.area === state.area && isTableType(e.type))
    .sort((a, b) => (Math.round(a.y / 90) - Math.round(b.y / 90)) || (a.x - b.x));
  let n = areaBase(state.area) + 1;
  for (const t of tables) { t.number = String(n++); await store.put('layout', t); }
  drawElements();
  toast(`${tables.length} table(s) renumérotée(s)`);
}

async function quickRotate(el, d) {
  el.rotation = ((el.rotation || 0) + d) % 360;
  await store.put('layout', el); drawElements();
}
async function duplicate(el) {
  const layer = document.getElementById('modal-layer'); layer.hidden = true; clear(layer);
  const copy = { ...el, x: el.x + 30, y: el.y + 30 }; delete copy.id;
  const id = await store.put('layout', copy); copy.id = id;
  state.layout.push(copy); selectedId = id; drawElements();
}

// ── Panneau d'éléments latéral (mode édition), repliable ─────
let paletteCollapsed = false;

function buildPalette() {
  const panel = h('div', { class: `pal-side ${paletteCollapsed ? 'collapsed' : ''}` });
  const toggle = h('button', {
    class: 'icon-btn pal-collapse', title: paletteCollapsed ? 'Déplier' : 'Réduire',
    onclick: () => {
      paletteCollapsed = !paletteCollapsed;
      panel.classList.toggle('collapsed', paletteCollapsed);
      toggle.textContent = paletteCollapsed ? '‹' : '›';
      toggle.title = paletteCollapsed ? 'Déplier' : 'Réduire';
      requestAnimationFrame(fit); // la zone du plan change de largeur → on ré-adapte l'échelle
    },
  }, paletteCollapsed ? '‹' : '›');

  const types = typesForArea(state.area);
  const groups = [...new Set(types.map((t) => t.group))];
  const body = h('div', { class: 'pal-body' },
    groups.map((g) =>
      h('div', { class: 'pal-group' },
        h('div', { class: 'pal-title' }, g),
        h('div', { class: 'pal-items' },
          types.filter((t) => t.group === g).map((t) =>
            h('button', { class: 'pal-item', title: t.label, onclick: () => addElement(t) },
              h('img', { src: ASSET(t.img), draggable: false, alt: '' }),
              h('span', {}, t.label)))))));

  const foot = h('div', { class: 'pal-foot' },
    h('button', { class: 'btn btn-sm', style: 'width:100%', onclick: renumberArea }, '↻ Renuméroter les tables'));

  panel.append(h('div', { class: 'pal-head' }, toggle, h('span', { class: 'ttl' }, 'Éléments')), body, foot);
  return panel;
}

async function addElement(t) {
  const number = t.isTable ? nextTableNumber(state.area) : '';
  const el = {
    area: state.area, type: t.type,
    x: snap(STAGE.w / 2 - t.w / 2), y: snap(STAGE.h / 2 - t.h / 2),
    w: t.w, h: t.h, rotation: 0, number, capacity: t.capacity, zone: '',
  };
  const id = await store.put('layout', el);
  el.id = id; state.layout.push(el); selectedId = id; drawElements();
  toast(`${t.label} ajouté`);
}
