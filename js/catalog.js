// catalog.js — gestion du catalogue (produits, prix, variantes, options, dispo).
import { state, reloadCatalog, money } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { requirePin } from './app.js';
import { colorPicker } from './pos.js';
import { isCuisineProduct } from './kitchen.js';
import { groupsEditor, manageLibrary } from './options.js';

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function renderCatalog(container) {
  clear(container);
  if (state.settings.pin && !(await requirePin('Accès aux produits'))) {
    container.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, 'Produits verrouillés'),
      h('button', { class: 'btn btn-primary', onclick: () => renderCatalog(container) }, 'Déverrouiller')));
    return;
  }

  container.append(h('div', { class: 'viewbar' },
    h('h2', {}, 'Produits'),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn', onclick: async () => { await manageLibrary(); renderCatalog(container); } }, '🔗 Sous-familles'),
    h('button', { class: 'btn btn-primary', onclick: () => editProduct(null, container) }, '＋ Nouveau produit'),
  ));

  const wrap = h('div', { class: 'catalog' });
  for (const cat of state.categories) {
    const prods = state.products.filter((p) => p.categoryId === cat.id);
    if (!prods.length) continue;
    const block = h('div', { class: 'cat-block' }, h('h3', { class: 'cat-title' }, cat.name));
    let lastSub = null;
    for (const p of prods) {
      if (p.sub !== lastSub) { block.append(h('div', { class: 'eyebrow', style: 'margin:14px 0 8px' }, p.sub)); lastSub = p.sub; }
      block.append(renderRow(p, container));
    }
    wrap.append(block);
  }
  container.append(wrap);
}

function renderRow(p, container) {
  const prices = p.variants.map((v) => `${v.label ? v.label + ' ' : ''}${money(v.price)}`).join(' · ');
  return h('div', { class: `prod-row ${p.available ? '' : 'unavail'}` },
    h('div', { class: 'meta' },
      h('div', { class: 'n' }, p.name,
        p.happyHour ? h('span', { class: 'badge hh', style: 'margin-left:8px' }, '1+1') : null,
        p.recipe?.ingredients?.length ? h('span', { class: 'badge fiche', style: 'margin-left:8px' }, 'Fiche') : null,
        !p.available ? h('span', { class: 'badge off', style: 'margin-left:8px' }, 'Rupture') : null),
      p.desc ? h('div', { class: 'd' }, p.desc) : null),
    h('div', { class: 'prices' }, prices),
    h('div', { class: 'row', style: 'flex:0 0 auto; gap:6px' },
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => toggleAvail(p, container) }, p.available ? 'Rupture' : 'Réactiver'),
      h('button', { class: 'btn btn-sm', onclick: () => editProduct(p, container) }, 'Modifier')),
  );
}

async function toggleAvail(p, container) {
  p.available = !p.available;
  await store.put('products', p);
  await reloadCatalog();
  renderCatalog(container);
}

function variantRow(v = { label: '', price: 0 }) {
  const label = h('input', { class: 'input', value: v.label, placeholder: 'Format (ex. Verre)' });
  const price = h('input', { class: 'input', type: 'number', step: '0.1', min: 0, value: v.price, placeholder: 'Prix €' });
  const row = h('div', { class: 'row', style: 'align-items:center' },
    label, price,
    h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', onclick: () => row.remove() }, '✕'));
  row._get = () => ({ label: label.value.trim(), price: Number(price.value) || 0 });
  return row;
}

// ── Fiche technique ──────────────────────────────────────────
// La recette du bar : technique, verre, finition, et les ingrédients avec leur
// dose. Elle se lit depuis l'onglet Carte (menu.js) ; elle s'écrit ici.
// Un produit sans ingrédient n'a pas de fiche : le bloc reste replié et rien
// n'est enregistré, une eau gazeuse n'a pas de recette.
const TECHNIQUES = ['Shake', 'Verre à mélange', 'Build', 'Throwing', 'Blender'];
const VERRES = ['Coupette', 'Tumbler', 'Old Fashioned', 'Long drink', 'Flûte', 'Highball', 'Shooter'];

function ingredientRow(i = { label: '', qty: '' }, onRemove = () => {}) {
  const label = h('input', { class: 'input', value: i.label, placeholder: 'Ingrédient (ex. Gin Hendrick’s)' });
  // Texte libre et non un nombre : la carte dit aussi « TOP », « 2 dash ».
  const qty = h('input', { class: 'input', style: 'flex:0 0 110px', value: i.qty, placeholder: 'Dose' });
  const row = h('div', { class: 'row', style: 'align-items:center' },
    label, qty,
    h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', onclick: () => { row.remove(); onRemove(); } }, '✕'));
  row._get = () => ({ label: label.value.trim(), qty: qty.value.trim() });
  return row;
}

// Photo ou schéma de montage. Une photo d'iPad pèse plusieurs mégaoctets et
// partirait telle quelle dans la synchro, puis dans la base de chaque appareil :
// on la redescend à 800 px et on baisse la qualité jusqu'à passer sous la
// limite. Au-delà, on refuse plutôt que d'engorger le bar. 800 px suffit
// largement : la fiche l'affiche sur 230 px de haut.
const PHOTO_MAX_PX = 800;
const PHOTO_MAX_OCTETS = 120 * 1024;

async function compressePhoto(file) {
  // Le chemin <img> plutôt que createImageBitmap : c'est celui que Safari sait
  // prendre pour un HEIC, le format des photos de l'iPad.
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    await new Promise((ok, ko) => { im.onload = ok; im.onerror = () => ko(new Error('illisible')); im.src = url; });
    const ratio = Math.min(1, PHOTO_MAX_PX / Math.max(im.naturalWidth, im.naturalHeight));
    const canvas = h('canvas', { width: Math.round(im.naturalWidth * ratio), height: Math.round(im.naturalHeight * ratio) });
    canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
    for (const q of [0.78, 0.66, 0.55, 0.45]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= PHOTO_MAX_OCTETS) return data;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

function photoEditor(initial) {
  let data = initial || null;
  const apercu = h('img', { class: 'fiche-vignette', alt: '' });
  const input = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: async () => {
      const f = input.files?.[0];
      input.value = '';                       // rechoisir le même fichier doit remarcher
      if (!f) return;
      let compressee;
      try { compressee = await compressePhoto(f); }
      catch { toast('Image illisible'); return; }
      if (!compressee) { toast('Image trop lourde, même réduite'); return; }
      data = compressee;
      peindre();
    },
  });
  const choisir = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => input.click() }, '');
  const retirer = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { data = null; peindre(); } }, 'Retirer');
  const el = h('div', { class: 'row', style: 'align-items:center' }, input, apercu, choisir, retirer);

  function peindre() {
    apercu.hidden = !data;
    if (data) apercu.src = data;
    retirer.hidden = !data;
    clear(choisir).append(document.createTextNode(data ? 'Remplacer' : '🖼 Photo ou schéma'));
  }
  peindre();
  return { el, get: () => data };
}

function recipeEditor(p) {
  const r = p.recipe || {};
  const avait = !!r.ingredients?.length;
  const photo = photoEditor(r.image);

  const suggestions = (id, valeurs) => h('datalist', { id }, valeurs.map((v) => h('option', { value: v })));
  const champ = (valeur, placeholder, listId) =>
    h('input', { class: 'input', value: valeur || '', placeholder, list: listId });

  const technique = champ(r.technique, 'Technique', 'fiche-techniques');
  const verre = champ(r.verre, 'Verre', 'fiche-verres');
  const finition = champ(r.finition, 'Finition (ex. Foam)', null);

  const ligne = (i) => ingredientRow(i, () => libelle());
  const box = h('div', { class: 'field' }, (r.ingredients || []).map((i) => ligne(i)));
  const add = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { box.append(ligne()); libelle(); } }, '＋ Ingrédient');

  const corps = h('div', { hidden: !avait, style: 'display:grid; gap:8px; margin-top:8px' },
    suggestions('fiche-techniques', TECHNIQUES), suggestions('fiche-verres', VERRES),
    h('div', { class: 'row' }, technique, verre, finition),
    box, add, photo.el);

  const bascule = h('button', { class: 'btn btn-sm btn-ghost', style: 'width:100%; justify-content:flex-start',
    onclick: () => {
      corps.hidden = !corps.hidden;
      // Ouvrir une fiche vide sans ligne à remplir ne servirait à rien.
      if (!corps.hidden && !box.children.length) box.append(ligne());
      libelle();
    } }, '');
  const libelle = () => {
    const n = [...box.children].filter((r) => r._get().label).length;
    clear(bascule).append(document.createTextNode(
      `${corps.hidden ? '▸' : '▾'} Fiche technique${n ? ` · ${n} ingrédient${n > 1 ? 's' : ''}` : ' · aucune'}`));
  };
  libelle();
  box.addEventListener('input', libelle);

  return {
    el: h('div', {}, bascule, corps),
    // Pas d'ingrédient, pas de fiche : les trois champs du haut seuls ne font
    // pas une recette, et une fiche vide s'afficherait sur la carte.
    get() {
      const ingredients = [...box.children].map((r) => r._get()).filter((i) => i.label);
      if (!ingredients.length) return null;
      const image = photo.get();
      return {
        ...(technique.value.trim() ? { technique: technique.value.trim() } : {}),
        ...(verre.value.trim() ? { verre: verre.value.trim() } : {}),
        ...(finition.value.trim() ? { finition: finition.value.trim() } : {}),
        ingredients,
        ...(image ? { image } : {}),
      };
    },
  };
}

async function editProduct(p, container) {
  const isNew = !p;
  p = p || { name: '', categoryId: state.categories[0]?.id || '__new__', sub: '', variants: [{ label: '', price: 0 }], options: [], happyHour: false, available: true, desc: '' };

  const name = h('input', { class: 'input', value: p.name, placeholder: 'Nom du produit' });
  const catSel = h('select', { class: 'input', onchange: () => { newCatWrap.hidden = catSel.value !== '__new__'; } },
    state.categories.map((c) => h('option', { value: c.id, selected: c.id === p.categoryId }, c.name)),
    h('option', { value: '__new__' }, '＋ Nouvelle catégorie…'));
  const newCatName = h('input', { class: 'input', placeholder: 'Nom de la nouvelle catégorie' });
  const newCatColor = colorPicker('#4FA3C7');
  const newCatWrap = h('div', { hidden: p.categoryId !== '__new__', style: 'margin-top:8px; display:grid; gap:8px' },
    newCatName, newCatColor.el);
  const sub = h('input', { class: 'input', value: p.sub || '', placeholder: 'Sous-catégorie (ex. Classiques)' });
  const desc = h('input', { class: 'input', value: p.desc || '', placeholder: 'Composition / description (optionnel)' });

  const variantsBox = h('div', { class: 'field' }, p.variants.map(variantRow));
  const addVariant = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => variantsBox.append(variantRow()) }, '＋ Format');
  // Sous-familles de choix (Sauce, Cuisson…), demandées à l'ajout du produit.
  // L'éditeur récupère aussi l'ancienne liste plate du produit, s'il en a une.
  const groups = groupsEditor(p);
  const recipe = recipeEditor(p);

  const hh = h('input', { type: 'checkbox', checked: !!p.happyHour });
  const avail = h('input', { type: 'checkbox', checked: p.available !== false });
  // Par défaut le produit suit sa famille ; cette case fige son cas particulier.
  const cuisine = h('input', { type: 'checkbox', checked: isCuisineProduct(p) });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    field('Nom', name),
    h('div', { class: 'row' }, field('Catégorie', catSel), field('Sous-catégorie', sub)),
    newCatWrap,
    field('Description', desc),
    field('Formats & prix', h('div', {}, variantsBox, addVariant)),
    field('Sous-choix demandés à l\'ajout (sauce, parfum, cuisson…)', groups.el),
    field('Recette du bar (lue depuis l\'onglet Carte)', recipe.el),
    h('label', { class: 'switch' }, hh, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Éligible Bluebird\'s Hour (1+1)')),
    h('label', { class: 'switch' }, avail, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Disponible')),
    h('label', { class: 'switch' }, cuisine, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Bon de cuisine (part au Bluebird)')),
  );

  const actions = [{ label: 'Annuler', value: null }, { label: isNew ? 'Créer' : 'Enregistrer', kind: 'primary', value: 'save' }];
  if (!isNew) actions.unshift({ label: 'Supprimer', kind: 'danger', value: 'del' });

  const v = await modal({ title: isNew ? 'Nouveau produit' : 'Modifier le produit', body, actions });

  if (v === 'del') {
    if (await confirmDialog(`Supprimer « ${p.name} » du catalogue ?`, { okLabel: 'Supprimer', danger: true })) {
      await store.del('products', p.id); await reloadCatalog(); renderCatalog(container); toast('Produit supprimé');
    }
    return;
  }
  if (v !== 'save') return;
  if (!name.value.trim()) { toast('Le nom est requis'); return; }

  // Catégorie : existante, ou création à la volée si « ＋ Nouvelle catégorie… ».
  let categoryId = catSel.value;
  if (categoryId === '__new__') {
    const nm = newCatName.value.trim();
    if (!nm) { toast('Nom de la nouvelle catégorie requis'); return; }
    categoryId = slug(nm);
    while (state.categories.some((c) => c.id === categoryId)) categoryId += '-2';
    await store.put('categories', { id: categoryId, name: nm, color: newCatColor.get(), order: state.categories.length });
  }

  const variants = [...variantsBox.children].map((r) => r._get()).filter((x) => x.label !== '' || x.price > 0);
  if (!variants.length) variants.push({ label: '', price: 0 });

  const obj = {
    ...p,
    name: name.value.trim(), categoryId, sub: sub.value.trim(), desc: desc.value.trim(),
    variants,
    // L'éditeur a repris l'ancienne liste plate dans ses sous-familles : on la
    // vide ici, sinon les choix apparaîtraient en double.
    options: [], optionGroups: groups.get(),
    happyHour: hh.checked, available: avail.checked,
    cuisine: cuisine.checked,
  };
  // Fiche vidée de ses ingrédients : on retire la clé plutôt que d'en laisser
  // une coquille, que la carte prendrait pour une recette à afficher.
  const fiche = recipe.get();
  if (fiche) obj.recipe = fiche; else delete obj.recipe;
  if (isNew) { obj.id = `${categoryId}-${slug(obj.name)}-${Date.now().toString(36).slice(-4)}`; obj.order = state.products.length; }
  await store.put('products', obj);
  await reloadCatalog();
  renderCatalog(container);
  toast(isNew ? 'Produit créé' : 'Produit enregistré');
}
