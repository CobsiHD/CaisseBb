// menu.js — mode « Carte » : affichage éditorial des produits et prix.
//
// C'est aussi là que le bar lit ses fiches techniques : une ligne dont le
// produit porte une recette s'ouvre d'une touche. Les pavés de commande, eux,
// n'en montrent rien — toucher une touche doit toujours ajouter à la note, et
// rien d'autre.
import { state, money } from './state.js';
import { h, clear, modal } from './ui.js';

function priceText(p) {
  return p.variants.map((v) => v.label ? `${v.label} ${money(v.price)}` : money(v.price)).join('  ·  ');
}

// ── Fiche technique ──────────────────────────────────────────
function ficheTechnique(p) {
  const r = p.recipe;
  const repere = (label, valeur) => valeur
    ? h('div', { class: 'fiche-rep' }, h('div', { class: 'eyebrow' }, label), h('div', { class: 'v' }, valeur))
    : null;

  return modal({
    title: p.name,
    body: h('div', { class: 'fiche' },
      h('div', { class: 'fiche-reps' },
        repere('Technique', r.technique),
        repere('Verre', r.verre),
        repere('Finition', r.finition)),
      h('ul', { class: 'fiche-ing' }, (r.ingredients || []).map((i) =>
        h('li', {}, h('span', { class: 'fi-label' }, i.label), h('span', { class: 'fi-qty' }, i.qty)))),
    ),
    actions: [{ label: 'Fermer', kind: 'primary', value: 'ok' }],
  });
}

export function renderMenu(container) {
  clear(container);
  const page = h('div', { class: 'menu-page' });

  const hh = state.settings.happyHour;
  page.append(h('header', { class: 'menu-hero' },
    h('svg', { class: 'bird', viewBox: '0 0 24 24', html: '<path d="M3 14c4-1 6-4 9-8 1 3 0 5-2 7 3 0 5-1 7-3-1 4-4 7-9 7-3 0-5-1-6-3 0 0 1 .3 1 .3z"/>' }),
    h('h1', {}, 'Bluebird'),
    h('div', { class: 'tag' }, 'Bar à cocktails · Chambéry'),
    h('div', { class: 'menu-hh' }, `Bluebird’s Hour · ${hh?.from || '17h'}–${hh?.to || '21h'} · 1 acheté = 1 offert`),
  ));

  for (const cat of state.categories) {
    const prods = state.products.filter((p) => p.categoryId === cat.id && p.available !== false);
    if (!prods.length) continue;
    const block = h('section', { class: 'menu-cat' },
      h('h2', {}, cat.name),
      h('div', { class: 'menu-rule' }));
    let lastSub = null;
    for (const p of prods) {
      if (p.sub && p.sub !== lastSub) { block.append(h('div', { class: 'menu-sub' }, p.sub)); lastSub = p.sub; }
      const fiche = p.recipe?.ingredients?.length ? p.recipe : null;
      block.append(h('article', {
        class: `menu-item ${fiche ? 'a-fiche' : ''}`,
        ...(fiche ? {
          role: 'button', tabIndex: 0,
          onclick: () => ficheTechnique(p),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ficheTechnique(p); } },
        } : {}),
      },
        h('div', { class: 'mi-name' }, p.name, fiche ? h('span', { class: 'mi-fiche' }, 'Fiche') : null),
        h('div', { class: 'mi-price' }, priceText(p)),
        p.desc ? h('div', { class: 'mi-desc' }, p.desc) : null,
      ));
    }
    page.append(block);
  }

  page.append(h('div', { class: 'menu-sub', style: 'margin-top:50px; color:var(--faint)' }, 'Prix nets en euros · taxes & service compris'));
  container.append(page);
}
