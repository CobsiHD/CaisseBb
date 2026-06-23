// catalog.js — gestion du catalogue (produits, prix, variantes, options, dispo).
import { state, reloadCatalog, money } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { requirePin } from './app.js';

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

function optionRow(o = { label: '', delta: 0 }) {
  const label = h('input', { class: 'input', value: o.label, placeholder: 'Option (ex. Diluant)' });
  const delta = h('input', { class: 'input', type: 'number', step: '0.5', value: o.delta, placeholder: '+€' });
  const row = h('div', { class: 'row', style: 'align-items:center' },
    label, delta,
    h('button', { class: 'btn btn-sm btn-ghost', style: 'flex:0 0 44px', onclick: () => row.remove() }, '✕'));
  row._get = () => ({ label: label.value.trim(), delta: Number(delta.value) || 0 });
  return row;
}

async function editProduct(p, container) {
  const isNew = !p;
  p = p || { name: '', categoryId: state.categories[0].id, sub: '', variants: [{ label: '', price: 0 }], options: [], happyHour: false, available: true, desc: '' };

  const name = h('input', { class: 'input', value: p.name, placeholder: 'Nom du produit' });
  const catSel = h('select', { class: 'input' }, state.categories.map((c) => h('option', { value: c.id, selected: c.id === p.categoryId }, c.name)));
  const sub = h('input', { class: 'input', value: p.sub || '', placeholder: 'Sous-catégorie (ex. Classiques)' });
  const desc = h('input', { class: 'input', value: p.desc || '', placeholder: 'Composition / description (optionnel)' });

  const variantsBox = h('div', { class: 'field' }, p.variants.map(variantRow));
  const addVariant = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => variantsBox.append(variantRow()) }, '＋ Format');
  const optionsBox = h('div', { class: 'field' }, (p.options || []).map(optionRow));
  const addOption = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => optionsBox.append(optionRow()) }, '＋ Option');

  const hh = h('input', { type: 'checkbox', checked: !!p.happyHour });
  const avail = h('input', { type: 'checkbox', checked: p.available !== false });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    field('Nom', name),
    h('div', { class: 'row' }, field('Catégorie', catSel), field('Sous-catégorie', sub)),
    field('Description', desc),
    field('Formats & prix', h('div', {}, variantsBox, addVariant)),
    field('Options (+ prix)', h('div', {}, optionsBox, addOption)),
    h('label', { class: 'switch' }, hh, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Éligible Bluebird\'s Hour (1+1)')),
    h('label', { class: 'switch' }, avail, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Disponible')),
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

  const variants = [...variantsBox.children].map((r) => r._get()).filter((x) => x.label !== '' || x.price > 0);
  if (!variants.length) variants.push({ label: '', price: 0 });
  const options = [...optionsBox.children].map((r) => r._get()).filter((x) => x.label);

  const obj = {
    ...p,
    name: name.value.trim(), categoryId: catSel.value, sub: sub.value.trim(), desc: desc.value.trim(),
    variants, options, happyHour: hh.checked, available: avail.checked,
  };
  if (isNew) { obj.id = `${obj.categoryId}-${slug(obj.name)}-${Date.now().toString(36).slice(-4)}`; obj.order = state.products.length; }
  await store.put('products', obj);
  await reloadCatalog();
  renderCatalog(container);
  toast(isNew ? 'Produit créé' : 'Produit enregistré');
}
