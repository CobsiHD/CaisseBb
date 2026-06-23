// dashboard.js — vue service : CA en cours, tables occupées, notes ouvertes.
import { state, money, orderTotal, tableStatus, tableLabel, areaName } from './state.js';
import { h, clear } from './ui.js';
import { isTableType } from './elements.js';
import { openNote } from './order.js';

function ageText(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
function tableNumber(id) { return tableLabel(state.layout.find((e) => e.id === id)); }
function tableArea(id) { return state.layout.find((e) => e.id === id)?.area; }

export function renderDashboard(container) {
  clear(container);
  const open = state.orders.filter((o) => o.status === 'open' && o.items.length > 0);
  const ca = open.reduce((s, o) => s + orderTotal(o), 0);
  const occupied = new Set(open.map((o) => o.tableId)).size;
  const toPay = open.filter((o) => o.toPay).length;
  const covers = state.layout
    .filter((e) => isTableType(e.type) && tableStatus(e.id) !== 'libre')
    .reduce((s, e) => s + (e.capacity || 0), 0);

  container.append(h('div', { class: 'viewbar' }, h('h2', {}, 'Tableau de bord')));

  const dash = h('div', { class: 'dash' },
    h('div', { class: 'cards' },
      card('CA en cours', money(ca)),
      card('Tables occupées', occupied),
      card('Couverts', covers),
      card('À encaisser', toPay),
    ),
    h('h3', {}, 'Notes en cours'),
  );

  if (open.length === 0) {
    dash.append(h('div', { class: 'empty muted' }, 'Aucune note ouverte. Touche une table dans « Salle » pour démarrer.'));
  } else {
    const rows = [...open].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const o of rows) {
      dash.append(h('div', { class: 'open-row', onclick: () => openNote(o.tableId) },
        h('div', { class: 'tn' }, tableNumber(o.tableId)),
        h('div', {},
          h('div', { style: 'font-weight:600' }, `${o.items.length} article(s)${o.toPay ? ' · à encaisser' : ''}`),
          h('div', { class: 'muted', style: 'font-size:13px' }, areaName(tableArea(o.tableId)))),
        h('div', { class: 'age' }, ageText(o.createdAt)),
        h('div', { style: 'font-weight:800; font-variant-numeric:tabular-nums' }, money(orderTotal(o))),
      ));
    }
  }
  container.append(dash);
}

function card(k, v) {
  return h('div', { class: 'card' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
}
