// pos.js — utilitaires partagés des écrans à tuiles (Accueil + Commande).
import { h, clear } from './ui.js';

export const CAT_COLORS = {
  'cocktails': '#C9A24B', 'sans-alcool': '#5FA8A0', 'vins': '#9B5A6A',
  'spiritueux': '#C98A4B', 'bieres': '#D8A93F', 'softs': '#4F8AC7', 'snack': '#8AA15A',
};
export const catColor = (id) => CAT_COLORS[id] || '#4FA3C7';

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
