// options.js — sous-choix d'un produit (sauces, cuisson, suppléments…).
//
// Un produit peut porter des « sous-familles » de choix : Sauce (un seul choix),
// Suppléments (plusieurs). On les demande au moment où le produit arrive sur la
// note, et les choix retenus atterrissent dans `item.options` — la liste plate
// qui existait déjà — pour que le calcul du prix, le ticket et le bon de cuisine
// n'aient rien de nouveau à apprendre.
import { h, modal, field, toast } from './ui.js';
import { state, money } from './state.js';

// ── Modèle ───────────────────────────────────────────────────
// product.optionGroups = [{ name, multi, required, choices: [{ label, delta }] }]
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

export function productGroups(product) {
  const groups = (product?.optionGroups || [])
    .map((g) => ({
      name: (g?.name || '').trim(),
      multi: !!g?.multi,
      required: !!g?.required,
      choices: cleanChoices(g?.choices),
    }))
    .filter((g) => g.name && g.choices.length);

  const flat = cleanChoices(product?.options);
  if (flat.length && !groups.some((g) => g.name === LEGACY_GROUP)) {
    // Ces choix se cochaient librement et n'ont jamais été obligatoires :
    // on garde exactement ce comportement.
    groups.push({ name: LEGACY_GROUP, multi: true, required: false, choices: flat });
  }
  return groups;
}

export function hasGroups(product) { return productGroups(product).length > 0; }

// Signature d'une liste d'options : deux lignes qui se ressemblent doivent
// fusionner (2× Frites sauce curry), deux lignes différentes rester séparées.
export function optionsKey(options) {
  return (options || []).map((o) => `${o.group || ''}|${o.label}`).sort().join('§');
}

const choiceLabel = (c) => (c.delta ? `${c.label} (+${money(c.delta)})` : c.label);

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
    const paint = () => row.querySelectorAll('.chip').forEach((ch) =>
      ch.classList.toggle('active', set.has(ch.dataset.label)));

    for (const c of g.choices) {
      row.append(h('button', {
        class: `chip ${set.has(c.label) ? 'active' : ''}`,
        dataset: { label: c.label },
        onclick: () => {
          if (set.has(c.label)) set.delete(c.label);
          else { if (!g.multi) set.clear(); set.add(c.label); }
          paint();
        },
      }, choiceLabel(c)));
    }

    const hint = g.required ? (g.multi ? 'au moins un' : 'obligatoire') : (g.multi ? 'plusieurs possibles' : 'facultatif');
    el.append(field(h('span', {}, g.name, h('span', { class: 'faint', style: 'font-weight:600' }, ` · ${hint}`)), row));
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
    // Nom du premier groupe obligatoire laissé vide, sinon null.
    missing() {
      const g = groups.find((x) => x.required && chosen.get(x.name).size === 0);
      return g ? g.name : null;
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
    toast(`Choisis : ${missing}`);
  }
}

// ── Réutilisation ────────────────────────────────────────────
// Les sous-familles déjà posées ailleurs dans la carte, pour les reprendre au
// lieu de retaper six sauces à chaque produit. Deux sous-familles de même nom
// mais de choix différents restent distinctes : « Options » vaut « Diluant »
// sur un whisky et six sauces sur des frites, les confondre serait un piège.
export function catalogGroups(exceptId = null) {
  const byKey = new Map();
  for (const p of state.products || []) {
    if (exceptId && p.id === exceptId) continue;
    for (const g of productGroups(p)) {
      const key = `${g.name}|${g.choices.map((c) => c.label).join(',')}`;
      if (byKey.has(key)) byKey.get(key).count++;
      else byKey.set(key, { group: g, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.group.name.localeCompare(b.group.name));
}

// Intitulé d'une sous-famille dans la liste déroulante : le nom seul ne suffit
// pas — les 34 produits venus de la carte d'origine s'appellent tous
// « Options » et n'ont pas du tout les mêmes choix.
function apercu(group, count) {
  const noms = group.choices.slice(0, 3).map((c) => c.label).join(', ');
  const reste = group.choices.length > 3 ? `… (${group.choices.length})` : '';
  return `${group.name} · ${noms}${reste}` + (count > 1 ? ` — ${count} produits` : '');
}

// ── Éditeur (écrans d'édition du catalogue) ──────────────────
// Renvoie { el, get() } : une boîte par sous-famille, avec ses choix.
export function groupsEditor(product) {
  const box = h('div', { class: 'optgroups-edit' });
  productGroups(product).forEach((g) => box.append(groupBox(g)));

  // Reprise d'une sous-famille existante. Une liste déroulante native plutôt
  // qu'un second dialogue : l'éditeur de produit EST déjà un dialogue, et il
  // n'y en a qu'un seul à l'écran à la fois.
  const dispo = catalogGroups(product?.id);
  const reprise = dispo.length ? h('select', { class: 'input', onchange: () => {
    const i = Number(reprise.value);
    reprise.value = '';
    if (!Number.isInteger(i) || !dispo[i]) return;
    // Une copie : la modifier ici ne touche pas les autres produits.
    const g = dispo[i].group;
    box.append(groupBox({ ...g, choices: g.choices.map((c) => ({ ...c })) }));
  } },
    h('option', { value: '' }, '↺ Reprendre une sous-famille de la carte…'),
    dispo.map(({ group, count }, i) => h('option', { value: String(i) }, apercu(group, count))),
  ) : null;

  const el = h('div', {}, box,
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => box.append(groupBox()) }, '＋ Sous-famille')),
    reprise,
    h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' },
      'Ex. « Sauce » sur les frites : les choix sont demandés à l\'ajout du produit sur une note. '
      + 'Une sous-famille reprise est copiée — la modifier ici ne change pas les autres produits.'));

  return {
    el,
    get: () => [...box.children].map((b) => b._get()).filter((g) => g.name && g.choices.length),
  };
}

function groupBox(g = { name: '', multi: false, required: false, choices: [{ label: '', delta: 0 }] }) {
  const name = h('input', { class: 'input', value: g.name || '', placeholder: 'Nom du sous-choix (ex. Sauce)' });
  const multi = h('input', { type: 'checkbox', checked: !!g.multi });
  const required = h('input', { type: 'checkbox', checked: !!g.required });
  const choices = h('div', { class: 'field' }, (g.choices || []).map(choiceRow));

  const box = h('div', { class: 'optgroup-box' },
    h('div', { class: 'row', style: 'align-items:center' },
      name,
      h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', title: 'Supprimer cette sous-famille', onclick: () => box.remove() }, '✕')),
    choices,
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => choices.append(choiceRow()) }, '＋ Choix'),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('label', { class: 'switch' }, multi, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Plusieurs choix')),
      h('label', { class: 'switch' }, required, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Obligatoire'))),
  );

  box._get = () => ({
    name: name.value.trim(),
    multi: multi.checked,
    required: required.checked,
    choices: [...choices.children].map((r) => r._get()).filter((c) => c.label),
  });
  return box;
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
