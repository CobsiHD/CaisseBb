// fiches.js — l'onglet Produits en mode « Fiches » : de quoi répondre au client.
// Une fiche dit ce qu'est le produit, son goût, et quoi proposer s'il hésite.
// Elle se lit sans code PIN (toute l'équipe sert) ; elle s'écrit derrière le PIN.
//
// Le texte d'origine vit dans js/fiches/*.js, rangé par l'id du produit. Une
// fiche retouchée sur l'iPad s'enregistre sur le produit lui-même (`p.fiche`),
// part avec la synchro, et l'emporte sur le texte d'origine. Les fiches
// d'origine ne passent donc pas par la base : un iPad déjà en service les a
// dès la mise à jour, sans migration.
import { state, reloadCatalog, money } from './state.js';
import { h, clear, toast, modal, field } from './ui.js';
import * as store from './store.js';
import { requirePin } from './app.js';
import cocktails from './fiches/cocktails.js';
import spiritueuxBruns from './fiches/spiritueux-bruns.js';
import spiritueuxBlancs from './fiches/spiritueux-blancs.js';
import bieresSofts from './fiches/bieres-softs.js';
import vinsCuisine from './fiches/vins-cuisine.js';
import SAVEURS, { CRITERES } from './fiches/saveurs.js';

const ORIGINE = { ...cocktails, ...spiritueuxBruns, ...spiritueuxBlancs, ...bieresSofts, ...vinsCuisine };

export function ficheDe(p) { return p.fiche || ORIGINE[p.id] || null; }

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Ce que la recherche fouille : le nom, la famille, la composition et tout le
// texte de la fiche — « fumé », « vanille » ou « sans alcool » trouvent ainsi
// les produits dont la fiche en parle.
function texteCherchable(p, cat) {
  const f = ficheDe(p);
  const morceaux = [p.name, p.sub, cat?.name, p.desc];
  if (f) {
    morceaux.push(f.pitch, f.service, ...(f.tags || []));
    for (const [k, v] of [...(f.faits || []), ...(f.deg || [])]) morceaux.push(k, v);
    for (const [t] of f.infos || []) morceaux.push(t);
  }
  return norm(morceaux.join(' '));
}

const prixCourt = (p) => p.variants.map((v) => money(v.price).replace(/,00\s/, ' ')).join(' / ');

// Ce qui reste d'une visite à l'autre de l'onglet (le temps de la session).
let selection = null;
let recherche = '';
let famille = 'tout';

/** Ouvre la fiche d'un produit au prochain dessin du mode Fiches (depuis la carte des saveurs). */
export function montrerFiche(id) { selection = id; recherche = ''; famille = 'tout'; }

/** Dessine le mode Fiches sous la barre de l'onglet. */
export function renderFiches(container) {
  clear(container);
  const cats = state.categories.filter((c) => state.products.some((p) => p.categoryId === c.id));
  const catDe = (p) => state.categories.find((c) => c.id === p.categoryId);

  const input = h('input', {
    class: 'input fi-search', type: 'search', value: recherche,
    placeholder: '🔍  Un produit, un goût (« fumé », « sans alcool », « vanille »)…',
    oninput: () => { recherche = input.value; dessinerListe(); },
  });
  const chips = h('div', { class: 'fi-chips' },
    [{ id: 'tout', name: 'Tout' }, ...cats].map((c) => h('button', {
      class: `chip ${famille === c.id ? 'active' : ''}`,
      onclick: (e) => {
        famille = c.id;
        chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
        dessinerListe();
      },
    }, c.name)));

  const liste = h('div', { class: 'fi-list' });
  const panneau = h('div', { class: 'fi-fiche' });
  const ecran = h('div', { class: 'fi-main' }, liste, panneau);
  container.append(h('div', { class: 'fi-tools' }, input, chips), ecran);

  function choisir(p) {
    selection = p?.id || null;
    liste.querySelectorAll('.fi-item').forEach((el) => el.classList.toggle('on', el.dataset.id === selection));
    ecran.classList.toggle('detail', !!p);       // téléphone : la fiche prend l'écran
    dessinerFiche(panneau, p, { choisir, rafraichir: () => renderFiches(container) });
    panneau.scrollTop = 0;
  }

  function dessinerListe() {
    clear(liste);
    const mots = norm(recherche).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const cat of cats) {
      if (famille !== 'tout' && famille !== cat.id) continue;
      const prods = state.products.filter((p) => p.categoryId === cat.id
        && mots.every((m) => texteCherchable(p, cat).includes(m)));
      let sousTitre = null;
      for (const p of prods) {
        const titre = `${cat.name}${p.sub ? ' · ' + p.sub : ''}`;
        if (titre !== sousTitre) { liste.append(h('div', { class: 'eyebrow fi-group' }, titre)); sousTitre = titre; }
        const f = ficheDe(p);
        liste.append(h('button', {
          class: `fi-item ${p.id === selection ? 'on' : ''} ${p.available === false ? 'unavail' : ''}`,
          dataset: { id: p.id },
          onclick: () => choisir(p),
        },
        h('span', { class: 'n' }, p.name, h('i', { class: `fi-dot ${f ? '' : 'vide'}`, title: f ? 'Fiche remplie' : 'Pas encore de fiche' })),
        h('span', { class: 'p' }, prixCourt(p)),
        h('span', { class: 's' }, f?.tags?.length ? f.tags.slice(0, 4).join(' · ') : (p.desc || '—'))));
        n++;
      }
    }
    if (!n) liste.append(h('div', { class: 'fi-rien' }, 'Aucun produit ne correspond.'));
  }

  dessinerListe();
  const p = state.products.find((x) => x.id === selection);
  if (p) choisir(p);
  else dessinerFiche(panneau, null, {});
}

function dessinerFiche(panneau, p, { choisir, rafraichir }) {
  clear(panneau);
  if (!p) {
    panneau.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, 'Choisis un produit'),
      h('div', {}, 'Sa fiche dit quoi répondre au client : le goût, la force, et quoi proposer s’il hésite.')));
    return;
  }
  const cat = state.categories.find((c) => c.id === p.categoryId);
  const f = ficheDe(p);
  const retour = h('button', { class: 'btn btn-ghost fi-retour', onclick: () => choisir(null) }, '← Liste');
  const modifier = h('button', { class: 'btn', onclick: () => editerFiche(p, rafraichir) },
    f ? '✏️ Modifier la fiche' : '✏️ Rédiger la fiche', state.settings.pin ? ' 🔒' : '');

  const tete = h('div', { class: 'fi-head' },
    h('div', {},
      h('div', { class: 'fi-fam' }, [cat?.name, p.sub].filter(Boolean).join(' · ')),
      h('h1', {}, p.name),
      h('div', { class: 'fi-badges' },
        p.happyHour ? h('span', { class: 'badge hh' }, '1+1 Bluebird’s Hour') : null,
        p.available === false ? h('span', { class: 'badge off' }, 'Rupture') : null,
        f?.verifier ? h('span', { class: 'badge fi-verif', title: 'Un fait de la fiche reste à confirmer' }, 'À vérifier') : null)),
    h('div', { class: 'fi-prix' }, p.variants.map((v) => h('div', {}, v.label ? h('small', {}, v.label) : null, money(v.price)))));

  if (!f) {
    panneau.append(retour, tete,
      p.desc ? h('p', { class: 'fi-desc' }, p.desc) : null,
      h('div', { class: 'fi-vide' }, 'Pas encore de fiche pour ce produit.'),
      h('div', { class: 'fi-edit' }, modifier));
    return;
  }

  const paires = (lignes) => h('div', { class: 'fi-deg' }, (lignes || []).flatMap(([k, v]) => [h('b', {}, k), h('div', {}, v)]));
  const alt = (f.alt || []).map(([raison, nom]) => {
    const cible = state.products.find((x) => x.name === nom);
    return h('button', { class: 'fi-alt-item', disabled: !cible, onclick: () => cible && choisir(cible) },
      h('b', {}, nom), h('span', {}, raison));
  });

  panneau.append(retour, tete,
    f.pitch ? h('div', { class: 'fi-pitch' }, h('div', { class: 'lbl' }, '💬 À dire au client'), h('p', {}, f.pitch)) : null,
    f.faits?.length ? h('div', { class: 'fi-faits' }, f.faits.map(([k, v]) =>
      h('div', { class: 'fi-fait' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)))) : null,
    h('div', { class: 'fi-cols' },
      h('div', { class: 'fi-card' }, h('h4', {}, p.recipe ? 'Le cocktail' : cat?.cuisine ? 'En détail' : 'Dégustation'),
        paires(f.deg),
        f.service ? h('div', { class: 'fi-deg fi-service' }, h('b', {}, 'Service'), h('div', {}, f.service)) : null),
      h('div', { class: 'fi-card' }, h('h4', {}, 'Profil'),
        h('div', { class: 'fi-tags' }, (f.tags || []).map((t) => h('span', { class: 'fi-tag' }, t))),
        // Un spiritueux noté montre ses huit notes de saveur, plus fines que les trois jauges de la fiche.
        h('div', { class: 'fi-jauges' }, (SAVEURS[p.id] ? CRITERES.map((k, i) => [k, SAVEURS[p.id][i]]) : (f.jauges || [])).map(([k, v]) =>
          h('div', { class: 'fi-jauge' }, h('span', {}, k),
            h('div', { class: 'fi-bar' }, h('i', { style: `width:${Math.max(0, Math.min(100, Number(v) || 0))}%` }))))))),
    alt.length ? h('div', { class: 'fi-card fi-alt' }, h('h4', {}, 'S’il hésite, proposer aussi'), alt) : null,
    f.infos?.length ? h('div', { class: 'fi-infos' }, f.infos.map(([t, alerte]) =>
      h('span', { class: `fi-info ${alerte ? 'alerte' : ''}` }, alerte ? '⚠️ ' : 'ℹ️ ', t))) : null,
    h('div', { class: 'fi-edit' }, modifier));
}

// ── Rédaction d'une fiche (derrière le PIN) ──────────────────
// Des lignes fixes plutôt qu'un éditeur libre : la fiche garde sa forme d'un
// produit à l'autre, et une ligne laissée vide est simplement ignorée.
function lignes(n, valeurs, fabrique) {
  const box = h('div', { class: 'fi-ed-lignes' });
  const rows = [];
  for (let i = 0; i < Math.max(n, valeurs.length); i++) { const r = fabrique(valeurs[i]); rows.push(r); box.append(r.el); }
  return { el: box, get: () => rows.map((r) => r.get()).filter(Boolean) };
}

function paireRow(placeholderK, placeholderV) {
  return (v = []) => {
    const k = h('input', { class: 'input', style: 'flex:0 0 34%', value: v[0] || '', placeholder: placeholderK });
    const val = h('input', { class: 'input', value: v[1] || '', placeholder: placeholderV });
    return { el: h('div', { class: 'row' }, k, val),
      get: () => (k.value.trim() && val.value.trim() ? [k.value.trim(), val.value.trim()] : null) };
  };
}

function jaugeRow(v = []) {
  const k = h('input', { class: 'input', value: v[0] || '', placeholder: 'Douceur, Puissance…' });
  const val = h('input', { class: 'input', style: 'flex:0 0 110px', type: 'number', min: 0, max: 100, step: 5, value: v[1] ?? '', placeholder: '0 à 100' });
  return { el: h('div', { class: 'row' }, k, val),
    get: () => (k.value.trim() && val.value !== '' ? [k.value.trim(), Math.max(0, Math.min(100, Number(val.value) || 0))] : null) };
}

function altRow(p) {
  return (v = []) => {
    const raison = h('input', { class: 'input', value: v[0] || '', placeholder: 'Pourquoi (ex. Plus sec)' });
    const sel = h('select', { class: 'input' },
      h('option', { value: '' }, '— Produit —'),
      state.categories.map((c) => h('optgroup', { label: c.name },
        state.products.filter((x) => x.categoryId === c.id && x.id !== p.id)
          .map((x) => h('option', { value: x.name, selected: x.name === v[1] }, x.name)))));
    return { el: h('div', { class: 'row' }, raison, sel),
      get: () => (sel.value ? [raison.value.trim() || 'Aussi', sel.value] : null) };
  };
}

function infoRow(v = []) {
  const t = h('input', { class: 'input', value: v[0] || '', placeholder: 'Mention (ex. Contient du gluten)' });
  const alerte = h('input', { type: 'checkbox', checked: !!v[1] });
  return { el: h('div', { class: 'row', style: 'align-items:center' }, t,
    h('label', { class: 'fi-ed-alerte' }, alerte, '⚠️ Allergène')),
  get: () => (t.value.trim() ? [t.value.trim(), alerte.checked] : null) };
}

async function editerFiche(p, rafraichir) {
  if (state.settings.pin && !(await requirePin('Modifier une fiche'))) return;
  const f = ficheDe(p) || {};
  const pitch = h('textarea', { class: 'input fi-ed-pitch', rows: 3, placeholder: '2 ou 3 phrases : ce que c’est, le goût, pour qui.' });
  pitch.value = f.pitch || '';
  const faits = lignes(4, f.faits || [], paireRow('Origine, Degré…', 'Valeur'));
  const deg = lignes(3, f.deg || [], paireRow('Nez, Bouche…', 'Description'));
  const service = h('input', { class: 'input', value: f.service || '', placeholder: 'Verre, température, glace… (facultatif)' });
  const tags = h('input', { class: 'input', value: (f.tags || []).join(', '), placeholder: 'Doux, Vanillé, Boisé (séparés par des virgules)' });
  const jauges = lignes(3, f.jauges || [], jaugeRow);
  const alt = lignes(3, f.alt || [], altRow(p));
  const infos = lignes(Math.max(3, (f.infos || []).length + 1), f.infos || [], infoRow);
  const verifier = h('input', { type: 'checkbox', checked: !!f.verifier });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    field('À dire au client', pitch),
    field('Infos clés (4 cases)', faits.el),
    field('Dégustation / dans le verre', deg.el),
    field('Service', service),
    field('Mots-clés de goût', tags),
    field('Jauges', jauges.el),
    field('S’il hésite, proposer aussi', alt.el),
    field('Mentions', infos.el),
    h('label', { class: 'switch' }, verifier, h('span', { class: 'track' }), h('span', { class: 'muted' }, 'Un fait reste à vérifier')));

  const actions = [{ label: 'Annuler', value: null }, { label: 'Enregistrer', kind: 'primary', value: 'save' }];
  if (p.fiche && ORIGINE[p.id]) actions.unshift({ label: 'Texte d’origine', value: 'origine' });
  const v = await modal({ title: `Fiche · ${p.name}`, body, actions });
  if (!v) return;

  const obj = { ...p };
  if (v === 'origine') delete obj.fiche;
  else {
    obj.fiche = {
      pitch: pitch.value.trim(),
      faits: faits.get(), deg: deg.get(), service: service.value.trim(),
      tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      jauges: jauges.get(), alt: alt.get(), infos: infos.get(),
      verifier: verifier.checked,
    };
  }
  await store.put('products', obj);
  await reloadCatalog();
  rafraichir();
  toast(v === 'origine' ? 'Fiche d’origine remise' : 'Fiche enregistrée');
}
