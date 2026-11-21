// rangement.js — l'architecture des touches : famille → rangement → produits.
//
// Toucher une famille n'ouvre plus une longue grille paginée : elle ouvre une
// page de grosses tuiles (Signature, Créations, Classiques… puis Gin, Rhum,
// Vodka…). On en touche une, et tous ses produits tiennent sur une page.
//
// Rien n'est stocké à part : les rangements se lisent sur les fiches (`type`,
// `alcools`, `aussi`). Ajouter un cocktail « Création » à la vodka le fait
// apparaître de lui-même dans les deux tuiles.
//
// Partagé par les quatre écrans à touches (note et comptoir, iPad et téléphone).
import { state } from './state.js';
import { h } from './ui.js';
import { catColor, tileStyle } from './pos.js';
import { TYPES, ALCOOLS, ALCOOL_COLORS } from './classement.js';

export const inFamily = (p, catId) => p.categoryId === catId || (p.aussi || []).includes(catId);
export const familyProducts = (catId) => state.products.filter((p) => inFamily(p, catId));

export const alcoolsOf = (p) => (Array.isArray(p.alcools) ? p.alcools.filter(Boolean) : []);
// Une fiche sans type ni alcool se range par son ancienne sous-famille : les
// bières gardent « Pressions / Bouteilles » sans qu'on ait rien à leur écrire.
export const typeOf = (p) => p.type || (alcoolsOf(p).length ? '' : (p.sub || ''));

const PLURIEL = { 'Création': 'Créations', 'Classique': 'Classiques' };
const typeLabel = (v) => PLURIEL[v] || v;
const catName = (id) => state.categories.find((c) => c.id === id)?.name || id;

// Les valeurs connues d'abord, dans leur ordre ; les autres comme elles viennent.
function ordonne(valeurs, ref) {
  const vus = [...new Set(valeurs.filter(Boolean))];
  return [...ref.filter((v) => vus.includes(v)), ...vus.filter((v) => !ref.includes(v))];
}

/** Les rangements d'une famille, par sections : [{ title, items: [{ key, value, label, color }] }]. */
export function groupsOf(catId) {
  const all = familyProducts(catId);
  const types = ordonne(all.map(typeOf), TYPES);
  const alcools = ordonne(all.flatMap(alcoolsOf), ALCOOLS);
  const cartes = [...new Set(all.filter((p) => p.categoryId !== catId).map((p) => p.categoryId))];
  const sections = [];
  if (types.length) sections.push({ title: alcools.length ? 'Par type' : '',
    items: types.map((v) => ({ key: 'type', value: v, label: typeLabel(v), color: null })) });
  if (alcools.length) sections.push({ title: 'Par alcool',
    items: alcools.map((v) => ({ key: 'alcool', value: v, label: v, color: ALCOOL_COLORS[v] || null })) });
  if (cartes.length) sections.push({ title: 'Cartes du moment',
    items: cartes.map((id) => ({ key: 'carte', value: id, label: catName(id), color: catColor(id) })) });
  return sections;
}

/** Une famille n'a une page de rangements que s'il y a vraiment de quoi choisir. */
// Une petite famille (la carte d'hiver, quatre touches) tient déjà sur une
// page : lui ajouter un étage ne ferait que coûter une touche de plus.
const TIENT_SUR_UNE_PAGE = 12;
export function hasGroups(catId) {
  if (familyProducts(catId).length <= TIENT_SUR_UNE_PAGE) return false;
  return groupsOf(catId).reduce((n, s) => n + s.items.length, 0) >= 2;
}

/** La navigation en entrant dans une famille. */
export function enterFamily(catId) {
  return { level: hasGroups(catId) ? 'groups' : 'products', catId, group: null, page: 0 };
}

export function matches(p, g) {
  if (!g) return true;
  if (g.key === 'type') return typeOf(p) === g.value;
  if (g.key === 'alcool') return alcoolsOf(p).includes(g.value);
  if (g.key === 'carte') return p.categoryId === g.value;
  return true;
}
export const productsIn = (catId, g) => familyProducts(catId).filter((p) => matches(p, g));
export const groupLabel = (g) => (!g ? 'Tout' : g.label || g.value);

/**
 * La petite ligne au-dessus du nom : ce que le rangement ouvert ne dit pas déjà.
 * Dans « Créations » on lit l'alcool, dans « Vodka » on lit le type.
 */
export function eyebrow(p, g, catId) {
  const parts = [];
  const alcools = alcoolsOf(p);
  if (g?.key === 'alcool') { if (typeOf(p)) parts.push(typeOf(p)); }
  else if (alcools.length) parts.push(alcools.join(' · '));
  else if (g?.key !== 'type' && typeOf(p)) parts.push(typeOf(p));
  if (catId && p.categoryId !== catId && g?.key !== 'carte') parts.push(catName(p.categoryId));
  return parts.join(' · ');
}

/** Couleur d'une touche : celle qu'on lui a choisie, sinon son alcool, sinon sa famille. */
export const prodColor = (p) => p.color || ALCOOL_COLORS[alcoolsOf(p)[0]] || catColor(p.categoryId);

const prices = (p, money) => (p.variants || []).map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · ');

/** Le contenu d'une touche produit (ligne du haut, nom, prix). */
export function productTileParts(p, g, catId, money) {
  const haut = eyebrow(p, g, catId);
  return [
    haut ? h('div', { class: 'te' }, haut) : null,
    h('div', { class: 'tt' }, p.name),
    h('div', { class: 'tp' }, prices(p, money)),
  ];
}

/** Une tuile de rangement. */
export function groupTile(item, catId, onclick) {
  const n = productsIn(catId, item).filter((p) => p.available !== false).length;
  return h('button', {
    class: `tile group-tile ${item.color ? '' : 'neutre'}`,
    style: item.color ? tileStyle(item.color) : null,
    onclick,
  },
    h('span', { class: 'tcount' }, String(n)),
    h('div', { class: 'tt' }, item.label));
}

/**
 * La page des rangements d'une famille. `onPick(item)` reçoit le rangement
 * touché, ou null pour « Tout voir ».
 */
export function groupPage(catId, onPick) {
  const page = h('div', { class: 'group-page' });
  const sections = groupsOf(catId);
  sections.forEach((s, i) => {
    const tiles = s.items.map((it) => groupTile(it, catId, () => onPick(it)));
    // « Tout voir » ferme la dernière rangée : c'est la sortie de secours quand
    // on ne sait plus où un produit est rangé.
    if (i === sections.length - 1) tiles.push(toutVoir(catId, onPick));
    page.append(
      s.title ? h('div', { class: 'group-title' }, s.title) : null,
      h('div', { class: 'group-grid' }, tiles));
  });
  return page;
}

function toutVoir(catId, onPick) {
  const n = familyProducts(catId).filter((p) => p.available !== false).length;
  return h('button', { class: 'tile group-tile neutre', onclick: () => onPick(null) },
    h('span', { class: 'tcount' }, String(n)),
    h('div', { class: 'tt' }, 'Tout voir'));
}

/** Le fil en haut de la grille : ‹ Familles / Cocktails / Créations. */
export function crumbs(nav, go) {
  const out = [h('button', { class: 'chip crumb', onclick: () => go({ level: 'cats', catId: null, group: null, page: 0 }) }, '‹ Familles')];
  if (!nav.catId) return out;
  const groupes = hasGroups(nav.catId);
  const surFamille = nav.level === 'groups' || !groupes;
  out.push(h('button', {
    class: `chip crumb ${surFamille ? 'active' : ''}`,
    onclick: () => go(enterFamily(nav.catId)),
  }, catName(nav.catId)));
  if (nav.level === 'products' && groupes) out.push(h('span', { class: 'chip crumb active' }, groupLabel(nav.group)));
  return out;
}

// ── Formulaire : type et alcools d'une fiche ─────────────────
/** Deux champs pour ranger une touche. Renvoie { el, get() }. */
export function classFields(product, catId) {
  const famille = catId ? familyProducts(catId) : state.products;
  const types = ordonne([...TYPES, ...famille.map((p) => p.type)], TYPES);
  const connus = ordonne([...ALCOOLS, ...state.products.flatMap(alcoolsOf)], ALCOOLS);
  const choisis = new Set(alcoolsOf(product));

  const listId = `types-${Math.random().toString(36).slice(2, 8)}`;
  const type = h('input', { class: 'input', value: product.type || '', placeholder: 'ex. Création, Classique…', list: listId });
  const datalist = h('datalist', { id: listId }, types.map((v) => h('option', { value: v })));

  const row = h('div', { class: 'opt-toggle' });
  connus.forEach((a) => {
    const b = h('button', { class: `chip ${choisis.has(a) ? 'active' : ''}`, type: 'button', onclick: () => {
      if (choisis.has(a)) choisis.delete(a); else choisis.add(a);
      b.classList.toggle('active', choisis.has(a));
    } }, a);
    row.append(b);
  });
  const autre = h('input', { class: 'input', placeholder: 'Autre alcool (optionnel)', style: 'margin-top:8px' });

  const el = h('div', { class: 'class-fields' },
    h('div', { class: 'field' }, h('label', {}, 'Rangement (Signature, Création, Classique…)'), type, datalist),
    h('div', { class: 'field' }, h('label', {}, 'Alcool(s) — la touche apparaît dans chacun'), row, autre));

  return {
    el,
    get: () => {
      const extra = autre.value.split(',').map((s) => s.trim()).filter(Boolean);
      return { type: type.value.trim(), alcools: ordonne([...choisis, ...extra], ALCOOLS) };
    },
  };
}
