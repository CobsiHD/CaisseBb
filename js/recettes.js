// recettes.js — onglet « Recettes » : le classeur du bar.
//
// La Carte (menu.js) est éditoriale : elle s'adresse au client et ouvre une
// fiche d'une touche. Ici c'est l'inverse — tout est déplié d'avance, rangé par
// sous-famille, et l'écran ne sert qu'à préparer. Aucune modale : le barman a
// les mains prises, il ne doit pas avoir à fermer un dialogue pour lire la
// recette suivante.
//
// Shots et cocktails portent en plus leurs deux prémix. La règle est celle du
// bar : une dose × le nombre de verres que tient la bouteille. Le compte se
// déduit du volume réel de la recette et pas d'un 8 écrit en dur — un shot de
// 5 cl ne donne pas huit verres dans une 33 cl, et le classeur doit dire vrai.
import { state } from './state.js';
import { h, clear } from './ui.js';

const BOUTEILLES = [
  { cl: 33, label: '33 cl' },
  { cl: 70, label: '70 cl' },
];

// Les familles dont les recettes se prémixent, et le nom de ce qu'une bouteille
// rend : des shots à l'Événement, des verres au bar. Le reste de la carte
// (bières, softs, spiritueux) n'a rien à mélanger d'avance.
const PREMIXABLES = new Map([
  ['evenement', 'shots'],
  ['cocktails', 'verres'],
  ['halloween', 'verres'],
  ['hiver', 'verres'],
]);

// ── Doses ────────────────────────────────────────────────────
// Une quantité de fiche est du texte libre — « 2 cl », « 1,5 cl », « 2 dash »,
// « TOP », « à l'œil ». On ne multiplie que ce qui commence par un nombre ; le
// reste passe tel quel et sera versé au verre.
function doseOf(qty) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(qty || '');
  if (!m) return null;
  return { n: Number(m[1].replace(',', '.')), unite: m[2].trim() };
}

const nombreFr = (n) => {
  const arrondi = Math.round(n * 10) / 10;
  return String(arrondi).replace('.', ',');
};

/** Le volume d'une recette, en cl. Null si une ligne échappe au compte. */
function volumeOf(recipe) {
  let total = 0;
  for (const i of recipe?.ingredients || []) {
    const d = doseOf(i.qty);
    if (!d || d.unite !== 'cl') continue;   // dash, gouttes, TOP : négligeable
    total += d.n;
  }
  return total || null;
}

/** Combien de verres tient une bouteille, et la recette mise à l'échelle. */
function premix(recipe, cl) {
  const volume = volumeOf(recipe);
  if (!volume) return null;
  const parts = Math.floor(cl / volume);
  if (parts < 2) return null;

  const lignes = (recipe.ingredients || []).map((i) => {
    const d = doseOf(i.qty);
    return {
      label: i.label,
      // Ce qui ne se compte pas ne se prémixe pas : on le dit plutôt que de
      // laisser croire qu'il part dans la bouteille.
      qty: d ? `${nombreFr(d.n * parts)}${d.unite ? ` ${d.unite}` : ''}` : 'au verre',
      auVerre: !d,
    };
  });

  return { parts, lignes, rempli: nombreFr(volume * parts) };
}

// ── Rendu ────────────────────────────────────────────────────
function repere(label, valeur) {
  return valeur
    ? h('div', { class: 'fiche-rep' }, h('div', { class: 'eyebrow' }, label), h('div', { class: 'v' }, valeur))
    : null;
}

function blocPremix(recipe, { cl, label }, unite) {
  const p = premix(recipe, cl);
  if (!p) return null;
  return h('div', { class: 'rec-premix' },
    h('div', { class: 'rec-premix-head' },
      h('span', { class: 'eyebrow' }, `Prémix ${label}`),
      h('span', { class: 'rec-premix-rendu' }, `${p.parts} ${unite} · ${p.rempli} cl`)),
    h('ul', { class: 'fiche-ing' }, p.lignes.map((l) =>
      h('li', { class: l.auVerre ? 'rec-au-verre' : '' },
        h('span', { class: 'fi-label' }, l.label),
        h('span', { class: 'fi-qty' }, l.qty)))));
}

function ficheCard(p, unite) {
  const r = p.recipe;
  return h('article', { class: 'rec-card' },
    h('header', { class: 'rec-card-head' },
      h('h4', {}, p.name),
      p.desc ? h('div', { class: 'rec-desc' }, p.desc) : null),
    h('div', { class: 'fiche-reps' },
      repere('Technique', r.technique),
      repere('Verre', r.verre),
      repere('Finition', r.finition)),
    h('ul', { class: 'fiche-ing' }, (r.ingredients || []).map((i) =>
      h('li', {}, h('span', { class: 'fi-label' }, i.label), h('span', { class: 'fi-qty' }, i.qty)))),
    unite
      ? h('div', { class: 'rec-premixes' }, BOUTEILLES.map((b) => blocPremix(r, b, unite)).filter(Boolean))
      : null);
}

// Les produits qui ont quelque chose à raconter, rangés comme sur la carte.
function recettes() {
  return state.products
    .filter((p) => p.recipe?.ingredients?.length && p.available !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function renderRecettes(container) {
  clear(container);
  const page = h('div', { class: 'rec-page' });

  const toutes = recettes();

  page.append(h('header', { class: 'rec-hero' },
    h('h1', {}, 'Recettes'),
    h('div', { class: 'tag' }, `${toutes.length} fiches · le classeur du bar`)));

  if (!toutes.length) {
    page.append(h('div', { class: 'rec-vide' },
      h('div', { class: 'big' }, 'Aucune fiche technique'),
      h('div', { class: 'faint' }, 'Les recettes se saisissent depuis l’onglet Produits.')));
    container.append(page);
    return;
  }

  for (const cat of state.categories) {
    const prods = toutes.filter((p) => p.categoryId === cat.id);
    if (!prods.length) continue;
    const unite = PREMIXABLES.get(cat.id);

    const bloc = h('section', { class: 'rec-cat' }, h('h2', {}, cat.name));

    // Un dépliant par sous-famille : c'est le rangement que le bar a déjà en
    // tête (Gin, Rhum, Spritz…). Une famille sans sous-famille n'en fait qu'un,
    // à son nom. Le premier de chaque famille s'ouvre : un écran entièrement
    // replié ne montre rien de ce qu'il contient.
    const subs = [...new Set(prods.map((p) => p.sub || cat.name))];
    subs.forEach((sub, i) => {
      const dedans = prods.filter((p) => (p.sub || cat.name) === sub);
      bloc.append(h('details', { class: 'rec-groupe', open: i === 0 },
        h('summary', {},
          h('span', { class: 'rec-sum-nom' }, sub),
          h('span', { class: 'rec-sum-n' }, `${dedans.length}`)),
        h('div', { class: 'rec-grille' }, dedans.map((p) => ficheCard(p, unite)))));
    });

    page.append(bloc);
  }

  page.append(h('div', { class: 'rec-pied' },
    'Prémix : une dose × le nombre de verres que tient la bouteille. '
    + 'Avec agrumes frais, 48 h au frigo — bouteille étiquetée et datée.'));

  container.append(page);
}
