// menage.js — le planning ménage & tâches du Bluebird, en liste à cocher.
//
// Source : « Planning ménage & tâches » (ouvert du mardi au samedi). Chaque
// jour a ses tâches propres, plus le tronc commun « tous les jours ».
//
// Report : une tâche du mardi pas cochée réapparaît le mercredi en tête de
// liste (« Reportée de mardi »), puis le jeudi… jusqu'à ce qu'elle soit faite
// ou que revienne son propre jour, où la nouvelle occurrence la remplace. Le
// samedi se reporte donc sur le mardi suivant. Les tâches « tous les jours »
// ne se reportent pas : elles sont de toute façon à refaire le lendemain.
//
// Une coche = une ligne de la table `menage`, d'id « tâche@échéance ». Une
// ligne par coche, et non une fiche par jour : la synchro applique le
// dernier-écrit-gagne par ligne, deux iPads qui cochent en même temps ne
// s'écrasent donc jamais. Décocher supprime la ligne.
import { state, reloadMenage } from './state.js';
import { h, clear, toast } from './ui.js';
import * as store from './store.js';

// Mise en service de la liste : rien d'antérieur n'est compté comme « pas
// fait », sinon toute la semaine d'avant tomberait en report au premier jour.
const DEBUT = '2026-11-21';

// ── Le planning ──────────────────────────────────────────────
// `quand` reprend le code couleur de la feuille : à l'ouverture (vert),
// pendant le service (par défaut), après le service (rouge).
// Les ids sont définitifs : ils servent de clé aux coches déjà enregistrées.
// On peut retoucher un libellé, jamais réutiliser un id pour une autre tâche.
const t = (id, label, quand = 'service') => ({ id, label, quand });

export const JOURS_MENAGE = [
  { dow: 2, nom: 'Mardi',
    taches: [
      t('ma-happy-hour', 'Changer l’happy hour'),
      t('ma-cocktail-moment', 'Changer le cocktail du moment'),
      t('ma-story', 'Story de la semaine'),
      t('ma-gaufre-frites', 'Gaufre + frites'),
      t('ma-station-ranger', 'Station cocktail : ranger / réorganiser les produits'),
    ],
    menage: [
      t('ma-etageres-expo', 'Étagères d’exposition / présentation + leurs miroirs'),
      t('ma-interieur-cuisine', 'Intérieur cuisine'),
      t('ma-verres-vin', 'Verres à vin (chiffon spécial)'),
      t('ma-pieds-interieur', 'Pieds tables et chaises intérieur'),
      t('ma-cuisson', 'Cuisine cuisson : récupérateur de graisse, étagère, meuble'),
      t('ma-lave-verre', 'Lave-verre entier', 'apres'),
    ] },
  { dow: 3, nom: 'Mercredi',
    taches: [
      t('me-peremption', 'Dates de péremption : tous les produits du bar sauf alcool, liqueur, purée, sirop'),
    ],
    menage: [
      t('me-poignees-portes', 'Poignées + portes de tout le bar'),
      t('me-zone-poubelle', 'Intérieurs + zone poubelle (poubelle bar)'),
      t('me-sous-caisse', 'Sous la caisse'),
      t('me-station-fond', 'Station cocktail : étagère + nettoyage en profondeur'),
      t('me-etageres-evier', 'Cuisine : étagère de l’évier + étagères du plan de travail'),
      t('me-etagere-cuisine', 'Étagère cuisine'),
      t('me-frigo-vin', 'Frigo à vin'),
      t('me-froid', 'Cuisine froid : grand frigo + frigos du plan de travail'),
      t('me-poubelle-cuisine', 'Cuisine : poubelle'),
    ] },
  { dow: 4, nom: 'Jeudi',
    taches: [],
    menage: [
      t('je-portes-separation', 'Portes de séparation du bar'),
      t('je-plancha', 'Plancha + plaque : nettoyage à fond'),
      t('je-frigo-evier', 'Cuisine : frigo de la zone évier'),
      t('je-tiroirs-frigos', 'Tiroirs des frigos (intérieur)'),
      t('je-frigo-reserve', 'Frigo réserve : nettoyer + ranger'),
      t('je-buanderie', 'Buanderie / stocks : zone machine à laver, étagère des stocks, ranger'),
    ] },
  { dow: 5, nom: 'Vendredi',
    taches: [
      t('ve-prepa-soiree', 'Préparation soirée : cocktails de la soirée'),
      t('ve-qr-caisse', 'Mettre à jour QR code + caisse'),
    ],
    menage: [
      t('ve-sous-eviers', 'Sous les éviers'),
      t('ve-derriere-cuisine', 'Derrière la cuisine'),
      t('ve-frigo-comptoir', 'Frigo côté comptoir (bouteilles) : intérieur'),
    ] },
  { dow: 6, nom: 'Samedi',
    taches: [
      t('sa-avis-google', 'Répondre aux avis Google'),
    ],
    menage: [
      t('sa-sol-reserve', 'Sol réserve + ranger'),
    ] },
];

export const QUOTIDIEN = {
  taches: [
    t('q-vinaigre', 'Faire tourner le lave-verre au vinaigre', 'ouverture'),
    t('q-temperatures', 'Températures : frigos alimentaires 0 à +4 °C · congélateurs ≤ −18 °C → fiche T° (refaire avant le service)', 'ouverture'),
    t('q-huile-tpm', 'Huile (si friture du jour) : test TPM avant service → fiche huiles', 'ouverture'),
    t('q-friteuses-filtre', 'Friteuses : filtrer l’huile + nettoyer le filtre'),
    t('q-denrees', 'Denrées : DLC + état, premier périmé = premier sorti ; étiqueter tout ce qui est ouvert/préparé (nom, date, DLC)'),
    t('q-snacks', 'Snacks : vérifier le jour — à J+4, à passer / offrir aux clients'),
    t('q-livraison', 'Livraison : contrôler (état, T°, DLC), garder le BL, ranger'),
    t('q-remplissage', 'Remplissage'),
    t('q-papier-toilette', 'Papier toilette : vérifier + réapprovisionner'),
    t('q-rangement', 'Chaque objet, produit et matériel à sa place'),
  ],
  menage: [
    t('q-tireuses', 'Tireuses'),
    t('q-partie-cocktail', 'Partie cocktail : shakers, doseurs, becs verseurs, pelle à glaçons'),
    t('q-evier-bar', 'Évier du bar'),
    t('q-surfaces', 'Toutes les surfaces'),
    t('q-tapis', 'Nettoyer TOUS les tapis + dessous des tapis de bar'),
    t('q-filtres', 'Lave-vaisselle / lave-verre : filtres'),
    t('q-reserve-bas', 'Réserve du bas'),
    t('q-vitre', 'Vitre + contour noir'),
    t('q-rosiers', 'Rosiers : entretenir + retirer les déchets'),
    t('q-cuisine', 'Cuisine : évier, plan de travail, plancha/plaque si utilisées, friteuses (retirer les résidus)', 'apres'),
    t('q-sols', 'Sols, poignées, poubelles vidées et fermées', 'apres'),
  ],
};

export const SI_BESOIN = [
  t('sb-snacks', 'Refaire les snacks / planches'),
  t('sb-congelateur', 'Sortir les snacks du congélateur'),
  t('sb-verres', 'Verres manquants'),
  t('sb-changer-huile', 'Changer l’huile dès TPM ≥ 25 % ou si elle fume, mousse ou sent mauvais : vidanger, nettoyer les cuves, huile usagée au bidon de collecte'),
  t('sb-angles', 'Angles de tout le bar'),
  t('sb-tetes-futs', 'Têtes de fûts'),
];

export const MENSUEL = {
  taches: [
    t('m-glacons', 'Machine à glaçons : filtre + désinfection (selon notice)'),
    t('m-huiles-usagees', 'Huiles usagées : faire enlever le bidon, garder le justificatif'),
  ],
  menage: [
    t('m-congelateurs', 'Congélateurs grand, moyen, petit : vider, dégivrer, nettoyer'),
    t('m-aeration-frigos', 'Aération des frigos + sous le frigo Red Bull'),
    t('m-grilles-frigos', 'Souffler les grilles des frigos'),
    t('m-pieds-exterieur', 'Pieds tables + chaises extérieur'),
    t('m-poussiere', 'Poussière : lampes comptoir, poteaux, enceintes, lampes, télés'),
    t('m-tuyaux', 'Tuyaux métalliques'),
    t('m-tireuses-fond', 'Tireuses : toutes les surfaces à fond'),
    t('m-chewing-gum', 'Chewing-gum'),
    t('m-vestiaire', 'Vestiaire · Mezzanine · Cave'),
  ],
};

const NORMES = [
  ['Températures', 'Frigos alimentaires 0 à +4 °C (préparations maison +3 °C, viande hachée +2 °C) · congélateurs ≤ −18 °C. Un frigo boissons seul peut être plus chaud.'],
  ['Huile de friture', 'Test TPM : < 20 % OK · 20–24 % à surveiller · ≥ 25 % changer (seuil légal). Cuisson ≤ 180 °C, jamais d’huile qui fume.'],
  ['Anomalie', 'Vérifier porte / thermostat, contrôler les produits, garder · transférer · jeter, et noter l’action sur la fiche.'],
  ['Glaçons & garnitures', 'Pelle dédiée (jamais les mains ni un verre), fruits lavés, garnitures servies jamais réutilisées.'],
  ['Hygiène', 'Mains lavées après toilettes, déchets, tâches sales et avant chaque préparation ; tenue propre.'],
  ['Preuves', 'Fiches T° + huiles, BL et factures, justificatifs huiles usagées : dans le classeur HACCP.'],
];

// ── Dates ────────────────────────────────────────────────────
// Tout se compte en « jours de service » écrits AAAA-MM-JJ : ils se comparent
// comme du texte et ne dépendent d'aucun fuseau.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Midi, et non minuit : ajouter des jours ne glisse alors jamais d'une date au
// changement d'heure.
const parse = (k) => { const [y, m, j] = k.split('-').map(Number); return new Date(y, m - 1, j, 12); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

/** Le jour de service : avant 6 h, la fermeture appartient encore à la veille. */
export function serviceDay(now = Date.now()) {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Mardi → samedi de la semaine de `ref` ; dimanche et lundi regardent la semaine écoulée. */
export function weekOf(ref) {
  const mardi = addDays(ref, -((ref.getDay() + 5) % 7));
  return [0, 1, 2, 3, 4].map((i) => addDays(mardi, i));
}

const jourDe = (d) => JOURS_MENAGE.find((j) => j.dow === d.getDay());
const tachesDe = (jour) => [...jour.taches, ...jour.menage];

// ── Modèle ───────────────────────────────────────────────────
const coches = () => new Map(state.menage.map((r) => [r.id, r]));
const cle = (task, echeance) => `${task.id}@${echeance}`;

/**
 * Les tâches reportées sur le jour `jourKey` : celles des six jours précédents
 * (donc chaque autre jour de la semaine une fois) qui n'étaient pas faites en
 * arrivant ce jour-là. Celles rattrapées ce jour-là ou après restent listées,
 * cochées : on voit ce qui a été rattrapé, et on peut le décocher.
 */
export function reportsDu(jourKey, done = coches()) {
  const jour = parse(jourKey);
  const out = [];
  for (let k = 6; k >= 1; k--) {
    const d = addDays(jour, -k);
    const def = jourDe(d);
    const echeance = ymd(d);
    if (!def || echeance < DEBUT) continue;
    for (const task of tachesDe(def)) {
      const row = done.get(cle(task, echeance));
      if (!row || row.doneOn >= jourKey) out.push({ task, echeance, tag: `Reportée de ${def.nom.toLowerCase()}` });
    }
  }
  return out;
}

/** Pastille de l'onglet : ce qui traîne des jours précédents et reste à faire aujourd'hui. */
export function menageEnRetard(now = Date.now()) {
  const done = coches();
  return reportsDu(ymd(serviceDay(now)), done).filter((r) => !done.has(cle(r.task, r.echeance))).length;
}

async function basculer(task, echeance) {
  const id = cle(task, echeance);
  try {
    if (state.menage.some((r) => r.id === id)) await store.del('menage', id);
    else await store.put('menage', { id, task: task.id, due: echeance, doneAt: Date.now(), doneOn: ymd(serviceDay()) });
  } catch (e) {
    console.warn('[ménage] coche non enregistrée', e);
    toast('Coche non enregistrée');
  }
  await reloadMenage();   // redessine l'écran (app.js écoute « menage »)
}

// ── Vue ──────────────────────────────────────────────────────
let choix = null;       // jour affiché (AAAA-MM-JJ) ou 'mois'
let choixDu = null;     // jour de service où ce choix a été fait
const defilement = {};  // position de chaque colonne, gardée d'un redessin à l'autre

const QUAND = { ouverture: 'À l’ouverture', apres: 'Après le service' };
const heure = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function quandFait(row, echeance) {
  if (!row) return null;
  if (echeance.length === 7) return `fait le ${parse(row.doneOn).getDate()} ${MOIS[parse(row.doneOn).getMonth()]}`;
  return row.doneOn === echeance ? `fait à ${heure(row.doneAt)}` : `fait ${JOURS[parse(row.doneOn).getDay()]}`;
}

function ligne({ task, echeance, tag }, done, { fige = false } = {}) {
  const row = done.get(cle(task, echeance));
  const btn = h('button', {
    class: `mg-row ${row ? 'fait' : ''} ${tag && !row ? 'retard' : ''}`,
    disabled: fige,
    'aria-pressed': row ? 'true' : 'false',
    onclick: async () => { btn.disabled = true; await basculer(task, echeance); },
  },
    h('span', { class: 'mg-box' }, row ? '✓' : ''),
    h('span', { class: 'mg-txt' },
      h('span', { class: 'mg-lbl' }, task.label),
      h('span', { class: 'mg-meta' },
        tag ? h('span', { class: 'mg-tag' }, tag) : null,
        QUAND[task.quand] ? h('span', { class: `mg-quand ${task.quand}` }, QUAND[task.quand]) : null,
        row ? h('span', {}, quandFait(row, echeance)) : null)));
  return btn;
}

function section(titre, items, done, opts) {
  if (!items.length) return null;
  return h('div', { class: `mg-sec ${opts?.cls || ''}` },
    h('div', { class: 'mg-sec-title' }, titre),
    items.map((it) => ligne(it, done, opts)));
}

function colonne(i, titre, sections, compte) {
  const corps = h('div', { class: 'mg-panel-body' }, sections);
  corps.addEventListener('scroll', () => { defilement[`${choix}:${i}`] = corps.scrollTop; }, { passive: true });
  return h('div', { class: 'mg-panel' },
    h('div', { class: 'mg-panel-head' },
      h('span', {}, titre),
      compte ? h('span', { class: `mg-compte ${compte.fait === compte.total ? 'ok' : ''}` }, `${compte.fait} / ${compte.total}`) : null),
    corps);
}

const compter = (items, done) => ({
  fait: items.filter((it) => done.has(cle(it.task, it.echeance))).length,
  total: items.length,
});
const sur = (tasks, echeance, tag) => tasks.map((task) => ({ task, echeance, tag }));

export function renderMenage(container) {
  clear(container);
  const done = coches();
  const auj = ymd(serviceDay());
  const semaine = weekOf(serviceDay());
  const cles = semaine.map(ymd);

  // Le choix d'un jour ne survit pas à la nuit : le lendemain on rouvre sur
  // aujourd'hui (ou sur samedi, les jours de fermeture).
  if (choixDu !== auj) { choix = null; choixDu = auj; }
  if (choix !== 'mois' && !cles.includes(choix)) choix = cles.includes(auj) ? auj : cles[4];

  // ── Barre des jours ──
  const jours = h('div', { class: 'segment mg-days' },
    semaine.map((d) => {
      const k = ymd(d);
      const def = jourDe(d);
      const reste = k <= auj && k >= DEBUT
        ? tachesDe(def).filter((task) => !done.has(cle(task, k))).length : null;
      return h('button', {
        class: `chip ${choix === k ? 'active' : ''} ${k === auj ? 'auj' : ''}`,
        onclick: () => { choix = k; renderMenage(container); },
      },
        `${def.nom.slice(0, 3)}. ${d.getDate()}`,
        reste === null ? null
          : h('span', { class: `mg-pastille ${reste ? '' : 'ok'}` }, reste ? String(reste) : '✓'));
    }),
    h('button', {
      class: `chip ${choix === 'mois' ? 'active' : ''}`,
      onclick: () => { choix = 'mois'; renderMenage(container); },
    }, 'Mensuel'));

  let colonnes, total, sousTitre;

  if (choix === 'mois') {
    const mois = auj.slice(0, 7);
    const taches = sur(MENSUEL.taches, mois);
    const menage = sur(MENSUEL.menage, mois);
    total = compter([...taches, ...menage], done);
    sousTitre = `Une fois par mois · ${MOIS[parse(auj).getMonth()]} ${auj.slice(0, 4)}`;
    colonnes = [
      colonne(0, 'Tâches du mois', section('Obligatoires', taches, done), compter(taches, done)),
      colonne(1, 'Ménage du mois', section('Ménage', menage, done), compter(menage, done)),
      colonne(2, 'Normes HACCP à respecter',
        h('div', { class: 'mg-sec' }, NORMES.map(([k, v]) =>
          h('div', { class: 'mg-norme' }, h('b', {}, k), h('span', {}, v))))),
    ];
  } else {
    const d = parse(choix);
    const def = jourDe(d);
    const futur = choix > auj;
    const opts = { fige: futur };
    // Une tâche d'un jour passé encore ouverte est, par définition, en report.
    const enRetard = choix < auj && choix >= DEBUT ? 'Reportée' : null;
    const reports = futur ? [] : reportsDu(choix, done);
    const taches = def.taches.map((task) => ({ task, echeance: choix, tag: done.has(cle(task, choix)) ? null : enRetard }));
    const menage = def.menage.map((task) => ({ task, echeance: choix, tag: done.has(cle(task, choix)) ? null : enRetard }));
    const qTaches = sur(QUOTIDIEN.taches, choix);
    const qMenage = sur(QUOTIDIEN.menage, choix);
    const duJour = [...reports, ...taches, ...menage];
    total = compter([...duJour, ...qTaches, ...qMenage], done);
    sousTitre = `${def.nom} ${d.getDate()} ${MOIS[d.getMonth()]}${choix === auj ? ' · aujourd’hui' : futur ? ' · à venir, on cochera le jour même' : ''}`;
    colonnes = [
      colonne(0, `${def.nom}`, [
        section('Reportées des jours précédents', reports, done, { ...opts, cls: 'mg-late' }),
        section('Tâches obligatoires du jour', taches, done, opts),
        section('Ménage du jour', menage, done, opts),
        // « Si besoin » : hors compteur, jamais reporté.
        section('Si besoin', sur(SI_BESOIN, choix), done, { ...opts, cls: 'mg-option' }),
      ], compter(duJour, done)),
      colonne(1, 'Tous les jours · tâches', section('Obligatoires', qTaches, done, opts), compter(qTaches, done)),
      colonne(2, 'Tous les jours · ménage', section('Ménage', qMenage, done, opts), compter(qMenage, done)),
    ];
  }

  const pct = total.total ? Math.round((total.fait / total.total) * 100) : 0;

  container.append(h('div', { class: 'mg-screen' },
    h('div', { class: 'viewbar' },
      h('h2', {}, 'Ménage'),
      jours,
      h('div', { class: 'spacer' }),
      h('div', { class: 'mg-total' },
        h('div', { class: 'mg-total-txt' },
          h('span', { class: 'muted' }, sousTitre),
          h('b', {}, `${total.fait} / ${total.total}`)),
        h('div', { class: 'mg-bar' }, h('i', { style: `width:${pct}%` })))),
    h('div', { class: 'mg-grid' }, colonnes)));

  container.querySelectorAll('.mg-panel-body').forEach((el, i) => {
    el.scrollTop = defilement[`${choix}:${i}`] || 0;
  });
}
