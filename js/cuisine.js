// cuisine.js — écran de la cuisine du Bluebird : les bons envoyés depuis le 22.
//
// C'est le vrai filet de sécurité du dispositif : tant que cet écran affiche,
// le service tourne, même imprimante éteinte.
import { state, on } from './state.js';
import { h, clear, toast, confirmDialog } from './ui.js';
import {
  STATUS, hasCuisineLines, ticketsOfDay, kitchenTicketsOfDay, openTickets, setTicketStatus,
  armSound, soundArmed, printState, requestReprint,
} from './kitchen.js';

// 'ouverts' : ce qu'il reste à cuisiner — 'tous' : les bons avec de la bouffe
// depuis 6 h — 'impressions' : tous les bons imprimés, boissons comprises.
let filter = 'ouverts';
let tick = null;   // rafraîchit les durées sans redessiner la page

export function renderCuisine(container) {
  clear(container);
  stopTick();

  const armBtn = h('button', {
    class: `btn btn-sm ${soundArmed() ? 'btn-ghost' : 'btn-primary'}`,
    onclick: async () => {
      const ok = await armSound();
      toast(ok ? 'Son activé' : 'Son refusé par le navigateur');
      renderCuisine(container);
    },
  }, soundArmed() ? '🔔 Son activé' : '🔕 Activer le son');

  const seg = h('div', { class: 'segment' },
    [['ouverts', 'À faire'], ['tous', 'Tout le service'], ['impressions', 'Tous les bons']].map(([id, label]) =>
      h('button', {
        class: `chip ${filter === id ? 'active' : ''}`,
        onclick: () => { filter = id; renderCuisine(container); },
      }, label)));

  container.append(h('div', { class: 'viewbar' },
    h('h2', {}, 'Cuisine'),
    h('div', { class: 'spacer' }),
    armBtn,
    seg,
  ));

  if (!soundArmed()) {
    container.append(h('div', { class: 'cuisine-warn' },
      'Safari coupe le son tant qu\'on n\'a pas touché l\'écran, et à chaque rechargement. ',
      h('b', {}, 'Touche « Activer le son » en début de service'), ' pour être prévenu des nouveaux bons.'));
  }

  const list = filter === 'impressions' ? ticketsOfDay()
    : filter === 'tous' ? kitchenTicketsOfDay()
    : openTickets();
  const grid = h('div', { class: 'cuisine-grid' });

  if (!list.length) {
    grid.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, filter === 'impressions' ? 'Aucun bon imprimé' : 'Aucun bon en cours'),
      h('div', { class: 'muted' }, filter === 'impressions'
        ? 'Tous les bons imprimés du service, boissons comprises, sont listés ici.'
        : 'Les commandes imprimées depuis la salle et le comptoir arrivent ici.')));
  } else {
    // Les plus anciens d'abord : c'est l'ordre dans lequel il faut cuisiner.
    for (const t of list) grid.append(card(t, container));
  }
  container.append(grid);

  startTick(container);
}

function card(t, container) {
  const st = STATUS[t.status] || STATUS.nouveau;
  // Ni un bon de boissons seules ni une réimpression ne se cuisinent : ils
  // n'ont qu'une impression à suivre.
  const boissonsSeules = !hasCuisineLines(t) || !!t.reprint;

  // Un bon de commande porte deux blocs (boissons puis cuisine) : on répète
  // l'intitulé à chaque changement, comme sur le papier.
  const lines = h('div', { class: 'k-lines' });
  let section = null;
  for (const it of t.items || []) {
    if (it.section && it.section !== section) {
      section = it.section;
      lines.append(h('div', { class: 'k-section' }, section === 'cuisine' ? 'Cuisine' : 'Boissons'));
    }
    lines.append(h('div', { class: 'k-line' },
      h('span', { class: 'k-qty' }, `${it.qty}×`),
      h('div', { class: 'k-body' },
        h('div', { class: 'k-name' }, it.name, it.variantLabel ? h('span', { class: 'k-var' }, ' ' + it.variantLabel) : null),
        (it.options && it.options.length) ? h('div', { class: 'k-opt' }, it.options.join(' · ')) : null,
        it.note ? h('div', { class: 'k-note' }, '« ' + it.note + ' »') : null,
      )));
  }

  const actions = h('div', { class: 'k-actions' });
  if (boissonsSeules) {
    // Rien à cuisiner : ce bon ne suit aucun statut.
  } else if (st.next) {
    actions.append(h('button', {
      class: 'btn btn-primary', style: 'flex:2',
      onclick: async () => { await setTicketStatus(t, st.next); renderCuisine(container); },
    }, st.nextLabel));
  } else {
    actions.append(h('div', { class: 'muted', style: 'flex:2; text-align:center' }, 'Terminé'));
  }
  if (!boissonsSeules && t.status !== 'nouveau') {
    actions.append(h('button', {
      class: 'btn btn-ghost', style: 'flex:0 0 60px',
      title: 'Revenir en arrière',
      onclick: async () => {
        const prev = Object.keys(STATUS).find((k) => STATUS[k].next === t.status);
        if (prev) { await setTicketStatus(t, prev); renderCuisine(container); }
      },
    }, '↩'));
  }

  const prn = printState(t);

  return h('div', { class: `k-card ${boissonsSeules ? 'st-papier' : 'st-' + t.status}`, dataset: { created: String(t.createdAt) } },
    h('div', { class: 'k-head' },
      h('span', { class: 'k-num' }, `#${t.num}`),
      h('span', { class: 'k-place' }, t.place),
      t.from ? h('span', { class: 'k-from' }, t.from) : null,
      h('span', { class: 'spacer' }),
      h('span', { class: 'k-age' }, ageLabel(t.createdAt)),
    ),
    lines,
    h('div', { class: 'k-foot' },
      t.kind === 'addition'
        ? h('span', { class: 'k-badge papier' }, 'Addition')
        : t.reprint
        ? h('span', { class: 'k-badge papier' }, 'Réimpression')
        : boissonsSeules
          ? h('span', { class: 'k-badge papier' }, 'Boissons')
          : h('span', { class: `k-badge ${t.status}` }, st.label),
      h('span', { class: `k-print ${prn.cls}` }, prn.txt),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn btn-sm btn-ghost', title: 'Réimprimer ce bon',
        onclick: async () => { await requestReprint(t); toast('Réimpression demandée'); renderCuisine(container); },
      }, '🖨'),
    ),
    actions.children.length ? actions : null,
  );
}

const heure = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function ageLabel(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  return min < 1 ? "à l'instant" : `${min} min`;
}

// Les durées bougent toute seules ; inutile de reconstruire les cartes pour ça.
function startTick(container) {
  tick = setInterval(() => {
    if (!container.isConnected) return stopTick();
    // Un bon de boissons ne vieillit pas : rien n'attend en cuisine.
    container.querySelectorAll('.k-card:not(.st-papier)').forEach((el) => {
      const ts = Number(el.dataset.created);
      const age = el.querySelector('.k-age');
      if (age) age.textContent = ageLabel(ts);
      const min = (Date.now() - ts) / 60000;
      el.classList.toggle('warn', min >= 10 && min < 20);
      el.classList.toggle('late', min >= 20);
    });
  }, 15000);
}
function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
