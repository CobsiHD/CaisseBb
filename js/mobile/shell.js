// mobile/shell.js — coque de l'interface téléphone (portrait 9/16).
//
// L'iPad garde son écran paysage à deux colonnes ; le téléphone reçoit une
// interface à part : barre d'onglets en bas (à portée du pouce), une seule
// colonne, et les listes/tuiles qui défilent au lieu d'être paginées.
import { h, clear } from '../ui.js';

const UI_KEY = 'bb.ui';   // 'auto' | 'phone' | 'pad'

export function uiPref() {
  try { return localStorage.getItem(UI_KEY) || 'auto'; } catch { return 'auto'; }
}
export function setUiPref(v) {
  try { localStorage.setItem(UI_KEY, v); } catch {}
}

// Un téléphone, c'est ≤ 560 px de large en portrait. Les pads 9/16 (≥ 700 px)
// restent sur l'interface iPad par défaut ; le réglage manuel permet de les
// basculer ici si le personnel préfère.
export function isMobileUI() {
  const p = uiPref();
  if (p === 'phone') return true;
  if (p === 'pad') return false;
  return window.matchMedia('(max-width: 560px)').matches;
}

// ── Feuille du bas générique ─────────────────────────────────
// Utilisée pour les menus secondaires. Renvoie { close }.
export function sheet({ title, body, dismissible = true } = {}) {
  const panel = h('div', { class: 'm-sheet' },
    h('div', { class: 'm-sheet-grab' }),
    title ? h('div', { class: 'm-sheet-title' }, title) : null,
    h('div', { class: 'm-sheet-body' }, body));
  const layer = h('div', { class: 'm-sheet-layer' }, panel);
  document.body.append(layer);
  requestAnimationFrame(() => layer.classList.add('on'));

  const close = () => {
    layer.classList.remove('on');
    setTimeout(() => layer.remove(), 200);
  };
  if (dismissible) {
    layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
    panel.querySelector('.m-sheet-grab').addEventListener('click', close);
  }
  return { close, panel };
}

// ── Sélecteur d'interface ────────────────────────────────────
// Présent dans la feuille « Plus » du téléphone ET dans les Réglages (⚙), qui
// sont la seule porte d'entrée côté iPad : sans ça, passer en mode iPad
// depuis un téléphone serait irréversible.
const UI_MODES = [
  ['auto',  'Auto',      'selon la taille de l\'écran'],
  ['phone', 'Téléphone', 'une colonne, onglets en bas'],
  ['pad',   'iPad',      'deux colonnes, plan de salle'],
];

export function uiModeSelector() {
  const row = h('div', { class: 'm-seg' });
  UI_MODES.forEach(([v, label]) => row.append(h('button', {
    class: `chip ${uiPref() === v ? 'active' : ''}`,
    title: UI_MODES.find((m) => m[0] === v)[2],
    onclick: () => { setUiPref(v); location.reload(); },
  }, label)));
  return row;
}

// ── Barre d'onglets du bas ───────────────────────────────────
// 5 entrées maximum : au-delà les cibles deviennent trop étroites au pouce.
// Produits, Tableau de bord et Réglages passent par « Plus ».
const NAV = [
  { view: 'floor',   label: 'Salle',    icon: '🪑' },
  { view: 'home',    label: 'Comptoir', icon: '🍸' },
  { view: 'cuisine', label: 'Cuisine',  icon: '🍳' },
  { view: 'menu',    label: 'Carte',    icon: '📖' },
  { view: '__more',  label: 'Plus',     icon: '⋯'  },
];

const MORE = [
  { view: 'catalog',   label: 'Produits',       icon: '🏷' },
  { view: 'dashboard', label: 'Tableau de bord', icon: '📊' },
];

// `navigate` et `openSettings` sont injectés par app.js : la coque ne connaît
// pas le routeur, elle ne fait que l'appeler (pas d'import circulaire).
export function mountMobileShell({ navigate, openSettings }) {
  document.body.classList.add('mobile');

  const nav = document.getElementById('m-nav');
  clear(nav);
  nav.hidden = false;

  NAV.forEach((n) => {
    // Classe `tab` + data-view : navigate() et la pastille Cuisine de app.js
    // marquent l'onglet actif sans rien savoir de cette barre.
    const btn = h('button', {
      class: n.view === '__more' ? 'm-tab' : 'm-tab tab',
      dataset: n.view === '__more' ? {} : { view: n.view },
      onclick: () => (n.view === '__more' ? openMore({ navigate, openSettings }) : navigate(n.view)),
    },
      h('span', { class: 'm-tab-ico' }, n.icon),
      h('span', { class: 'm-tab-lbl' }, n.label));
    nav.append(btn);
  });
}

function openMore({ navigate, openSettings }) {
  const body = h('div', { class: 'm-more' });
  const s = sheet({ title: 'Plus', body });

  MORE.forEach((m) => body.append(
    h('button', { class: 'm-more-row', onclick: () => { s.close(); navigate(m.view); } },
      h('span', { class: 'm-more-ico' }, m.icon), h('span', {}, m.label), h('span', { class: 'm-more-chev' }, '›'))));

  body.append(h('button', { class: 'm-more-row', onclick: () => { s.close(); openSettings(); } },
    h('span', { class: 'm-more-ico' }, '⚙'), h('span', {}, 'Réglages'), h('span', { class: 'm-more-chev' }, '›')));

  body.append(h('div', { class: 'm-more-sep' }, 'Interface'));
  body.append(uiModeSelector());
}
