// dashboard.js — tableau de bord : le service en cours, puis les statistiques
// des notes encaissées (jour, semaine, mois, tout), calculées par stats.js.
import { state, money, orderTotal, tableStatus, tableLabel, areaName } from './state.js';
import { h, clear } from './ui.js';
import { isTableType } from './elements.js';
import { openNote } from './openorder.js';
import {
  PERIODES, periode, dans, resume, evolution, topProduits, parFamille, parZone, serie, parHeure, parJourDeSemaine,
} from './stats.js';

// La période regardée se garde d'un redessin à l'autre (une note encaissée sur
// un autre iPad redessine l'écran : on ne doit pas retomber sur « Jour »).
let type = 'jour';
let decalage = 0;

function ageText(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
function tableNumber(id) { return tableLabel(state.layout.find((e) => e.id === id)); }
function tableArea(id) { return state.layout.find((e) => e.id === id)?.area; }

const entier = new Intl.NumberFormat('fr-FR');
// Le sens est porté par la flèche : le nombre s'écrit sans signe.
const pct = (v) => `${Math.abs(Math.round(v))} %`;

export function renderDashboard(container) {
  clear(container);

  const p = periode(type, decalage);
  const notes = dans(state.orders, p);
  const r = resume(notes);
  const avant = type === 'tout' ? null : resume(dans(state.orders, periode(type, decalage - 1)));

  // ── Barre : la période ──
  container.append(h('div', { class: 'viewbar' },
    h('h2', {}, 'Tableau de bord'),
    h('div', { class: 'segment st-periodes' }, PERIODES.map(([id, label]) =>
      h('button', { class: `chip ${type === id ? 'active' : ''}`,
        onclick: () => { type = id; decalage = 0; renderDashboard(container); } }, label))),
    h('div', { class: 'spacer' }),
    type === 'tout' ? null : h('div', { class: 'st-nav' },
      h('button', { class: 'btn btn-sm', 'aria-label': 'Période précédente',
        onclick: () => { decalage--; renderDashboard(container); } }, '◀'),
      h('button', { class: 'btn btn-sm', 'aria-label': 'Période suivante', disabled: decalage >= 0,
        onclick: () => { decalage++; renderDashboard(container); } }, '▶')),
    h('div', { class: 'st-label' }, p.label)));

  const dash = h('div', { class: 'dash' });
  container.append(dash);

  // ── En ce moment (toujours le service en cours, quelle que soit la période) ──
  const open = state.orders.filter((o) => o.status === 'open' && o.items.length > 0);
  const occupied = new Set(open.map((o) => o.tableId)).size;
  const covers = state.layout
    .filter((e) => isTableType(e.type) && tableStatus(e.id) !== 'libre')
    .reduce((s, e) => s + (e.capacity || 0), 0);
  dash.append(
    h('h3', {}, 'En ce moment'),
    h('div', { class: 'cards st-live' },
      card('CA en cours', money(open.reduce((s, o) => s + orderTotal(o), 0))),
      card('Tables occupées', occupied),
      card('Couverts', covers),
      card('À encaisser', open.filter((o) => o.toPay).length)));

  // ── Chiffres clés de la période ──
  const evo = (cle) => (avant ? evolution(r[cle], avant[cle]) : null);
  dash.append(
    h('h3', {}, 'Encaissé'),
    h('div', { class: 'cards st-kpis' },
      card('Chiffre d’affaires', money(r.ca), evo('ca'), p.precedent),
      card('Notes encaissées', entier.format(r.notes), evo('notes'), p.precedent),
      card('Ticket moyen', money(r.moyen), evo('moyen'), p.precedent),
      card('Articles vendus', entier.format(r.articles), evo('articles'), p.precedent),
      card('Offert en 1 + 1', money(r.offerts)),
      card('Durée d’une note', r.duree ? `${Math.round(r.duree)} min` : '—')));

  if (!notes.length) {
    dash.append(h('div', { class: 'st-vide' },
      h('div', { class: 'big' }, 'Aucune note encaissée sur cette période'),
      h('div', { class: 'muted' }, type === 'tout' ? 'Les statistiques apparaîtront à la première note encaissée.'
        : 'Remonte avec ◀ ou change de période.')));
  } else {
    const s = serie(type, p, notes);
    const panneaux = h('div', { class: 'st-grid' },
      panneau(s.titre, colonnes(s.points), 'large'),
      panneau('Les plus vendus', classement(topProduits(notes), 'qte')),
      panneau('Par famille', classement(parFamille(notes, state.products, state.categories), 'ca', r.ca)),
      type === 'jour' ? null : panneau('Par heure de la soirée', colonnes(parHeure(notes))),
      type === 'jour' || type === 'semaine' ? null : panneau('Par jour de la semaine', colonnes(parJourDeSemaine(notes))),
      panneau('Par zone', classement(parZone(notes, areaName), 'ca', r.ca)));
    dash.append(panneaux);
  }

  // ── Notes en cours ──
  dash.append(h('h3', {}, 'Notes en cours'));
  if (open.length === 0) {
    dash.append(h('div', { class: 'empty muted' }, 'Aucune note ouverte. Touche une table dans « Salle » pour démarrer.'));
  } else {
    for (const o of [...open].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
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

  dash.append(h('div', { class: 'st-note faint' },
    'Les statistiques comptent les notes encaissées dans la caisse. Un bon imprimé au comptoir sans passer par une table n’y figure pas.'));
}

// Une tuile de chiffre, avec son évolution quand il y a de quoi comparer.
// La flèche double la couleur : le sens se lit sans elle.
function card(k, v, evo = null, ref = null) {
  return h('div', { class: 'card' },
    h('div', { class: 'k' }, k),
    h('div', { class: 'v' }, v),
    evo == null ? null : h('div', { class: `st-evo ${evo > 0 ? 'haut' : evo < 0 ? 'bas' : ''}` },
      `${evo > 0 ? '▲' : evo < 0 ? '▼' : '='} ${pct(evo)}`, h('span', { class: 'faint' }, ` vs ${ref}`)));
}

function panneau(titre, corps, taille = '') {
  return h('section', { class: `st-panel ${taille}` }, h('div', { class: 'st-panel-head' }, titre), corps);
}

// Colonnes : un chiffre dans le temps. Une seule série, donc une seule couleur
// et pas de légende. Toucher (ou survoler) une colonne lit sa valeur dans la
// ligne du dessus ; au repos elle annonce le total et la meilleure colonne.
function colonnes(points) {
  const max = Math.max(1, ...points.map((pt) => pt.ca));
  const total = points.reduce((s, pt) => s + pt.ca, 0);
  const meilleur = points.reduce((a, b) => (b.ca > a.ca ? b : a), points[0] || { ca: 0 });
  const repos = total ? `Meilleur : ${meilleur.long} · ${money(meilleur.ca)}` : 'Rien d’encaissé';
  const lecture = h('div', { class: 'st-lecture' }, repos);
  const dire = (pt) => { lecture.textContent = pt ? `${pt.long} · ${money(pt.ca)} · ${pt.notes} note${pt.notes > 1 ? 's' : ''}` : repos; };
  // Au-delà d'une quinzaine de colonnes (un mois), on n'étiquette plus tout.
  const pas = points.length > 16 ? Math.ceil(points.length / 10) : 1;

  const cols = h('div', { class: 'st-cols', role: 'img', 'aria-label': points.map((pt) => `${pt.long} ${money(pt.ca)}`).join(', ') },
    points.map((pt, i) => {
      const col = h('button', { class: `st-col ${pt === meilleur && pt.ca ? 'max' : ''}`, type: 'button', tabindex: -1,
        onpointerenter: () => dire(pt), onpointerleave: () => dire(null), onclick: () => dire(pt) },
        h('span', { class: 'st-col-zone' }, h('span', { class: 'st-bar', style: `height:${pt.ca ? Math.max(2, (pt.ca / max) * 100) : 0}%` })),
        h('span', { class: 'st-col-lbl' }, i % pas === 0 ? pt.label : ''));
      return col;
    }));
  return h('div', { class: 'st-chart' }, lecture, cols, tableau(points));
}

// Classement : une ligne par entrée, la barre à l'échelle de la première.
function classement(lignes, par, totalCa = 0) {
  if (!lignes.length) return h('div', { class: 'muted st-rien' }, 'Rien sur cette période.');
  const max = Math.max(1, ...lignes.map((l) => l[par]));
  return h('div', { class: 'st-rank' }, lignes.map((l) => h('div', { class: 'st-row' },
    h('div', { class: 'st-row-top' },
      h('span', { class: 'st-row-lbl' }, l.label),
      h('span', { class: 'st-row-val' }, par === 'qte' ? `${entier.format(l.qte)} · ${money(l.ca)}`
        : `${money(l.ca)}${totalCa ? ` · ${Math.round((l.ca / totalCa) * 100)} %` : ''}`)),
    h('div', { class: 'st-track' }, h('span', { class: 'st-fill', style: `width:${Math.max(1, (l[par] / max) * 100)}%` })))));
}

// Les mêmes chiffres en tableau, repliés : pour lire une valeur exacte.
function tableau(points) {
  return h('details', { class: 'st-table' },
    h('summary', {}, 'Voir les chiffres'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Chiffre'), h('th', {}, 'Notes'))),
      h('tbody', {}, points.filter((pt) => pt.ca || points.length <= 12).map((pt) =>
        h('tr', {}, h('td', {}, pt.long), h('td', {}, money(pt.ca)), h('td', {}, String(pt.notes)))))));
}
