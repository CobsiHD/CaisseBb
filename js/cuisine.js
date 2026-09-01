// cuisine.js — écran de la cuisine du Bluebird : les bons envoyés depuis le 22.
//
// C'est le vrai filet de sécurité du dispositif : tant que cet écran affiche,
// le service tourne, même imprimante éteinte.
import { state, on } from './state.js';
import { h, clear, toast, confirmDialog } from './ui.js';
import {
  STATUS, ticketsOfDay, openTickets, setTicketStatus,
  armSound, soundArmed, printState, requestReprint,
} from './kitchen.js';

let showDone = false;
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

  container.append(h('div', { class: 'viewbar' },
    h('h2', {}, 'Cuisine'),
    h('div', { class: 'spacer' }),
    armBtn,
    h('button', {
      class: `btn btn-sm ${showDone ? 'btn-blue' : 'btn-ghost'}`,
      onclick: () => { showDone = !showDone; renderCuisine(container); },
    }, showDone ? 'Masquer les servis' : 'Voir les servis'),
  ));

  if (!soundArmed()) {
    container.append(h('div', { class: 'cuisine-warn' },
      'Safari coupe le son tant qu\'on n\'a pas touché l\'écran, et à chaque rechargement. ',
      h('b', {}, 'Touche « Activer le son » en début de service'), ' pour être prévenu des nouveaux bons.'));
  }

  const list = showDone ? ticketsOfDay() : openTickets();
  const grid = h('div', { class: 'cuisine-grid' });

  if (!list.length) {
    grid.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, 'Aucun bon en cours'),
      h('div', { class: 'muted' }, 'Les commandes envoyées depuis le 22 arrivent ici.')));
  } else {
    // Les plus anciens d'abord : c'est l'ordre dans lequel il faut cuisiner.
    for (const t of list) grid.append(card(t, container));
  }
  container.append(grid);

  startTick(container);
}

function card(t, container) {
  const st = STATUS[t.status] || STATUS.nouveau;

  const lines = h('div', { class: 'k-lines' },
    (t.items || []).map((it) => h('div', { class: 'k-line' },
      h('span', { class: 'k-qty' }, `${it.qty}×`),
      h('div', { class: 'k-body' },
        h('div', { class: 'k-name' }, it.name, it.variantLabel ? h('span', { class: 'k-var' }, ' ' + it.variantLabel) : null),
        (it.options && it.options.length) ? h('div', { class: 'k-opt' }, it.options.join(' · ')) : null,
        it.note ? h('div', { class: 'k-note' }, '« ' + it.note + ' »') : null,
      ))));

  const actions = h('div', { class: 'k-actions' });
  if (st.next) {
    actions.append(h('button', {
      class: 'btn btn-primary', style: 'flex:2',
      onclick: async () => { await setTicketStatus(t, st.next); renderCuisine(container); },
    }, st.nextLabel));
  } else {
    actions.append(h('div', { class: 'muted', style: 'flex:2; text-align:center' }, 'Terminé'));
  }
  if (t.status !== 'nouveau') {
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

  return h('div', { class: `k-card st-${t.status}`, dataset: { created: String(t.createdAt) } },
    h('div', { class: 'k-head' },
      h('span', { class: 'k-num' }, `#${t.num}`),
      h('span', { class: 'k-place' }, t.place),
      h('span', { class: 'spacer' }),
      h('span', { class: 'k-age' }, ageLabel(t.createdAt)),
    ),
    lines,
    h('div', { class: 'k-foot' },
      h('span', { class: `k-badge ${t.status}` }, st.label),
      h('span', { class: `k-print ${prn.cls}` }, prn.txt),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn btn-sm btn-ghost', title: 'Réimprimer ce bon',
        onclick: async () => { await requestReprint(t); toast('Réimpression demandée'); renderCuisine(container); },
      }, '🖨'),
    ),
    actions,
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
    container.querySelectorAll('.k-card').forEach((el) => {
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
