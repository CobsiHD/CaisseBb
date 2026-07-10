// pos.js — utilitaires partagés des écrans à tuiles (Accueil + Commande).
import { h, clear } from './ui.js';
import { state } from './state.js';

export const CAT_COLORS = {
  'cocktails': '#C9A24B', 'sans-alcool': '#5FA8A0', 'vins': '#9B5A6A',
  'spiritueux': '#C98A4B', 'bieres': '#D8A93F', 'softs': '#4F8AC7', 'snack': '#8AA15A',
};
// Palette proposée dans les sélecteurs de couleur (édition des touches).
export const TILE_COLORS = ['#C9A24B', '#4FA3C7', '#5FA8A0', '#9B5A6A', '#C98A4B', '#8AA15A', '#B0566A', '#6E7BB8'];
// Couleur d'une famille : couleur choisie sur la famille, sinon défaut par id, sinon générique.
export const catColor = (id) =>
  state.categories.find((c) => c.id === id)?.color || CAT_COLORS[id] || '#4FA3C7';

// Sélecteur de couleur réutilisable : renvoie { el, get() }.
export function colorPicker(initial = '#4FA3C7') {
  let value = initial;
  const row = h('div', { class: 'opt-toggle' });
  TILE_COLORS.forEach((c) => {
    const dot = h('button', {
      class: `swatch ${c === value ? 'on' : ''}`, style: `background:${c}`,
      onclick: () => { value = c; row.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on')); dot.classList.add('on'); },
    });
    row.append(dot);
  });
  return { el: row, get: () => value };
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
