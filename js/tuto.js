// tuto.js — mode débutant : une visite guidée de chaque onglet.
//
// Activé depuis les Réglages (ou « Plus » sur téléphone), il lance un tuto la
// première fois qu'on ouvre chaque onglet, puis se tait. Le bouton « ? » de la
// barre du haut le rejoue à la demande.
//
// Le réglage vit en localStorage, comme le profil : c'est le nouveau venu de
// CET appareil qui apprend, l'iPad du patron n'a pas à lui montrer le tuto.
//
// Principe d'une étape : un élément de l'écran est mis en lumière (projecteur =
// un trou dans un voile sombre) et une bulle l'explique. Certaines étapes
// ouvrent elles-mêmes ce dont elles parlent — le formulaire « Nouveau
// produit », le mode Édition du plan — et le referment en partant : la visite
// ne crée, ne modifie et n'enregistre jamais rien.
//
// Les cibles sont relues à chaque instant : la synchro redessine les vues en
// plein tuto, et un élément gardé en mémoire serait déjà détaché de la page.
import { state } from './state.js';
import { h, clear } from './ui.js';
import { isMobileUI } from './uimode.js';
import { tutoSelectTable } from './floorplan.js';
import { tabAllowed } from './profile.js';
import { isTableType } from './elements.js';
import { openNote } from './openorder.js';
import { closeOrder } from './order.js';
import { closeMOrder } from './mobile/morder.js';

const KEY = 'bb.tuto';

function read() {
  try { return { on: false, vus: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { on: false, vus: [] }; }
}
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }

export const tutoOn = () => read().on;

/** Allumer remet le compteur à zéro et lance la visite complète. */
export function setTutoOn(on) {
  write({ on, vus: [] });
  if (!on) { parcours = null; stop(); }
  refreshHelpBtn();
  if (on) startParcours();
}

function markSeen(key) {
  const v = read();
  if (!v.vus.includes(key)) v.vus.push(key);
  write(v);
}

// ── Utilitaires de ciblage ───────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Le premier élément de `sel` dont le texte commence par (ou contient) `txt`. */
function byText(sel, txt, root = document) {
  const els = $$(sel, root);
  return els.find((e) => e.textContent.trim().startsWith(txt))
    || els.find((e) => e.textContent.includes(txt)) || null;
}
const modalEl = () => $('#modal-layer:not([hidden]) .modal');
/** Un champ du formulaire ouvert, retrouvé par son libellé. */
const fieldOf = (label) => {
  const m = modalEl();
  return m ? ($$('.field > label', m).find((l) => l.textContent.trim().startsWith(label))?.parentElement || null) : null;
};
const switchOf = (txt) => { const m = modalEl(); return m ? byText('label.switch', txt, m) : null; };
const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

async function waitFor(fn, ms = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(60); }
  return null;
}

const orderScreenOpen = () => !!$('.order-screen:not([hidden])') || !!$('.m-order');

// ── Scènes : ce qu'une étape ouvre, et referme en partant ────
// Une scène s'ouvre une fois pour toutes les étapes qui la partagent, et se
// referme dès qu'on passe à une étape qui n'en a pas besoin (dans un sens
// comme dans l'autre).
const SCENES = {
  // Le vrai formulaire « Nouveau produit », vide. On le referme par
  // « Annuler » : rien n'est créé.
  productForm: {
    async open() {
      if (modalEl()) return;
      const btn = byText('.viewbar button', '＋ Nouveau produit');
      if (!btn) return;
      btn.click();
      await waitFor(() => fieldOf('Nom'));
    },
    close() {
      const m = modalEl();
      if (!m || !byText('.modal-head h3', 'Nouveau produit', m)) return;
      byText('.modal-foot button', 'Annuler', m)?.click();
    },
  },
  // Le plan en mode Édition, une table sélectionnée pour montrer ses poignées.
  // Sans PIN seulement : la visite ne demande jamais un code à un débutant.
  planEdit: {
    switched: false,
    async open() {
      this.switched = false;
      if (state.planMode !== 'edition') {
        if (state.settings.pin) return;
        const chip = byText('.floor-bar .chip', 'Édition');
        if (!chip) return;
        chip.click();
        this.switched = true;
        await waitFor(() => $('.pal-side'));
      }
      tutoSelectTable();
      await frame();
    },
    close() {
      if (!this.switched) return;
      this.switched = false;
      byText('.floor-bar .chip', 'Service')?.click();
    },
  },
  // La note d'une table, ouverte pour la visite puis refermée. Ouvrir une
  // note ne crée rien : la commande n'existe qu'au premier produit ajouté.
  // Si quelqu'un a déjà ouvert une note, on la laisse telle quelle.
  note: {
    opened: false,
    async open() {
      this.opened = false;
      if (orderScreenOpen()) return;
      const t = state.layout.find((e) => isTableType(e.type) && e.area === state.area)
        || state.layout.find((e) => isTableType(e.type));
      if (!t) return;
      openNote(t.id);
      this.opened = true;
      await waitFor(() => orderScreenOpen());
    },
    close() {
      if (!this.opened) return;
      this.opened = false;
      if (isMobileUI()) closeMOrder(); else closeOrder();
    },
  },
  // L'écran d'accueil en mode Édition des tuiles.
  homeEdit: {
    switched: false,
    async open() {
      this.switched = false;
      const chip = byText('.pos-bar .chip', '✎ Édition');
      if (!chip) return;
      chip.click();
      this.switched = true;
      await waitFor(() => $('.add-tile'));
    },
    close() {
      if (!this.switched) return;
      this.switched = false;
      byText('.pos-bar .chip', '✓ Terminer')?.click();
    },
  },
};

// ── Les visites ──────────────────────────────────────────────
// Une étape : { el, title, text, scene?, enter?, optional? }
//   el       sélecteur, fonction, ou tableau (on éclaire leur union) ;
//            absent = bulle centrée, sans projecteur.
//   optional l'étape saute si sa cible n'est pas à l'écran (table vide,
//            produits verrouillés…) au lieu de parler dans le vide.
const P = () => isMobileUI();

const TOURS = {
  bienvenue: () => [
    { title: 'Bienvenue sur la caisse du Bluebird 👋',
      text: ['Le mode débutant est activé : chaque onglet va se présenter la première fois que tu l\'ouvres.',
        'Avance avec « Suivant ». « Passer » saute le tuto de l\'onglet en cours.'] },
    P()
      ? { el: '#m-nav', title: 'Les onglets', text: ['La barre du bas mène aux écrans du service : la Salle, le Comptoir, la Cuisine et la Carte.'] }
      : { el: '#tabs', title: 'Les onglets', text: ['Chaque onglet est un écran de la caisse : l\'accueil (comptoir), la salle, la carte, les recettes, les produits, la cuisine, le ménage et le tableau de bord.'] },
    P()
      ? { el: '.m-nav .m-tab:last-child', title: 'Plus', text: ['Le Ménage, les Produits, le Tableau de bord et les Réglages sont rangés ici.'] }
      : null,
    { el: '#tuto-btn', title: 'Revoir un tuto', text: ['Ce bouton rejoue à tout moment le tuto de l\'écran où tu te trouves.'] },
    { el: '#settings-btn', title: 'Réglages', text: ['Le code PIN, le Bluebird\'s Hour, les tutos vidéo, la sauvegarde… et l\'interrupteur du mode débutant, pour l\'éteindre quand tu seras à l\'aise.'] },
  ],

  // ── Accueil / Comptoir ──
  home: () => P() ? [
    { title: 'Le Comptoir', text: ['On compose ici une commande sans passer par une table : un verre au bar, un bon pour la cuisine.'] },
    { el: '.m-home .m-grid', title: 'Familles et touches', text: ['Touche une famille pour voir ses produits, puis touche un produit pour l\'ajouter. S\'il a plusieurs formats ou des choix (sauce, cuisson…), la caisse te les demande.'] },
    { el: () => $('.m-home .m-iconbtn[aria-label="Rechercher"]'), title: 'Recherche', text: ['Plus rapide quand tu connais le nom : tape quelques lettres.'] },
    { el: '.m-home .m-tick', title: 'La sélection', text: ['Ta sélection vit en bas. Touche-la pour la déplier : ajuster les quantités, imprimer le bon ou l\'envoyer vers une table.'] },
    { title: 'Ranger les touches', text: ['La disposition des tuiles et la création de familles se font sur l\'iPad, onglet Accueil, bouton « ✎ Édition ».'] },
  ] : [
    { title: 'L\'Accueil — le comptoir', text: ['On compose ici une commande sans passer par le plan, puis on l\'envoie vers une table ou on imprime le bon directement.'] },
    { el: '.home-screen .pos-right', title: 'Familles et tuiles', text: ['Touche une famille pour ouvrir ses produits, puis touche un produit pour l\'ajouter. Les tuiles perso sont des raccourcis vers un produit ou une famille.'] },
    { el: '.home-screen .ticket', title: 'La sélection', text: ['Tout ce que tu touches arrive ici. Les boutons − / ＋ ajustent les quantités.'] },
    { el: '.home-screen .ticket-foot', title: 'Envoyer, imprimer, vider', text: ['« Envoyer vers une table » crée la note de la table choisie. « 🖨 Imprimer » envoie le bon au bar ou en cuisine. « Vider » repart de zéro.'] },
    { el: () => byText('.home-screen .pos-bar .chip', 'Édition'), title: 'Organiser l\'écran', text: ['Le bouton « ✎ Édition » permet de ranger les tuiles. Voyons ce qu\'il propose.'] },
    { scene: 'homeEdit', el: '.home-screen .tile-grid', optional: true, title: 'Déplacer une tuile', text: ['En édition, glisse une tuile vers une case : sur une case vide elle se déplace, sur une autre tuile elles s\'échangent. La disposition est partagée par tous les iPads.'] },
    { scene: 'homeEdit', el: () => $$('.home-screen .add-tile'), optional: true, title: 'Nouvelle famille, nouvelle tuile', text: ['« Nouvelle famille » crée une catégorie (nom, couleur, envoi en cuisine). « Nouvelle tuile » pose un raccourci vers un produit ou une famille.',
      'Dans une famille, toujours en édition, « Nouvelle touche » crée un produit rapidement et toucher un produit permet de corriger son nom et son prix.'] },
    { scene: 'homeEdit', el: () => byText('.home-screen .pos-bar .chip', 'Terminer'), optional: true, title: 'Terminer', text: ['« ✓ Terminer » quitte l\'édition. On le fait pour toi à la fin du tuto.'] },
  ],

  // ── Salle ──
  floor: () => P() ? [
    { title: 'La Salle', text: ['Toutes les tables du bar, celles qui demandent une action en premier.'] },
    { el: '.m-floorbar .m-chips', title: 'Zones', text: ['Filtre par zone (Terrasse, Intérieur…) ou affiche-les toutes.'] },
    { el: () => byText('.m-floorbar .chip', 'Occupées'), title: 'Seulement les occupées', text: ['Pratique en plein service : masque les tables libres.'] },
    { el: '.m-tables .m-table', optional: true, title: 'Une table', text: ['La pastille donne l\'état : vert libre, doré occupée, rouge à encaisser. Touche la table pour ouvrir sa note et commander.'] },
    { el: () => byText('.m-floorbar .chip', 'Plan'), title: 'Le plan', text: ['« 🗺 Plan » affiche le vrai plan de salle pour se repérer.'] },
    { title: 'Organiser la salle', text: ['Ajouter, déplacer ou renuméroter des tables se fait sur l\'iPad : onglet Salle, bouton « Édition ». Sur un écran de téléphone, les tables seraient trop petites pour être manipulées au doigt.'] },
  ] : [
    { title: 'La Salle', text: ['Le plan du bar. C\'est d\'ici que part le service : on touche une table pour prendre sa commande.'] },
    { el: () => $$('.floor-bar .segment')[0], title: 'Les zones', text: ['Passe d\'une zone à l\'autre : chaque zone a son propre plan.'] },
    { el: '.stage .el.is-table', optional: true, title: 'Une table', text: ['La pastille donne l\'état : vert libre, doré occupée, rouge à encaisser. Le montant en cours s\'affiche dessus.',
      'En mode Service, touche une table pour ouvrir sa note.'] },
    { el: () => $('.floor-bar')?.lastElementChild, title: 'CA en cours', text: ['Le total des notes encore ouvertes dans cette zone.'] },
    { el: () => $$('.floor-bar .segment')[1], title: 'Service / Édition', text: ['« Service » pour prendre les commandes. « Édition » pour organiser la salle — voyons comment.',
      state.settings.pin ? 'L\'édition est protégée par le code PIN : demande-le au responsable.' : null] },
    { scene: 'planEdit', el: '.pal-side', optional: true, title: 'Ajouter un élément', text: ['Le panneau de droite liste tables, chaises et décor. Touche un élément pour le poser au centre du plan. Les tables reçoivent automatiquement le prochain numéro libre.'] },
    { scene: 'planEdit', el: '.stage .el.selected', optional: true, title: 'Déplacer', text: ['Touche un élément pour le sélectionner, puis fais-le glisser. Il s\'aligne tout seul sur la grille.'] },
    { scene: 'planEdit', el: () => $$('.stage .el.selected .handle'), optional: true, title: 'Les poignées', text: ['Coin bas-droit : agrandir ou réduire. Rond du haut : faire pivoter. ✕ : supprimer.',
      'Touche une seconde fois l\'élément sélectionné pour régler son numéro, ses couverts, le dupliquer ou le faire pivoter de 15°.'] },
    { scene: 'planEdit', el: '.pal-foot', optional: true, title: 'Renuméroter', text: ['Renumérote toutes les tables de la zone dans l\'ordre de lecture (de haut en bas, de gauche à droite).'] },
    { scene: 'planEdit', el: () => byText('.floor-bar .chip', 'Service'), optional: true, title: 'Revenir au service', text: ['Chaque changement est enregistré tout de suite et apparaît sur les autres iPads. Repasse en « Service » quand tu as fini — on le fait pour toi à la fin du tuto.'] },
  ],

  // ── Carte ──
  menu: () => [
    { el: '.menu-hero', title: 'La Carte', text: ['La carte telle que le client la lit, rangée par famille. Elle se met à jour toute seule avec l\'onglet Produits ; un produit en rupture disparaît.'] },
    { el: '.menu-item.a-fiche', optional: true, title: 'Les fiches techniques', text: ['Un produit marqué « Fiche » a une recette : touche-le pour voir technique, verre, doses et photo.'] },
  ],

  // ── Recettes ──
  recettes: () => [
    { el: '.rec-hero', title: 'Les Recettes', text: ['Le classeur du bar : toutes les fiches techniques dépliées, prêtes à lire les mains prises.'] },
    { el: '.rec-groupe > summary', optional: true, title: 'Les sous-familles', text: ['Touche une sous-famille (Gin, Rhum, Spritz…) pour l\'ouvrir ou la fermer.'] },
    { el: '.rec-card', optional: true, title: 'Une fiche', text: ['Technique, verre, finition et doses, telles que saisies dans Produits.'] },
    { el: '.rec-premix', optional: true, title: 'Les prémix', text: ['Pour les cocktails et les shots, la recette est recalculée pour une bouteille de 33 cl et de 70 cl.'] },
    { title: 'Ajouter une recette', text: ['Les fiches se saisissent dans l\'onglet Produits : « Modifier » sur un produit, puis « Fiche technique ». Le tuto de Produits te le montre.'] },
  ],

  // ── Produits ──
  catalog: () => [
    { title: 'Les Produits', text: ['Deux modes : « Fiches », pour répondre aux questions des clients, et « Gestion », le catalogue de la caisse (prix, formats, recettes).'] },
    { el: '.fi-search', optional: true, title: 'Chercher', text: ['Tape un nom ou un goût : « fumé », « sans alcool », « vanille »… La recherche fouille aussi le texte des fiches.'] },
    { el: '.fi-chips', optional: true, title: 'Les familles', text: ['Pour ne voir qu\'une famille : Bières, Spiritueux, Vins…'] },
    { el: '.fi-list', optional: true, title: 'La liste', text: ['Touche un produit pour ouvrir sa fiche. Le point vert : la fiche est remplie ; le point vide : pas encore.'] },
    { el: '.fi-pitch', optional: true, enter: () => { if (!$('.fi-pitch')) $('.fi-item')?.click(); }, title: 'À dire au client', text: ['Deux ou trois phrases toutes prêtes. En dessous : les infos clés, la dégustation, le profil de goût, et quoi proposer s\'il hésite — touche une proposition pour ouvrir sa fiche.'] },
    { el: () => byText('.fi-edit button', 'fiche'), optional: true, title: 'Modifier une fiche', text: ['Une fiche se corrige ici, derrière le code PIN. La correction part sur les autres iPads. Le badge « À vérifier » signale un fait à confirmer.'] },
    { el: () => byText('.fi-seg button', 'Gestion'), title: 'Le mode Gestion', text: ['« Gestion » ouvre le catalogue : prix, ruptures, nouveaux produits. Il demande le code PIN. Ouvrons-le.'],
      // Sans PIN on bascule pour la suite du tuto ; avec PIN, le code ne se
      // demande pas en pleine visite : l'étape suivante affiche son repli.
      enter: () => { const b = byText('.fi-seg button', 'Gestion'); if (b && !b.classList.contains('active') && !b.textContent.includes('🔒')) b.click(); } },
    { el: () => byText('.viewbar button', 'Nouveau produit'),title: 'Ajouter un produit', text: ['Ce bouton ouvre le formulaire d\'un nouveau produit. Ouvrons-le ensemble — rien ne sera enregistré.'],
      fallback: 'La Gestion est verrouillée par le code PIN : ouvre-la (bouton « Gestion ») pour suivre la suite du tuto.' },
    { scene: 'productForm', el: () => fieldOf('Nom'), optional: true, title: 'Le nom', text: ['Le nom tel qu\'il apparaît sur la touche, la note et la carte.'] },
    { scene: 'productForm', el: () => [fieldOf('Catégorie'), fieldOf('Sous-catégorie')], optional: true, title: 'Catégorie et sous-catégorie', text: ['La catégorie est la famille (Cocktails, Bières…). Choisis « ＋ Nouvelle catégorie… » pour en créer une. La sous-catégorie range les produits dans la famille (Classiques, Créations…).'] },
    { scene: 'productForm', el: () => fieldOf('Formats & prix'), optional: true, title: 'Formats et prix', text: ['Un seul prix : laisse le format vide. Plusieurs (Verre / Bouteille, 25 / 50 cl) : « ＋ Format » pour chacun, la caisse demandera lequel à l\'ajout.'] },
    { scene: 'productForm', el: () => fieldOf('Sous-choix'), optional: true, title: 'Les sous-choix', text: ['Sauce, parfum, cuisson… : des questions posées au moment d\'ajouter le produit sur une note.'] },
    { scene: 'productForm', el: () => fieldOf('Recette du bar'), optional: true, title: 'La fiche technique', text: ['C\'est ici qu\'on met la recette. Ouvrons-la.'],
      enter: () => { const b = modalEl() && byText('.modal button', '▸ Fiche technique'); if (b) b.click(); } },
    { scene: 'productForm', el: () => fieldOf('Recette du bar')?.querySelector('.row'), optional: true, title: 'Technique, verre, finition', text: ['Shake, Build, Verre à mélange… et le verre de service. Des suggestions s\'affichent quand tu tapes.'] },
    { scene: 'productForm', el: () => { const m = modalEl(); const b = m && byText('button', '＋ Ingrédient', m); return b ? [b.previousElementSibling, b] : null; }, optional: true, title: 'Les ingrédients', text: ['Une ligne par ingrédient : son nom et sa dose (« 4 cl », « 2 dash », « TOP »). « ＋ Ingrédient » ajoute une ligne, ✕ la retire.',
      'Sans aucun ingrédient, il n\'y a pas de fiche.'] },
    { scene: 'productForm', el: () => { const m = modalEl(); return m && byText('button', '🖼 Photo ou schéma', m); }, optional: true, title: 'Photo ou schéma', text: ['Une photo du verre fini ou du montage. Elle est réduite automatiquement pour ne pas alourdir la synchro.'] },
    { scene: 'productForm', el: () => [switchOf('Éligible'), switchOf('Disponible'), switchOf('Bon de cuisine'), switchOf('Recette imprimée')], optional: true, title: 'Les interrupteurs', text: ['1+1 : compte dans le Bluebird\'s Hour. Disponible : éteint, le produit passe en rupture. Bon de cuisine : part à la cuisine. Recette imprimée : la fiche sort sur le bon, pour qu\'un débutant puisse faire le cocktail.'] },
    { scene: 'productForm', el: () => { const m = modalEl(); return m && byText('.modal-foot button', 'Créer', m); }, optional: true, title: 'Créer', text: ['« Créer » enregistre le produit. Ici on annule : le tuto referme le formulaire sans rien enregistrer.'] },
    { el: '.prod-row', optional: true, title: 'Modifier un produit', text: ['Chaque ligne montre les prix et des badges (1+1, Fiche, Rupture). « Modifier » rouvre le même formulaire, rempli, avec un bouton Supprimer.'] },
    { el: () => $('.prod-row')?.querySelector('.btn-ghost'), optional: true, title: 'Rupture', text: ['Un produit épuisé ? « Rupture » le retire de la carte et grise sa touche. « Réactiver » le remet.'] },
    { el: () => byText('.viewbar button', 'Sous-familles'), optional: true, title: 'Sous-familles partagées', text: ['Des listes de choix réutilisables par plusieurs produits (les sauces des burgers, par exemple) : modifiées une fois, à jour partout.'] },
  ],

  // ── Cuisine ──
  cuisine: () => [
    { title: 'La Cuisine', text: ['Les bons envoyés depuis la salle et le comptoir arrivent ici, même si l\'imprimante est éteinte.'] },
    { el: () => byText('.viewbar button', 'son'), title: 'Le son', text: ['Le navigateur coupe le son à chaque rechargement : touche « Activer le son » en début de service pour être prévenu des nouveaux bons.'] },
    { el: '.viewbar .segment', title: 'Les filtres', text: ['« À faire » : ce qu\'il reste à préparer. « Tout le service » : les bons cuisine du jour. « Tous les bons » : tout ce qui a été imprimé, boissons comprises.'] },
    { el: '.cuisine-grid', title: 'Les bons', text: ['Chaque bon montre la table, l\'heure et les plats. Le bouton principal fait avancer le bon ; 🖨 le réimprime.'] },
  ],

  // ── Ménage ──
  menage: () => [
    { title: 'Le Ménage', text: ['Le planning ménage & tâches du bar, en liste à cocher. Ce qui est coché ici l\'est sur tous les appareils.'] },
    { el: '.mg-days', title: 'Les jours', text: ['Du mardi au samedi. La pastille compte ce qu\'il reste à faire ce jour-là ; « Mensuel » regroupe les tâches à faire une fois par mois.'] },
    { el: '.mg-panel', title: 'Cocher', text: ['Touche une tâche quand elle est faite ; retouche-la pour la décocher. À gauche les tâches du jour, à côté celles de tous les jours.'] },
    { el: '.mg-late', optional: true, title: 'Les reports', text: ['Une tâche pas faite ne disparaît pas : elle revient ici le lendemain, jusqu\'à ce qu\'elle soit cochée.'] },
  ],

  // ── Tableau de bord ──
  dashboard: () => [
    { el: '.dash .st-live', title: 'Le Tableau de bord', text: ['En haut, le service en cours : chiffre des notes ouvertes, tables occupées, notes à encaisser.'] },
    { el: '.viewbar .st-periodes', title: 'La période', text: ['Jour, semaine, mois ou tout : les statistiques dessous suivent. Les flèches ◀ ▶ remontent dans le temps.'] },
    { el: '.dash .st-kpis', title: 'Encaissé', text: ['Chiffre d\'affaires, nombre de notes, ticket moyen… avec l\'évolution par rapport à la période d\'avant.'] },
    { el: '.st-grid', optional: true, title: 'Le détail', text: ['Le chiffre dans le temps, les produits les plus vendus, la part de chaque famille et de chaque zone. Touche une colonne pour lire sa valeur.'] },
    { el: '.open-row', optional: true, title: 'Les notes ouvertes', text: ['Les notes pas encore encaissées, la plus ancienne en premier. Touche-en une pour l\'ouvrir.'] },
  ],

  // ── Fin de la visite complète ──
  fin: () => [
    { title: 'Visite terminée 🎉', text: ['Tu as fait le tour de la caisse.',
      'Le bouton « ? » rejoue le tuto de l\'écran affiché. Pour refaire toute la visite, ou éteindre le mode débutant : ⚙ Réglages.'] },
  ],

  // ── Note d'une table (pas un onglet : s'ouvre depuis la salle) ──
  note: () => P() ? [
    { scene: 'note', el: '.m-order .m-order-top', title: 'La note de la table', text: ['Le nom de la table en haut. La flèche ‹ revient à la salle.'] },
    { scene: 'note', el: '.m-order .m-grid', title: 'Ajouter des produits', text: ['Touche une famille puis un produit. Formats et sous-choix sont demandés au besoin.'] },
    { scene: 'note', el: '.m-order .m-tick', title: 'La note', text: ['Touche la barre du bas pour déplier la note : quantités, plusieurs notes pour une même table, et les boutons Encaisser, 🖨 Imprimer et ⋯ (déplacer, supprimer…).'] },
  ] : [
    { scene: 'note', el: '.order-screen .ticket-head', title: 'La note de la table', text: ['Le nom de la table et ses couverts. ‹ revient à la salle.'] },
    { scene: 'note', el: '.order-screen .ticket-notetabs', optional: true, title: 'Plusieurs notes', text: ['« ＋ Note » ouvre une seconde note sur la même table, pour faire payer séparément.'] },
    { scene: 'note', el: '.order-screen .pos-right', title: 'Ajouter des produits', text: ['Touche une famille puis un produit. S\'il a plusieurs formats ou des sous-choix, la caisse les demande.'] },
    { scene: 'note', el: '.order-screen .ticket-lines', title: 'Les lignes', text: ['− / ＋ ajustent les quantités. Une ligne 1+1 est comptée selon le Bluebird\'s Hour.'] },
    { scene: 'note', el: '.order-screen .ticket-foot', title: 'Encaisser, imprimer', text: ['« 🖨 » envoie au bar et en cuisine ce qui n\'a pas encore été imprimé. « Encaisser » clôt la note. « ⋯ » : addition, note de frais, déplacer vers une autre table, supprimer.'] },
  ],
};

// ── Moteur ───────────────────────────────────────────────────
let lastView = null;
let run = null;     // { key, steps, i, scene, layer, spot, card, timer, onKey }
let navigateTo = null;   // injecté par app.js (mountHelp)
let parcours = null;     // visite complète : { pages, i }

// La visite complète enchaîne les écrans dans l'ordre du service. Le
// téléphone commence par la salle, l'iPad par le comptoir ; les onglets
// masqués par le profil de l'appareil sont sautés. La note de table suit la
// salle : c'est là qu'on en ouvre une.
const NOMS = { home: 'Accueil', floor: 'Salle', note: 'Note de table', menu: 'Carte', recettes: 'Recettes',
  catalog: 'Produits', cuisine: 'Cuisine', menage: 'Ménage', dashboard: 'Tableau de bord' };
function pagesParcours() {
  const ordre = isMobileUI()
    ? ['floor', 'note', 'home', 'cuisine', 'menu', 'menage', 'catalog', 'dashboard']
    : ['home', 'floor', 'note', 'menu', 'recettes', 'catalog', 'cuisine', 'menage', 'dashboard'];
  return ordre.filter((v) => (v === 'note' ? tabAllowed('floor') : tabAllowed(v)));
}

/** Lance la visite complète : bienvenue, puis chaque écran l'un après l'autre. */
export function startParcours() {
  stop();
  parcours = { pages: pagesParcours(), i: -1 };
  launch('bienvenue', null, { force: true });
}

function pageSuivante() {
  if (!parcours) return;
  parcours.i++;
  const v = parcours.pages[parcours.i];
  if (!v) {
    // Retour au premier écran pour le mot de la fin.
    const first = parcours.pages.find((p) => p !== 'note');
    parcours = null;
    if (first && navigateTo) navigateTo(first);
    launch('fin', null, { force: true });
    return;
  }
  if (v !== 'note' && navigateTo) navigateTo(v);
  launch(v, v, { force: true });
}

/** Appelé par app.js à chaque changement d'onglet (et par openorder.js). */
export function tutoView(view) {
  if (view !== 'note') lastView = view;
  const s = read();
  if (!s.on || run || parcours) return;
  if (!s.vus.includes('bienvenue')) { launch('bienvenue', view); return; }
  if (TOURS[view] && !s.vus.includes(view)) launch(view, view);
}

/** Le bouton « ? » : rejoue le tuto de l'écran courant. */
export function replay() {
  if (run) return;
  launch(orderScreenOpen() ? 'note' : (lastView || 'home'), null, { force: true });
}

async function launch(key, view, { force = false } = {}) {
  run = { key, pending: true };
  // On attend que l'écran soit posé et libre : une vue qui se dessine en
  // asynchrone, la demande de PIN de Produits, une note ouverte par-dessus.
  const t0 = Date.now();
  await sleep(350);
  while (Date.now() - t0 < 60000) {
    if (!force && view && key !== 'bienvenue' && key !== 'note' && lastView !== view) { run = null; return; }
    if (!read().on && !force) { run = null; return; }
    const modalOpen = !!$('#modal-layer:not([hidden])') || !!$('.m-sheet-layer');
    const blocked = !['note', 'bienvenue', 'fin'].includes(key) && orderScreenOpen();
    if (!modalOpen && !blocked) break;
    await sleep(250);
  }
  const steps = (TOURS[key]?.() || []).filter(Boolean);
  if (!steps.length) { run = null; if (parcours) pageSuivante(); return; }
  start(key, steps);
}

function start(key, steps) {
  const spot = h('div', { class: 'tuto-spot' });
  const card = h('div', { class: 'tuto-card', role: 'dialog', 'aria-live': 'polite' });
  const layer = h('div', { class: 'tuto-layer' }, spot, card);
  document.body.append(layer);
  run = { key, steps, i: -1, scene: null, layer, spot, card, timer: null, el: null };
  run.onKey = (e) => {
    if (e.key === 'Escape') quit();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', run.onKey);
  run.onResize = () => place();
  window.addEventListener('resize', run.onResize);
  // Les vues se redessinent (synchro, rechargement) : on relit la cible.
  run.timer = setInterval(place, 300);
  go(1);
}

async function go(dir) {
  if (!run || run.busy) return;
  run.busy = true;
  try {
    let i = run.i + dir;
    while (i >= 0 && i < run.steps.length) {
      const st = run.steps[i];
      await setScene(st.scene || null);
      if (!run) return;
      if (st.enter) { try { await st.enter(); } catch {} await sleep(80); }
      await frame();
      const el = resolve(st.el);
      if (st.el && !el && st.optional) { i += dir; continue; }
      run.i = i;
      render(st, el);
      return;
    }
    if (i >= run.steps.length) finish();
    // Avant la première étape : on reste où l'on est.
  } finally { if (run) run.busy = false; }
}

async function setScene(name) {
  if (!run || run.scene === name) return;
  if (run.scene) { try { SCENES[run.scene].close(); } catch {} await sleep(120); }
  run.scene = name;
  if (name) { try { await SCENES[name].open(); } catch {} await sleep(80); }
}

/** Une cible : sélecteur, fonction ou liste. Renvoie un élément ou une liste d'éléments visibles. */
function resolve(spec) {
  if (!spec) return null;
  let v = typeof spec === 'function' ? spec() : typeof spec === 'string' ? $(spec) : spec;
  if (Array.isArray(v)) {
    v = v.flat().filter(visible);
    return v.length ? v : null;
  }
  return visible(v) ? v : null;
}

function rectOf(el) {
  const list = Array.isArray(el) ? el : [el];
  const rs = list.map((e) => e.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function render(st, el) {
  const { card } = run;
  const n = run.steps.length, i = run.i;
  const last = i === n - 1;
  const paras = (el || !st.fallback ? st.text : [st.fallback]).filter(Boolean);
  // Dans la visite complète, la dernière étape d'un écran mène au suivant.
  const enVisite = !!parcours && run.key !== 'fin';
  const page = enVisite && parcours.i >= 0 ? parcours.pages[parcours.i] : null;
  const derniere = !parcours || parcours.i >= parcours.pages.length - 1;
  const suite = !last ? 'Suivant ›' : !enVisite ? 'Terminer' : derniere ? 'Suivant ›' : 'Écran suivant ›';

  // `append` natif écrit « null » en toutes lettres : hors visite complète, il
  // n'y a pas de bandeau d'écran, et il ne faut rien poser à sa place.
  clear(card).append(...[
    enVisite ? h('div', { class: 'tuto-page' },
      h('span', {}, page ? `${NOMS[page] || page} · écran ${parcours.i + 1}/${parcours.pages.length}` : 'Visite guidée'),
      h('button', { class: 'tuto-quit', onclick: quit, 'aria-label': 'Quitter la visite' }, '✕')) : null,
    h('div', { class: 'tuto-prog' },
      h('span', {}, `${i + 1} / ${n}`),
      h('div', { class: 'tuto-bar' }, h('span', { style: `width:${((i + 1) / n) * 100}%` }))),
    h('div', { class: 'tuto-title' }, st.title),
    h('div', { class: 'tuto-text' }, paras.map((t) => h('p', {}, t))),
    h('div', { class: 'tuto-foot' },
      last ? null : h('button', { class: 'btn btn-sm btn-ghost tuto-skip', onclick: finish }, enVisite ? 'Passer l\'écran' : 'Passer'),
      h('div', { class: 'spacer' }),
      i > 0 ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => go(-1), 'aria-label': 'Étape précédente' }, '‹') : null,
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => go(1) }, suite)),
  ].filter(Boolean));

  run.el = st.el || null;
  run.fixedEl = el;
  // Amène la cible dans l'écran (un champ en bas du formulaire, une fiche
  // plus bas dans la page) avant de la viser.
  const first = Array.isArray(el) ? el[0] : el;
  if (first) {
    const r = rectOf(el);
    if (r.top < 60 || r.bottom > innerHeight - 60) first.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  place();
}

function place() {
  if (!run || !run.card) return;
  const { spot, card, layer } = run;
  const st = run.steps[run.i];
  if (!st) return;
  // Relue à chaque fois : la vue a pu être redessinée depuis.
  let el = resolve(st.el);
  if (!el && run.fixedEl) el = resolve(run.fixedEl);

  const vw = innerWidth, vh = innerHeight, M = 12;
  const phone = vw < 640;

  if (!el) {
    spot.hidden = true;
    layer.classList.add('dim');
    card.classList.add('centre');
    card.style.left = card.style.top = '';
    card.style.width = '';
    return;
  }
  layer.classList.remove('dim');
  card.classList.remove('centre');
  spot.hidden = false;

  const r = rectOf(el);
  const pad = 6;
  const sl = Math.max(4, r.left - pad), st2 = Math.max(4, r.top - pad);
  const sr = Math.min(vw - 4, r.right + pad), sb = Math.min(vh - 4, r.bottom + pad);
  Object.assign(spot.style, { left: `${sl}px`, top: `${st2}px`, width: `${Math.max(0, sr - sl)}px`, height: `${Math.max(0, sb - st2)}px` });

  // Téléphone : la bulle prend la largeur, en bas si la cible est en haut,
  // en haut sinon — le pouce garde la cible visible.
  const w = phone ? vw - M * 2 : Math.min(380, vw - M * 2);
  card.style.width = `${w}px`;
  const ch = card.offsetHeight;
  let x, y;
  if (phone) {
    x = M;
    const cy = (st2 + sb) / 2;
    const bas = vh - ch - M - safeBottom();
    const haut = M + safeTop();
    // Cible en haut : la bulle juste dessous si elle tient, sinon en bas.
    // Cible en bas : juste dessus si elle tient, sinon en haut.
    if (cy < vh / 2) y = sb + M + ch <= bas ? sb + M : bas;
    else y = st2 - M - ch >= haut ? st2 - M - ch : haut;
  } else {
    x = Math.min(Math.max(M, (sl + sr) / 2 - w / 2), vw - w - M);
    if (sb + M + ch <= vh - M) y = sb + M;                       // dessous
    else if (st2 - M - ch >= M) y = st2 - M - ch;                // dessus
    else if (sr + M + w <= vw - M) { x = sr + M; y = clampY(st2, ch, vh, M); }   // à droite
    else if (sl - M - w >= M) { x = sl - M - w; y = clampY(st2, ch, vh, M); }    // à gauche
    else y = vh - ch - M;                                         // posée en bas, par-dessus
  }
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}

const clampY = (y, ch, vh, M) => Math.min(Math.max(M, y), vh - ch - M);
const envPx = (name) => {
  const probe = h('div', { style: `position:fixed;visibility:hidden;height:env(${name}, 0px)` });
  document.body.append(probe);
  const v = probe.offsetHeight; probe.remove(); return v;
};
let safe = null;
const safeBottom = () => { safe ??= { b: envPx('safe-area-inset-bottom'), t: envPx('safe-area-inset-top') }; return safe.b; };
const safeTop = () => { safeBottom(); return safe.t; };

/** Fin du tuto (terminé ou passé) : l'onglet est considéré comme vu. */
function finish() {
  if (!run) return;
  const key = run.key;
  stop();
  markSeen(key);
  if (parcours) { pageSuivante(); return; }
  // Après la bienvenue, l'onglet où l'on se trouve se présente à son tour.
  if (key === 'bienvenue') tutoView(orderScreenOpen() ? 'note' : lastView);
}

/** ✕ ou Échap : on sort de la visite complète, sans enchaîner. */
function quit() {
  parcours = null;
  finish();
}

function stop() {
  if (!run) return;
  const r = run;
  run = null;
  if (r.scene) { try { SCENES[r.scene].close(); } catch {} }
  clearInterval(r.timer);
  if (r.onKey) document.removeEventListener('keydown', r.onKey);
  if (r.onResize) window.removeEventListener('resize', r.onResize);
  r.layer?.remove();
}

// ── Bouton « ? » ─────────────────────────────────────────────
// Dans la barre du haut, à côté des Réglages : présent sur iPad comme sur
// téléphone, et seulement quand le mode débutant est actif.
export function mountHelp({ navigate } = {}) {
  if (navigate) navigateTo = navigate;
  const actions = $('.topbar-actions');
  if (!actions || $('#tuto-btn')) { refreshHelpBtn(); return; }
  actions.prepend(h('button', {
    class: 'icon-btn tuto-btn', id: 'tuto-btn', title: 'Revoir le tuto de cet écran', 'aria-label': 'Aide',
    onclick: replay,
  }, '?'));
  refreshHelpBtn();
}

function refreshHelpBtn() {
  const b = $('#tuto-btn');
  if (b) b.hidden = !tutoOn();
}
