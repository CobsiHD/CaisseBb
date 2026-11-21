// pos.js — utilitaires partagés des écrans à tuiles (Accueil + Commande).
import { h, clear } from './ui.js';
import { state } from './state.js';

export const CAT_COLORS = {
  'cocktails': '#F0B94A', 'shooters': '#C9A8F2', 'vins': '#EC93A6',
  'spiritueux': '#F2986A', 'bieres': '#E8D27A', 'softs': '#8DB8F2', 'snack': '#5CC8A8',
  'evenement': '#E58FB8', 'halloween': '#F2913D', 'hiver': '#A9D4E8',
};
// Palette proposée dans les sélecteurs de couleur (édition des touches).
export const TILE_COLORS = ['#F0B94A', '#E8D27A', '#F2986A', '#EC93A6', '#C9A8F2', '#8DB8F2', '#A9D4E8', '#5CC8A8', '#B9D86E', '#3A404B'];
const DEFAUT = '#8DB8F2';
// Couleur d'une famille : couleur choisie sur la famille, sinon défaut par id, sinon générique.
export const catColor = (id) =>
  state.categories.find((c) => c.id === id)?.color || CAT_COLORS[id] || DEFAUT;

// Une tuile est un aplat de couleur : son texte doit rester lisible quelle que
// soit la teinte choisie (les couleurs sombres posées avant le changement de
// style comprises). Sombre sur clair, clair sur sombre.
function clair(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return true;
  const v = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3;
}
/** `style` d'une tuile colorée : sa couleur et celle de son texte. */
export const tileStyle = (color) => {
  const c = color || DEFAUT;
  return `--c:${c}; --ct:${clair(c) ? '#101216' : '#F2F3F5'}`;
};

// Sélecteur de couleur réutilisable : renvoie { el, get(), set(c) }.
export function colorPicker(initial = DEFAUT) {
  let value = initial;
  const row = h('div', { class: 'opt-toggle' });
  const paint = () => row.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === value));
  TILE_COLORS.forEach((c) => {
    row.append(h('button', { class: 'swatch', style: `background:${c}`, dataset: { c }, onclick: () => { value = c; paint(); } }));
  });
  paint();
  return { el: row, get: () => value, set: (c) => { value = c; paint(); } };
}

// Remplit une grille SANS scroll : calcule colonnes/lignes selon la place
// disponible et pagine. `pageState` = { page } (muté). `pager` = élément cible (ou null).
export function paginate(grid, tiles, pager, pageState) {
  requestAnimationFrame(() => {
    const w = grid.clientWidth, hgt = grid.clientHeight;
    const cols = Math.max(2, Math.min(6, Math.round((w || 700) / 215)));
    const rows = Math.max(2, Math.min(6, Math.floor((hgt || 480) / 120)));
    const pageSize = Math.max(1, cols * rows);
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);

    const pages = Math.max(1, Math.ceil(tiles.length / pageSize));
    if ((pageState.page || 0) >= pages) pageState.page = pages - 1;
    if (pageState.page < 0) pageState.page = 0;

    function fill() {
      clear(grid);
      const start = (pageState.page || 0) * pageSize;
      tiles.slice(start, start + pageSize).forEach((t) => grid.append(t));
      if (pager) {
        clear(pager);
        if (pages > 1) {
          pager.append(
            h('button', { class: 'btn btn-sm', disabled: pageState.page <= 0, onclick: () => { pageState.page--; fill(); } }, '◀'),
            h('span', { class: 'pg' }, `${pageState.page + 1}/${pages}`),
            h('button', { class: 'btn btn-sm', disabled: pageState.page >= pages - 1, onclick: () => { pageState.page++; fill(); } }, '▶'),
          );
        }
      }
    }
    fill();
  });
}
