// mobile/mfloor.js — la salle sur téléphone : une liste de tables plutôt que le plan.
//
// Un plan de bar dessiné en paysage, réduit dans un écran 9/16, donne des
// tables de 30 px : illisible et intouchable. En liste, le serveur voit d'un
// coup d'œil ce qui est à encaisser et ce qui traîne, et la cible fait toute
// la largeur. Le plan reste accessible d'un onglet, pour se repérer.
import {
  state, money, tableLabel, areaName, AREAS,
  openOrdersForTable, tableTotal, tableStatus, liveRevenue,
} from '../state.js';
import { h, clear } from '../ui.js';
import { isTableType, TYPE_MAP } from '../elements.js';
import { renderFloor } from '../floorplan.js';
import { openMOrder } from './morder.js';

let mode = 'list';           // 'list' | 'plan'
let area = 'all';            // 'all' | id de zone
let busyOnly = false;

// La liste doit se redessiner à chaque changement de note ; le plan, lui, se
// met à jour finement tout seul (floorplan.js). app.js s'en sert pour trancher.
export const isListMode = () => mode === 'list';

const RANK = { encaisser: 0, occupee: 1, libre: 2 };
const STATUS_LABEL = { encaisser: 'à encaisser', occupee: 'occupée', libre: 'libre' };

export function renderMFloor(container) {
  clear(container);
  if (mode === 'plan') return renderPlan(container);

  container.append(topBar(container));

  const list = h('div', { class: 'm-tables' });
  container.append(list);

  const tables = sortedTables();
  if (!tables.length) {
    list.append(h('div', { class: 'm-empty' },
      h('div', { class: 'big' }, busyOnly ? 'Aucune table occupée' : 'Aucune table'),
      h('div', { class: 'muted' }, busyOnly ? 'Décoche « occupées » pour toutes les voir.' : 'Ajoute des tables depuis le plan, sur l\'iPad.')));
    return;
  }
  tables.forEach((t) => list.append(row(t)));
}

// ── Barre du haut : zones, filtre, bascule plan ──────────────
function topBar(container) {
  const busy = state.layout.filter((e) => isTableType(e.type) && tableStatus(e.id) !== 'libre').length;

  return h('div', { class: 'viewbar m-floorbar' },
    h('div', { class: 'm-floorbar-top' },
      h('h2', {}, 'Salle'),
      h('div', { class: 'spacer' }),
      h('div', { class: 'm-floorsum' },
        h('span', { class: 'n' }, `${busy}`), ' occupée(s) · ',
        h('span', { class: 'n' }, money(liveRevenue()))),
    ),
    h('div', { class: 'm-chips' },
      h('button', { class: `chip ${area === 'all' ? 'active' : ''}`, onclick: () => { area = 'all'; renderMFloor(container); } }, 'Toutes'),
      AREAS.map((a) => h('button', { class: `chip ${area === a.id ? 'active' : ''}`, onclick: () => { area = a.id; renderMFloor(container); } }, a.name)),
    ),
    h('div', { class: 'm-chips' },
      h('button', { class: `chip ${busyOnly ? 'active' : ''}`, onclick: () => { busyOnly = !busyOnly; renderMFloor(container); } }, busyOnly ? '✓ Occupées' : 'Occupées'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'chip', onclick: () => { mode = 'plan'; renderMFloor(container); } }, '🗺 Plan'),
    ),
  );
}

// ── Tri : ce qui demande une action d'abord ──────────────────
function sortedTables() {
  return state.layout
    .filter((e) => isTableType(e.type))
    .filter((e) => area === 'all' || e.area === area)
    .filter((e) => !busyOnly || tableStatus(e.id) !== 'libre')
    .map((e) => ({ el: e, status: tableStatus(e.id), notes: openOrdersForTable(e.id) }))
    .sort((a, b) => {
      const r = RANK[a.status] - RANK[b.status];
      if (r) return r;
      // À statut égal : la plus ancienne d'abord (c'est elle qui attend).
      const oa = oldest(a.notes), ob = oldest(b.notes);
      if (oa !== ob) return oa - ob;
      return (parseInt(a.el.number) || 0) - (parseInt(b.el.number) || 0);
    });
}

function oldest(notes) {
  return notes.length ? Math.min(...notes.map((o) => o.createdAt || 0)) : Infinity;
}

// ── Une ligne de table ───────────────────────────────────────
function row({ el, status, notes }) {
  const total = tableTotal(el.id);
  const age = ageText(oldest(notes));
  const kind = TYPE_MAP[el.type]?.label || 'Table';

  return h('button', { class: `m-table ${status}`, onclick: () => openMOrder(el.id) },
    h('span', { class: 'm-table-dot' }),
    h('div', { class: 'm-table-main' },
      h('div', { class: 'm-table-num' }, tableLabel(el)),
      h('div', { class: 'm-table-meta' },
        areaName(el.area), ' · ', kind,
        el.capacity ? ` · ${el.capacity} couv.` : '')),
    h('div', { class: 'm-table-side' },
      h('div', { class: 'm-table-amount' }, status === 'libre' ? '' : money(total)),
      h('div', { class: 'm-table-state' },
        STATUS_LABEL[status],
        notes.length > 1 ? ` · ${notes.length} notes` : '',
        age ? ` · ${age}` : '')),
  );
}

function ageText(ts) {
  if (!ts || ts === Infinity) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

// ── Plan (le vrai, celui de l'iPad) ──────────────────────────
// On le rend dans le même conteneur pour que floorplan.js garde son cycle de
// vie normal, et on glisse un retour « Liste » dans sa barre d'outils.
function renderPlan(container) {
  renderFloor(container);
  const bar = container.querySelector('.floor-bar');
  const back = h('button', { class: 'chip', onclick: () => { mode = 'list'; renderMFloor(container); } }, '☰ Liste');
  if (bar) bar.prepend(back); else container.prepend(back);
}
