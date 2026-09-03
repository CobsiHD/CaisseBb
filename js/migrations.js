// migrations.js — mises à jour de la carte sur des iPads déjà en service.
//
// Le seed (seed.js) ne joue qu'à base vide : sur un iPad qui tourne depuis des
// mois, changer la carte par défaut ne change rien. Ce fichier comble le trou —
// une suite de retouches numérotées, appliquées une fois puis retenues.
//
// Elles passent par store.put / store.del, donc par le crochet de synchro : le
// premier iPad qui démarre après la mise à jour pousse la nouvelle carte sur le
// serveur, les autres la reçoivent par le flux temps réel sans rien faire. Le
// numéro atteint vit dans les réglages (`catalogRev`), qui se synchronisent
// aussi : personne ne rejoue une retouche déjà passée.
//
// Écrire une retouche idempotente est la règle : deux iPads peuvent très bien
// démarrer en même temps et l'appliquer tous les deux. Les mêmes lignes écrites
// avec le même contenu, c'est sans conséquence — le dernier arrivé gagne, et il
// dit la même chose que le premier.
import * as store from './store.js';
import { state, reloadCatalog, reloadTiles } from './state.js';
import { CATEGORIES, PRODUCTS, OPTION_GROUPS, CATALOG_REV } from './seed.js';

const KEY = 'catalogRev';

// ── 1 · La carte cuisine du Bluebird ─────────────────────────
// « Snack salé » devient « Cuisine », ses cinq produits d'origine laissent la
// place aux trois sous-familles (The Tapas / The Frites / Pas Mal) et les six
// sauces deviennent une sous-famille partagée.
const REMPLACES = [
  'snack-frites-maison',
  'snack-frites-maison-xxl',
  'snack-chilli-cheese-6-pieces',
  'snack-tenders-de-poulet-4-pieces',
  'snack-plateau-charcuterie-fromage',
];

async function carteCuisine() {
  // La famille garde son id (les couleurs de tuile et le drapeau cuisine s'y
  // accrochent) et tout ce qu'on a pu lui régler sur place : seul le nom change.
  const depuisSeed = CATEGORIES.find((c) => c.id === 'snack');
  const existante = state.categories.find((c) => c.id === 'snack');
  await store.put('categories', { ...depuisSeed, ...existante, name: 'Cuisine' });

  for (const g of OPTION_GROUPS) await store.put('optiongroups', { ...g });

  // On ne retire que les cinq produits nommés : ceux ajoutés à la main sur un
  // iPad depuis la mise en service ne nous appartiennent pas.
  for (const id of REMPLACES) {
    if (state.products.some((p) => p.id === id)) await store.del('products', id);
  }
  // Une tuile perso qui pointait vers l'un d'eux n'ouvrirait plus rien.
  for (const t of state.tiles) {
    if (REMPLACES.includes(t.productId)) await store.del('tiles', t.id);
  }

  // Les rangs du seed (104, 105…) tomberaient au milieu de ce qu'un iPad s'est
  // ajouté depuis. On repose le bloc cuisine après toute la carte : les trois
  // sous-familles restent d'un seul tenant et dans l'ordre voulu.
  const restants = state.products.filter((p) => !REMPLACES.includes(p.id));
  let rang = Math.max(0, ...restants.map((p) => Number(p.order) || 0)) + 1;
  const nouveaux = PRODUCTS.filter((p) => p.categoryId === 'snack');
  await store.bulkPut('products', nouveaux.map((p) => ({ ...p, order: rang++ })));
}

// ── 2 · Le « Nugget » saisi à la main ────────────────────────
// Ajouté sur un iPad avant la nouvelle carte, sans sous-famille, il fait
// doublon avec « Nuggets de Poulet (6 pièces) ». Retouche à part et non fondue
// dans la première : celle-ci était peut-être déjà passée quand on l'a repéré.
async function sansNugget() {
  const id = 'snack-nugget-109';
  if (state.products.some((p) => p.id === id)) await store.del('products', id);
  for (const t of state.tiles) {
    if (t.productId === id) await store.del('tiles', t.id);
  }
}

// ── 3 · Les tuiles du bar refaites sur la carte 6199-2 ───────
// Six familles au lieu de sept : « Sans Alcool » disparaît en tant que tuile et
// devient une sous-famille des cocktails, désormais rangés par alcool de base
// (Gin, Rhum, Vodka, Tequila, Whisky & Cognac, Spritz, Sans Alcool). Une tuile
// Shooters apparaît, les spiritueux affichent le format du verre, et bières et
// softs se remettent à jour de la carte. La cuisine n'est pas touchée.
const FAMILLES_REFAITES = ['cocktails', 'bieres', 'softs', 'shooters', 'spiritueux'];

// Les lignes de l'ancienne carte que la nouvelle ne reprend pas : les trois
// mocktails changent d'id en changeant de famille, la Hoegarden est une blanche
// et non plus une rosée, et le Ballon d'orge a quitté la carte.
const PARTIS = [
  'sans-alcool-roll-the-dice',
  'sans-alcool-cause-and-effect',
  'sans-alcool-virgin-more-much-more',
  'bieres-hoegarden-rose',
  'bieres-la-ballon-d-orge',
];

async function tuilesDuBar() {
  // Chaque famille garde ce qu'on lui a réglé sur place (couleur, drapeaux) :
  // seuls le nom et le rang viennent du seed. La cuisine passe par le même
  // chemin, mais son entrée du seed est déjà la sienne, mot pour mot.
  for (const c of CATEGORIES) {
    const existante = state.categories.find((x) => x.id === c.id);
    await store.put('categories', { ...c, ...existante, name: c.name, order: c.order });
  }
  if (state.categories.some((c) => c.id === 'sans-alcool')) await store.del('categories', 'sans-alcool');

  for (const id of PARTIS) {
    if (state.products.some((p) => p.id === id)) await store.del('products', id);
  }
  // Une tuile perso qui pointait vers l'un d'eux, ou vers la famille dissoute,
  // n'ouvrirait plus rien.
  for (const t of state.tiles) {
    if (PARTIS.includes(t.productId) || t.categoryId === 'sans-alcool') await store.del('tiles', t.id);
  }

  // Les autres gardent leur id : les réécrire suffit à leur poser leur nouvelle
  // sous-famille, leur format et leur prix. Les produits ajoutés à la main sur
  // un iPad ne sont pas dans cette liste et restent où ils sont — leur rang, pris
  // au bout de la carte, les range après le bloc du seed dans leur famille.
  const refaits = PRODUCTS.filter((p) => FAMILLES_REFAITES.includes(p.categoryId));
  await store.bulkPut('products', refaits.map((p) => ({ ...p })));
}

// Le dernier `rev` doit valoir CATALOG_REV : c'est le niveau qu'une base neuve
// reçoit d'emblée, et ce qu'elle sauterait ici.
const MIGRATIONS = [
  { rev: 1, run: carteCuisine },
  { rev: 2, run: sansNugget },
  { rev: 3, run: tuilesDuBar },
].filter((m) => m.rev <= CATALOG_REV);

// Applique ce qui manque. À appeler une fois la synchro tentée : avant, les
// écritures ne partiraient pas au serveur, et la première synchro (qui fait foi)
// les écraserait derrière. `catalogRev` repartirait alors à zéro et la retouche
// se rejouerait au démarrage suivant — le retard se rattrape tout seul.
export async function runMigrations() {
  const faite = Number(state.settings?.[KEY] || 0);
  const restantes = MIGRATIONS.filter((m) => m.rev > faite);
  if (!restantes.length) return false;

  for (const m of restantes) {
    await m.run();
    await store.setSetting(KEY, m.rev);
    state.settings[KEY] = m.rev;
  }
  await reloadCatalog();
  await reloadTiles();
  return true;
}
