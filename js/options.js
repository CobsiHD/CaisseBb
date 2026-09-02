// options.js — sous-choix d'un produit (sauces, cuisson, suppléments…).
//
// Un produit peut porter des « sous-familles » de choix : Sauce (un seul choix),
// Suppléments (plusieurs). On les demande au moment où le produit arrive sur la
// note, et les choix retenus atterrissent dans `item.options` — la liste plate
// qui existait déjà — pour que le calcul du prix, le ticket et le bon de cuisine
// n'aient rien de nouveau à apprendre.
import { h, clear, modal, field, toast } from './ui.js';
import { state, money, reloadCatalog } from './state.js';
import * as store from './store.js';

// ── Modèle ───────────────────────────────────────────────────
// product.optionGroups = [{ name, multi, required, count, choices: [{ label, delta }] }]
// `count` (groupes à choix multiple) : nombre EXACT de choix attendus — 3 tapas
// sur la planche, ni 2 ni 4. 0 = libre. Un groupe compté est obligatoire de fait :
// on ne peut pas en cocher 3 et n'en vouloir aucun.
// Un groupe sans nom ou sans choix n'existe pas : on l'ignore partout plutôt
// que d'ouvrir un dialogue vide au serveur en plein coup de feu.
//
// La carte d'origine rangeait ces choix dans une liste plate `product.options`
// (les sauces des frites, les parfums du sirop, le diluant des whiskies). On la
// relit comme une sous-famille : une seule notion dans toute l'appli, et ces
// produits se mettent à demander leur choix sans qu'on ait à ressaisir la carte.
// Le champ se vide de lui-même dès qu'on enregistre le produit depuis l'éditeur.
export const LEGACY_GROUP = 'Options';

const cleanChoices = (list) => (list || [])
  .filter((c) => c && String(c.label || '').trim())
  .map((c) => ({ label: String(c.label).trim(), delta: Number(c.delta) || 0 }));

// ── Bibliothèque partagée ────────────────────────────────────
// Une sous-famille peut vivre dans la table `optiongroups` et être référencée
// par plusieurs produits : { ref: 'sauces' }. La modifier une fois la modifie
// partout — c'est tout l'intérêt, six sauces sur quatre snacks ne se corrigent
// pas quatre fois. Un produit peut aussi garder une sous-famille à lui, écrite
// en clair dans son propre enregistrement.
export function library() {
  return [...(state.optionGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function libraryGroup(id) {
  return (state.optionGroups || []).find((g) => g.id === id) || null;
}

const normalize = (g, ref = null) => {
  const multi = !!g?.multi;
  // Un compte ne veut rien dire sur un choix unique : on l'ignore plutôt que
  // d'exiger 3 sauces dans un groupe où l'on n'en coche qu'une.
  const count = multi ? Math.max(0, Math.trunc(Number(g?.count) || 0)) : 0;
  return {
    ref,
    name: (g?.name || '').trim(),
    multi,
    required: !!g?.required || count > 0,
    count,
    choices: cleanChoices(g?.choices),
  };
};

export function productGroups(product) {
  const groups = [];
  for (const g of product?.optionGroups || []) {
    // Un lien vers une sous-famille supprimée depuis disparaît sans bruit :
    // mieux vaut une pastille en moins qu'un dialogue vide en plein service.
    if (g?.ref) { const lib = libraryGroup(g.ref); if (lib) groups.push(normalize(lib, g.ref)); continue; }
    groups.push(normalize(g));
  }

  const flat = cleanChoices(product?.options);
  if (flat.length && !groups.some((g) => g.name === LEGACY_GROUP)) {
    // Ces choix se cochaient librement et n'ont jamais été obligatoires :
    // on garde exactement ce comportement.
    groups.push({ ref: null, name: LEGACY_GROUP, multi: true, required: false, count: 0, choices: flat });
  }
  return groups.filter((g) => g.name && g.choices.length);
}

// Combien de produits portent cette sous-famille partagée ? Sert à prévenir
// avant de la modifier ou de la supprimer.
export function libraryUsage(id) {
  return (state.products || []).filter((p) =>
    (p.optionGroups || []).some((g) => g?.ref === id)).length;
}

export function hasGroups(product) { return productGroups(product).length > 0; }

// Signature d'une liste d'options : deux lignes qui se ressemblent doivent
// fusionner (2× Frites sauce curry), deux lignes différentes rester séparées.
export function optionsKey(options) {
  return (options || []).map((o) => `${o.group || ''}|${o.label}`).sort().join('§');
}

const choiceLabel = (c) => (c.delta ? `${c.label} (+${money(c.delta)})` : c.label);

// Ce qu'on annonce sous le nom d'une sous-famille.
const hintFor = (g) => (g.count ? `${g.count} au choix`
  : g.required ? (g.multi ? 'au moins un' : 'obligatoire')
  : (g.multi ? 'plusieurs possibles' : 'facultatif'));

// ── Sélecteur (pastilles) ────────────────────────────────────
// Réutilisé à l'ajout d'un produit et dans l'édition d'une ligne.
// Renvoie { el, get(), missing() }.
export function groupsPicker(product, preselected = []) {
  const groups = productGroups(product);
  const chosen = new Map(groups.map((g) => [g.name, new Set(
    (preselected || [])
      .filter((o) => o.group === g.name && g.choices.some((c) => c.label === o.label))
      .map((o) => o.label))]));

  const el = h('div', { class: 'optgroups' });

  for (const g of groups) {
    const set = chosen.get(g.name);
    const row = h('div', { class: 'opt-toggle' });
    const hintEl = h('span', { class: 'faint', style: 'font-weight:600' });
    // Un groupe compté affiche où il en est (2/3) : le serveur voit d'un coup
    // d'œil ce qu'il reste à cocher, sans avoir à compter les pastilles.
    const paint = () => {
      row.querySelectorAll('.chip').forEach((ch) => {
        const on = set.has(ch.dataset.label);
        ch.classList.toggle('active', on);
        // Quand le compte est atteint, les pastilles restantes s'éteignent :
        // on ne propose pas un geste qu'on refusera juste après.
        ch.classList.toggle('opt-full', !on && g.count > 0 && set.size >= g.count);
      });
      hintEl.textContent = ` · ${g.count ? `${set.size}/${g.count}` : hintFor(g)}`;
    };

    for (const c of g.choices) {
      row.append(h('button', {
        class: 'chip',
        dataset: { label: c.label },
        onclick: () => {
          if (set.has(c.label)) set.delete(c.label);
          else if (g.count && set.size >= g.count) { toast(`${g.name} : ${g.count} au maximum`); return; }
          else { if (!g.multi) set.clear(); set.add(c.label); }
          paint();
        },
      }, choiceLabel(c)));
    }

    paint();
    el.append(field(h('span', {}, g.name, hintEl), row));
  }

  return {
    el,
    // Les choix, à plat, prêts à être posés sur la ligne de note.
    get() {
      const out = [];
      for (const g of groups) {
        for (const c of g.choices) {
          if (chosen.get(g.name).has(c.label)) out.push({ label: c.label, delta: c.delta, group: g.name });
        }
      }
      return out;
    },
    // Message du premier groupe mal rempli, sinon null. Un groupe compté n'est
    // pas seulement « vide ou plein » : 2 tapas sur 3, c'est encore incomplet.
    missing() {
      for (const g of groups) {
        const n = chosen.get(g.name).size;
        if (g.count) { if (n !== g.count) return `${g.name} : ${g.count} choix (${n} coché${n > 1 ? 's' : ''})`; continue; }
        if (g.required && n === 0) return `Choisis : ${g.name}`;
      }
      return null;
    },
  };
}

// Dialogue des sous-choix. Renvoie la liste des options, ou null si annulé.
export async function pickOptions(product, preselected = []) {
  const picker = groupsPicker(product, preselected);
  // On redemande tant qu'un groupe obligatoire est vide : le sélecteur garde son
  // état d'une passe à l'autre, le serveur ne perd rien de ce qu'il a déjà touché.
  for (;;) {
    const v = await modal({
      title: product.name,
      body: h('div', { class: 'modal-body', style: 'padding:0' }, picker.el),
      actions: [{ label: 'Annuler', value: null }, { label: 'Ajouter', kind: 'primary', value: 'ok' }],
    });
    if (v !== 'ok') return null;
    const missing = picker.missing();
    if (!missing) return picker.get();
    toast(missing);
  }
}

// ── Éditeur (écrans d'édition du catalogue) ──────────────────
// Renvoie { el, get() }. Deux sortes de boîtes :
//   • liée      — un lien vers la bibliothèque, non modifiable ici ;
//   • propre    — une sous-famille écrite dans le produit, modifiable ici.
export function groupsEditor(product) {
  const box = h('div', { class: 'optgroups-edit' });
  for (const g of productGroups(product)) {
    box.append(g.ref ? linkBox(g.ref) : groupBox(g));
  }

  // Les liens déjà posés, pour ne pas proposer deux fois la même.
  const linked = () => [...box.children].map((b) => b._get()).filter((g) => g?.ref).map((g) => g.ref);

  // Une liste déroulante native plutôt qu'un second dialogue : l'éditeur de
  // produit EST déjà une modale, et l'appli n'en tient qu'une à l'écran.
  const choisir = h('select', { class: 'input', onchange: () => {
    const id = choisir.value;
    choisir.value = '';
    if (id) box.append(linkBox(id));
    refresh();
  } });

  function refresh() {
    clear(choisir);
    const dejaLa = new Set(linked());
    const dispo = library().filter((g) => !dejaLa.has(g.id));
    choisir.append(h('option', { value: '' }, dispo.length
      ? '🔗 Utiliser une sous-famille partagée…'
      : 'Toutes les sous-familles partagées sont déjà là'));
    for (const g of dispo) {
      choisir.append(h('option', { value: g.id }, apercu(g)));
    }
    choisir.disabled = !dispo.length;
  }
  refresh();

  // Une boîte « liée » : on montre ce qu'elle contient sans permettre de la
  // retoucher ici — elle appartient à la bibliothèque, pas à ce produit.
  function linkBox(id) {
    const g = libraryGroup(id);
    const wrap = h('div', { class: 'optgroup-box lie' });
    wrap._get = () => ({ ref: id });
    if (!g) { wrap._get = () => null; return wrap; }

    wrap.append(
      h('div', { class: 'row', style: 'align-items:center' },
        h('div', { style: 'flex:1; min-width:0' },
          h('div', { style: 'font-weight:700' }, '🔗 ', g.name,
            h('span', { class: 'faint', style: 'font-weight:600' },
              `  ·  ${g.count ? `${g.count} au choix` : g.multi ? 'plusieurs choix' : 'un seul choix'}`
              + `${g.required && !g.count ? ' · obligatoire' : ''}`)),
          h('div', { class: 'faint', style: 'font-size:12px; margin-top:2px' },
            (g.choices || []).map((c) => c.label).join(', '))),
        h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', title: 'Retirer de ce produit',
          onclick: () => { wrap.remove(); refresh(); } }, '✕')),
      h('div', { class: 'faint', style: 'font-size:12px' },
        `Partagée avec ${Math.max(0, libraryUsage(id) - 1)} autre(s) produit(s) — modifiable dans « Sous-familles partagées ».`),
      h('button', { class: 'btn btn-sm btn-ghost', style: 'align-self:flex-start',
        title: 'En faire une sous-famille propre à ce produit',
        onclick: () => { wrap.replaceWith(groupBox({ ...g, choices: g.choices.map((c) => ({ ...c })) })); refresh(); } },
        '⛓ Détacher (copie propre à ce produit)'),
    );
    return wrap;
  }

  const el = h('div', {}, box,
    choisir,
    h('button', { class: 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: () => { box.append(groupBox()); refresh(); } },
      '＋ Sous-famille propre à ce produit'),
    h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' },
      'Une sous-famille partagée (les sauces, le diluant) se modifie une fois pour tous les produits qui l\'utilisent. '
      + 'Une sous-famille propre n\'existe que sur ce produit.'));

  return {
    el,
    get: () => [...box.children].map((b) => b._get()).filter((g) =>
      g && (g.ref || (g.name && g.choices.length))),
  };
}

// Intitulé d'une sous-famille dans une liste : le nom seul ne suffit pas — les
// produits venus de la carte d'origine ont tous des choix nommés « Options ».
export function apercu(group) {
  const noms = (group.choices || []).slice(0, 3).map((c) => c.label).join(', ');
  const reste = (group.choices || []).length > 3 ? `… (${group.choices.length})` : '';
  return `${group.name} · ${noms}${reste}`;
}

function groupBox(g = { name: '', multi: false, required: false, count: 0, choices: [{ label: '', delta: 0 }] }) {
  const name = h('input', { class: 'input', value: g.name || '', placeholder: 'Nom du sous-choix (ex. Sauce)' });
  const multi = h('input', { type: 'checkbox', checked: !!g.multi, onchange: () => syncCount() });
  const required = h('input', { type: 'checkbox', checked: !!g.required });
  const count = countRow(g);
  const choices = h('div', { class: 'field' }, (g.choices || []).map(choiceRow));
  const syncCount = () => { count.el.hidden = !multi.checked; };

  const box = h('div', { class: 'optgroup-box' },
    h('div', { class: 'row', style: 'align-items:center' },
      name,
      h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', title: 'Supprimer cette sous-famille', onclick: () => box.remove() }, '✕')),
    choices,
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => choices.append(choiceRow()) }, '＋ Choix'),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('label', { class: 'switch' }, multi, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Plusieurs choix')),
      h('label', { class: 'switch' }, required, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Obligatoire'))),
    count.el,
  );
  syncCount();

  box._get = () => ({
    name: name.value.trim(),
    multi: multi.checked,
    required: required.checked,
    count: multi.checked ? count.get() : 0,
    choices: [...choices.children].map((r) => r._get()).filter((c) => c.label),
  });
  return box;
}

// Le nombre exact de choix attendus. Séparé de « Obligatoire » : un groupe
// compté l'est déjà, et l'inverse n'est pas vrai (les sauces, autant qu'on veut).
function countRow(g) {
  const input = h('input', { class: 'input', type: 'number', min: 0, step: 1, value: g?.count || 0 });
  const el = h('div', { class: 'field' },
    h('label', { class: 'muted' }, 'Nombre exact de choix'),
    input,
    h('div', { class: 'faint', style: 'font-size:12px' },
      '0 = libre. À 3, le serveur ne peut en cocher ni 2 ni 4.'));
  return { el, get: () => Math.max(0, Math.trunc(Number(input.value) || 0)) };
}

function choiceRow(c = { label: '', delta: 0 }) {
  const label = h('input', { class: 'input', value: c.label || '', placeholder: 'Choix (ex. Ketchup)' });
  const delta = h('input', { class: 'input', type: 'number', step: '0.5', value: c.delta || 0, placeholder: '+€' });
  const row = h('div', { class: 'row', style: 'align-items:center' },
    label, delta,
    h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', onclick: () => row.remove() }, '✕'));
  row._get = () => ({ label: label.value.trim(), delta: Number(delta.value) || 0 });
  return row;
}

// ── Bibliothèque : écran de gestion ──────────────────────────
// Un seul dialogue à l'écran dans cette appli : la liste et le formulaire
// s'échangent donc à l'intérieur de la même modale, comme l'éditeur de tuiles.
const slug = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sous-famille';

// Les sous-familles écrites en clair dans les produits (ou héritées de la
// liste plate d'origine), regroupées par contenu identique. Ce sont elles
// qu'on propose de verser dans la bibliothèque.
export function adoptables() {
  const byKey = new Map();
  for (const p of state.products || []) {
    for (const g of productGroups(p)) {
      if (g.ref) continue;                       // déjà partagée
      const key = `${g.name}|${g.choices.map((c) => c.label).join(',')}`;
      if (!byKey.has(key)) byKey.set(key, { group: g, products: [] });
      byKey.get(key).products.push(p.id);
    }
  }
  return [...byKey.values()].sort((a, b) => b.products.length - a.products.length);
}

// Verse une sous-famille dans la bibliothèque et relie tous les produits qui
// la portaient : c'est le geste qui fait passer la carte d'origine au partage.
// `nom` permet de la rebaptiser au passage : les sous-familles héritées de la
// carte s'appellent toutes « Options », ce qui ne veut rien dire une fois
// qu'elles vivent côte à côte dans une bibliothèque.
export async function adopt({ group, products }, nom = null) {
  const name = (nom || group.name).trim() || group.name;
  let id = slug(name);
  while (libraryGroup(id)) id += '-2';
  await store.put('optiongroups', {
    id, name, multi: group.multi, required: group.required, count: group.count || 0,
    choices: group.choices.map((c) => ({ ...c })), order: (state.optionGroups || []).length,
  });

  const key = `${group.name}|${group.choices.map((c) => c.label).join(',')}`;
  const touches = [];
  for (const p of state.products || []) {
    if (!products.includes(p.id)) continue;
    // On retire la version en clair (et l'ancienne liste plate si c'est d'elle
    // qu'elle venait) puis on pose le lien à sa place.
    const restants = (p.optionGroups || []).filter((g) => {
      if (g?.ref) return true;
      const n = normalize(g);
      return `${n.name}|${n.choices.map((c) => c.label).join(',')}` !== key;
    });
    const venaitDuPlat = group.name === LEGACY_GROUP
      && `${LEGACY_GROUP}|${cleanChoices(p.options).map((c) => c.label).join(',')}` === key;
    touches.push({ ...p, options: venaitDuPlat ? [] : p.options, optionGroups: [...restants, { ref: id }] });
  }
  if (touches.length) await store.bulkPut('products', touches);
  await reloadCatalog();
  return id;
}

// Formulaire d'une sous-famille de la bibliothèque.
function libForm(entry) {
  const name = h('input', { class: 'input', value: entry?.name || '', placeholder: 'Nom (ex. Sauce)' });
  const multi = h('input', { type: 'checkbox', checked: !!entry?.multi, onchange: () => syncCount() });
  const required = h('input', { type: 'checkbox', checked: !!entry?.required });
  const count = countRow(entry);
  const syncCount = () => { count.el.hidden = !multi.checked; };
  const choices = h('div', { class: 'field' }, (entry?.choices || [{ label: '', delta: 0 }]).map(choiceRow));
  const el = h('div', {},
    field('Nom', name),
    field('Choix', h('div', {}, choices,
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => choices.append(choiceRow()) }, '＋ Choix'))),
    h('div', { class: 'row' },
      h('label', { class: 'switch' }, multi, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Plusieurs choix')),
      h('label', { class: 'switch' }, required, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Obligatoire'))),
    count.el);
  syncCount();
  return { el, get: () => ({
    name: name.value.trim(), multi: multi.checked, required: required.checked,
    count: multi.checked ? count.get() : 0,
    choices: [...choices.children].map((r) => r._get()).filter((c) => c.label),
  }) };
}

export async function manageLibrary() {
  const liste = h('div');
  const edition = h('div', { hidden: true });
  const body = h('div', { class: 'modal-body', style: 'padding:0' }, liste, edition);

  function ouvrirListe() { edition.hidden = true; clear(edition); liste.hidden = false; renderListe(); }

  function renderListe() {
    clear(liste);

    const lib = library();
    liste.append(h('div', { class: 'eyebrow' }, 'Partagées'));
    if (!lib.length) {
      liste.append(h('div', { class: 'faint', style: 'font-size:13px; margin:4px 0 10px' },
        'Aucune pour l\'instant. Verse celles de la carte ci-dessous, ou crée-en une.'));
    }
    for (const g of lib) {
      const n = libraryUsage(g.id);
      liste.append(h('div', { class: 'optgroup-box' },
        h('div', { class: 'row', style: 'align-items:center' },
          h('div', { style: 'flex:1; min-width:0' },
            h('div', { style: 'font-weight:700' }, g.name),
            h('div', { class: 'faint', style: 'font-size:12px' }, (g.choices || []).map((c) => c.label).join(', ')),
            h('div', { class: 'faint', style: 'font-size:12px' },
              n ? `utilisée sur ${n} produit(s)` : 'utilisée nulle part')),
          h('button', { class: 'btn btn-sm', style: 'flex:0 0 auto', onclick: () => ouvrirEdition(g) }, 'Modifier'),
          h('button', { class: 'btn btn-sm btn-danger', style: 'flex:0 0 auto', onclick: () => supprimer(g) }, 'Supprimer'))));
    }
    liste.append(h('button', { class: 'btn btn-sm', style: 'margin-top:6px', onclick: () => ouvrirEdition(null) }, '＋ Nouvelle sous-famille partagée'));

    const dispo = adoptables();
    if (dispo.length) {
      liste.append(h('div', { class: 'eyebrow', style: 'margin-top:18px' }, 'À verser depuis la carte'));
      liste.append(h('div', { class: 'faint', style: 'font-size:12px; margin-bottom:8px' },
        'Ces sous-familles sont recopiées produit par produit. Les partager les relie : une seule modification ensuite.'));
      for (const a of dispo) {
        // Nom proposé : celui du groupe, à corriger avant de partager.
        const nom = h('input', { class: 'input', value: a.group.name, placeholder: 'Nom (ex. Sauce)' });
        liste.append(h('div', { class: 'optgroup-box' },
          h('div', { style: 'font-weight:700' }, a.group.choices.map((c) => c.label).join(', ')),
          h('div', { class: 'faint', style: 'font-size:12px' }, `sur ${a.products.length} produit(s)`),
          h('div', { class: 'row', style: 'align-items:center' },
            nom,
            h('button', { class: 'btn btn-sm btn-primary', style: 'flex:0 0 auto', onclick: () => verser(a, nom.value) }, 'Partager'))));
      }
    }
  }

  function ouvrirEdition(entry) {
    liste.hidden = true;
    clear(edition); edition.hidden = false;
    const form = libForm(entry);
    edition.append(
      h('div', { class: 'eyebrow' }, entry ? 'Modifier' : 'Nouvelle sous-famille'),
      form.el,
      entry && libraryUsage(entry.id)
        ? h('div', { class: 'faint', style: 'font-size:12px' },
            `Ce changement s'appliquera aux ${libraryUsage(entry.id)} produit(s) qui l'utilisent.`)
        : null,
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: ouvrirListe }, 'Annuler'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          const v = form.get();
          if (!v.name) { toast('Le nom est requis'); return; }
          if (!v.choices.length) { toast('Au moins un choix'); return; }
          let id = entry?.id;
          if (!id) { id = slug(v.name); while (libraryGroup(id)) id += '-2'; }
          await store.put('optiongroups', { ...(entry || {}), id, ...v, order: entry?.order ?? (state.optionGroups || []).length });
          await reloadCatalog();
          toast(entry ? 'Sous-famille enregistrée' : 'Sous-famille créée');
          ouvrirListe();
        } }, 'Enregistrer')));
  }

  async function supprimer(g) {
    const n = libraryUsage(g.id);
    if (n) { toast(`Utilisée sur ${n} produit(s) — détache-la d'abord`); return; }
    await store.del('optiongroups', g.id);
    await reloadCatalog();
    toast('Sous-famille supprimée');
    renderListe();
  }

  async function verser(a, nom) {
    const n = (nom || '').trim() || a.group.name;
    await adopt(a, n);
    toast(`« ${n} » partagée sur ${a.products.length} produit(s)`);
    renderListe();
  }

  renderListe();
  await modal({ title: 'Sous-familles partagées', body, actions: [{ label: 'Fermer', value: null }] });
}
