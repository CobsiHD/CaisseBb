// tutos-video.js — la page « Tutos » (ouverte depuis les Réglages) : une vidéo
// qui montre le geste, et à côté ses étapes à cocher au fur et à mesure.
//
// Les coches sont un pense-bête pour celui qui a les mains dans la friteuse :
// elles restent sur cet appareil (localStorage), ne se synchronisent pas et se
// remettent à zéro d'un bouton. Le suivi « c'est fait » se tient dans Ménage.
//
// Ajouter un tuto : déposer la vidéo dans assets/tutos/, puis ajouter une
// entrée à TUTOS. `t` est la seconde où l'étape commence dans la vidéo.
import { h, clear, toast } from './ui.js';

const e = (t, titre, detail, alerte = null) => ({ t, titre, detail, alerte });

export const TUTOS = [
  {
    id: 'friteuse',
    titre: 'Nettoyer la friteuse',
    src: 'assets/tutos/nettoyage-friteuse.mp4',
    poster: 'assets/tutos/nettoyage-friteuse.jpg',
    duree: '2 min 50',
    avant: ['Friteuse éteinte et huile froide', 'Mettre des gants'],
    etapes: [
      e(4, 'Retirer le couvercle et le panier', 'Les poser de côté : on les nettoie plus tard.'),
      e(12, 'Ouvrir la porte et le robinet de vidange', 'Porte en bas de la friteuse. L’huile coule dans le bac.'),
      e(20, 'Vider le plateau à résidus', 'Le sortir et jeter les résidus à la poubelle.', 'Pas dans le fût bleu : il est réservé à l’huile.'),
      e(26, 'Vider l’huile dans le fût bleu', 'Sortir le bac d’huile et le verser dans le fût.'),
      e(38, 'Placer la bassine sous le robinet', 'Elle récupère l’eau de rinçage.'),
      e(44, 'Rincer la cuve à l’eau', 'À la douchette, pour enlever le reste d’huile.'),
      e(58, 'Pulvériser le dégraissant', 'Toute la cuve, les bords et la résistance.'),
      e(70, 'Dégraisser couvercle et accessoires', 'Les poser sur la plaque et les pulvériser aussi.'),
      e(80, 'Frotter la cuve', 'Brosse et éponge, un premier passage.'),
      e(96, 'Remplir d’eau et allumer la friteuse', 'L’eau chaude décolle le gras.'),
      e(118, 'Frotter dans l’eau chaude', 'À la brosse, pour enlever un maximum de gras.'),
      e(128, 'Éteindre, vider et essuyer', 'Vider l’eau sale, puis essuyer cuve et plaque à l’éponge.'),
      e(140, 'Rinçage final', 'À la douchette, pour enlever tout le produit.'),
      e(148, 'Essuyer et faire briller', 'Chiffon microfibre sur toutes les surfaces.'),
      e(158, 'Remplir d’huile entre les 2 repères', 'Ni en dessous du repère bas, ni au-dessus du repère haut.',
        'Robinet de vidange fermé avant de verser. Les paniers peuvent être remis après.'),
    ],
  },
];

// ── Coches (propres à l'appareil) ────────────────────────────
const CLE = 'bb.tutos';
function lire() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}
function ecrire(v) {
  try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* navigation privée : les coches ne tiendront pas */ }
}

const minSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let choisi = TUTOS[0].id;

export function renderTutos(container) {
  clear(container);
  const tuto = TUTOS.find((x) => x.id === choisi) || TUTOS[0];
  const faites = new Set(lire()[tuto.id] || []);

  const video = h('video', {
    class: 'tu-video', src: tuto.src, poster: tuto.poster,
    controls: true, playsinline: true, preload: 'metadata',
  });
  video.addEventListener('error', () => {
    if (video.isConnected) toast('Vidéo indisponible : vérifie la connexion');
  });
  const aller = (t) => {
    video.currentTime = t;
    video.play().catch(() => {});
  };

  const compte = h('b', {});
  const barre = h('i', {});
  const raz = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => {
    faites.clear(); sauver();
    liste.querySelectorAll('.tu-step').forEach((el) => peindre(el, false));
  } }, 'Tout décocher');

  function sauver() {
    ecrire({ ...lire(), [tuto.id]: [...faites] });
    const n = faites.size, total = tuto.etapes.length;
    compte.textContent = n === total ? `${n} / ${total} · terminé ✓` : `${n} / ${total}`;
    barre.style.width = `${(n / total) * 100}%`;
    raz.disabled = n === 0;
  }
  function peindre(el, fait) {
    el.classList.toggle('fait', fait);
    const coche = el.querySelector('.tu-check');
    coche.setAttribute('aria-pressed', fait ? 'true' : 'false');
    coche.querySelector('.mg-box').textContent = fait ? '✓' : '';
  }

  const liste = h('div', { class: 'tu-steps' }, tuto.etapes.map((etape, i) => {
    const el = h('div', { class: 'tu-step' },
      h('button', { class: 'tu-check', type: 'button', onclick: () => {
        if (faites.has(i)) faites.delete(i); else faites.add(i);
        sauver(); peindre(el, faites.has(i));
      } },
        h('span', { class: 'mg-box' }),
        h('span', { class: 'tu-txt' },
          h('span', { class: 'tu-num' }, `Étape ${i + 1}`),
          h('span', { class: 'tu-titre' }, etape.titre),
          h('span', { class: 'tu-detail' }, etape.detail),
          etape.alerte ? h('span', { class: 'tu-alerte' }, etape.alerte) : null)),
      // À côté de la coche, pas dedans : revoir un passage ne coche rien.
      h('button', { class: 'tu-voir', type: 'button', 'aria-label': `Voir l’étape ${i + 1} dans la vidéo`,
        onclick: () => aller(etape.t) }, '▶ ', minSec(etape.t)));
    peindre(el, faites.has(i));
    return el;
  }));
  sauver();

  container.append(h('div', { class: 'tu-screen' },
    h('div', { class: 'viewbar' },
      h('h2', {}, 'Tutos'),
      h('div', { class: 'segment' }, TUTOS.map((x) => h('button', {
        class: `chip ${x.id === tuto.id ? 'active' : ''}`,
        onclick: () => { if (x.id !== choisi) { choisi = x.id; renderTutos(container); } },
      }, x.titre))),
      h('div', { class: 'spacer' }),
      h('div', { class: 'mg-total' },
        h('div', { class: 'mg-total-txt' }, h('span', { class: 'muted' }, 'Étapes cochées'), compte),
        h('div', { class: 'mg-bar' }, barre))),
    h('div', { class: 'tu-grid' },
      h('div', { class: 'tu-left' },
        video,
        h('div', { class: 'tu-avant' },
          h('b', {}, 'Avant de commencer'),
          h('ul', {}, tuto.avant.map((a) => h('li', {}, a)))),
        h('div', { class: 'faint tu-note' },
          `Vidéo de ${tuto.duree}, sans le son. Le bouton ▶ d’une étape lance la vidéo à cet endroit. `
          + 'Les coches restent sur cet appareil.')),
      h('div', { class: 'tu-right' },
        h('div', { class: 'tu-head' }, h('span', {}, `${tuto.etapes.length} étapes`), raz),
        liste))));
}
