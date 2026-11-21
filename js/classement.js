// classement.js — le rangement des cocktails : un type ET un ou plusieurs alcools.
//
// Avant, chaque produit n'avait qu'une case « sous-famille » qui servait à deux
// choses à la fois : tantôt l'alcool (Gin, Rhum…), tantôt le type (Spritz, Sans
// Alcool). Un cocktail porte maintenant deux étiquettes distinctes — `type` et
// `alcools` — et peut se montrer dans une seconde famille (`aussi`) : un
// cocktail d'hiver à la vodka est à la fois dans Hiver et dans Cocktails › Vodka.
//
// Ce module ne dépend de rien : la carte par défaut (seed.js) et les retouches
// (migrations.js) s'en servent toutes les deux, pour dire la même chose.

export const TYPES = ['Signature', 'Création', 'Classique', 'Spritz', 'Sans alcool'];
export const ALCOOLS = ['Gin', 'Rhum', 'Vodka', 'Tequila', 'Whisky & Cognac'];

// Une couleur par alcool : en service on repère la touche à sa couleur avant
// de lire son nom.
export const ALCOOL_COLORS = {
  'Gin': '#5CC8A8',
  'Rhum': '#F0B94A',
  'Vodka': '#8DB8F2',
  'Tequila': '#B9D86E',
  'Whisky & Cognac': '#F2986A',
};

// Les familles dont les fiches sont des cocktails : la carte permanente et les
// cartes de saison, qui se montrent aussi dans Cocktails.
export const FAMILLES_COCKTAILS = ['cocktails', 'hiver', 'halloween'];

// D'après la carte imprimée (menu-6199-2) ; tout le reste est une création.
const SIGNATURES = ['Le Bluebird'];
const CLASSIQUES = ['Mojito', 'Negroni', 'Old Fashioned', 'Margarita', 'Pina Colada', 'Cosmopolitan'];

/**
 * Le classement de départ d'un cocktail, déduit de son ancienne sous-famille
 * et de son nom. Renvoie null pour ce qui n'est pas un cocktail.
 */
export function classeCocktail(p) {
  if (!p || !FAMILLES_COCKTAILS.includes(p.categoryId)) return null;
  const sub = (p.sub || '').trim();
  const out = { type: 'Création', alcools: [] };
  if (ALCOOLS.includes(sub)) out.alcools = [sub];
  if (sub === 'Spritz') out.type = 'Spritz';
  else if (/^sans alcool$/i.test(sub)) out.type = 'Sans alcool';
  else if (SIGNATURES.includes(p.name)) out.type = 'Signature';
  else if (CLASSIQUES.includes(p.name)) out.type = 'Classique';
  if (p.categoryId !== 'cocktails') out.aussi = ['cocktails'];
  return out;
}
