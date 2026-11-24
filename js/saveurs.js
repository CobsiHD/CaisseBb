// saveurs.js — la carte des saveurs (onglet Produits, mode « Saveurs »).
//
// Une famille de spiritueux à la fois, chaque bouteille placée sur une roue des
// saveurs (vue par défaut) ou sur deux axes choisis parmi les huit critères des
// notes de saveur (fiches/saveurs.js). Un critère peut régler la taille des points. Toucher un point ouvre
// son résumé et ses trois voisines de goût, les bouteilles à proposer à un
// client qui aime celle-là. Lecture seule, sans PIN, comme les Fiches.
import { state, money } from './state.js';
import { h, clear } from './ui.js';
import NOTES, { CRITERES } from './fiches/saveurs.js';
import { ficheDe } from './fiches.js';

const BORNES = {
  'Sucré': ['Sec', 'Sucré'], 'Vanillé': ['Pas vanillé', 'Vanillé'], 'Rondeur': ['Vif', 'Rond'],
  'Épicé': ['Peu épicé', 'Épicé'], 'Fruité': ['Peu fruité', 'Fruité'], 'Boisé': ['Pas boisé', 'Boisé'],
  'Fumé': ['Pas fumé', 'Fumé'], 'Puissance': ['Léger', 'Puissant'],
};
const TOUTES = 'Toutes';

// Ce qui reste d'une visite à l'autre de l'onglet (le temps de la session).
let famille = null;
let axeX = 'Sucré';
let axeY = 'Puissance';
let taille = null;
let vue = 'roue';        // 'roue' (les saveurs en cercle) ou 'axes' (deux critères)
let choisi = null;

const note = (p, k) => NOTES[p.id][CRITERES.indexOf(k)];
const fait = (f, cle) => (f?.faits || []).find(([k]) => k === cle)?.[1] || '';

// Une bouteille ajoutée au comptoir sans sous-famille (le Balvenie) se range
// d'après le type écrit sur sa fiche, pour ne pas manquer à sa famille.
const DEVINE = [[/whisk|malt|bourbon|scotch/i, 'Whiskys'], [/rhum/i, 'Rhums'], [/tequila/i, 'Tequilas'], [/gin\b/i, 'Gins & Tonic'], [/vodka/i, 'Vodkas']];
function famDe(p) {
  if (p.sub) return p.sub;
  const type = fait(ficheDe(p), 'Type');
  return DEVINE.find(([re]) => re.test(type))?.[1] || '';
}

/** Les familles qui ont des bouteilles notées, dans l'ordre de la caisse. */
function familles() {
  const vues = [];
  for (const p of [...state.products].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const f = NOTES[p.id] && famDe(p);
    if (f && !vues.includes(f)) vues.push(f);
  }
  return vues;
}

/** Les trois bouteilles les plus proches en goût, toutes familles confondues. */
function voisines(p, n = 3) {
  const a = NOTES[p.id];
  return state.products
    .filter((q) => q.id !== p.id && NOTES[q.id] && q.available !== false)
    .map((q) => ({ q, d: Math.hypot(...NOTES[q.id].map((v, i) => v - a[i])) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, n)
    .map((x) => x.q);
}

export function renderSaveurs(container, { ouvrirFiche }) {
  clear(container);
  const fams = familles();
  if (!fams.length) {
    container.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, 'Aucun spiritueux noté')));
    return;
  }
  if (!famille || (famille !== TOUTES && !fams.includes(famille))) famille = fams[0];

  const chipsFam = h('div', { class: 'fi-chips sv-fams' },
    [...fams, TOUTES].map((f) => h('button', {
      class: `chip ${famille === f ? 'active' : ''}`,
      onclick: () => { famille = f; choisi = null; renderSaveurs(container, { ouvrirFiche }); },
    }, f === 'Gins & Tonic' ? 'Gins' : f)));

  const plan = h('div', { class: 'sv-plan' });
  const cote = h('div', { class: 'sv-cote' });
  container.append(h('div', { class: 'fi-tools' }, chipsFam), h('div', { class: 'sv-main' }, plan, cote));

  const redessiner = () => renderSaveurs(container, { ouvrirFiche });
  dessinerPlan(plan, redessiner);
  dessinerCote(cote, redessiner, ouvrirFiche);
}

function bouteilles() {
  return state.products.filter((p) => NOTES[p.id] && (famille === TOUTES || famDe(p) === famille));
}

function dessinerPlan(plan, redessiner) {
  const ps = bouteilles();
  const titre = h('div', { class: 'sv-titre' }, h('b', {}, `${ps.length} bouteille${ps.length > 1 ? 's' : ''}`),
    h('span', {}, taille ? `Plus le point est gros, plus c’est ${taille.toLowerCase()}.`
      : vue === 'roue' ? 'Chaque bouteille est attirée vers ses saveurs fortes ; au centre, un profil équilibré.'
        : 'Touche une bouteille pour son profil.'));
  if (vue === 'roue') return dessinerRoue(plan, ps, titre, redessiner);

  // Les axes suivent les bouteilles affichées : une famille toute sèche s'étale
  // quand même sur la largeur, au lieu de se tasser dans un coin.
  const etendue = (k) => {
    const vs = ps.map((p) => note(p, k));
    let a = Math.min(...vs), b = Math.max(...vs);
    if (b - a < 20) { const m = (a + b) / 2; a = m - 10; b = m + 10; }
    return [a - (b - a) * 0.1, b + (b - a) * 0.1];
  };
  const [xa, xb] = etendue(axeX), [ya, yb] = etendue(axeY);
  const [xMin, xMax] = BORNES[axeX], [yMin, yMax] = BORNES[axeY];
  const zone = h('div', { class: 'sv-zone' },
    h('i', { class: 'sv-croix-v' }), h('i', { class: 'sv-croix-h' }),
    h('span', { class: 'sv-coin hg' }, `${yMax} · ${xMin}`), h('span', { class: 'sv-coin hd' }, `${yMax} · ${xMax}`),
    h('span', { class: 'sv-coin bg' }, `${yMin} · ${xMin}`), h('span', { class: 'sv-coin bd' }, `${yMin} · ${xMax}`));
  const points = ps.map((p) => ({ p, x: (note(p, axeX) - xa) / (xb - xa) * 100, y: (1 - (note(p, axeY) - ya) / (yb - ya)) * 100 }));
  poserPoints(zone, ps, points, Math.max(280, plan.clientWidth - 70), redessiner);

  plan.append(titre,
    h('div', { class: 'sv-cadre' },
      h('div', { class: 'sv-axe-y' }, h('span', {}, yMin), h('b', {}, `${axeY} →`), h('span', {}, yMax)),
      zone,
      h('div', { class: 'sv-axe-x' }, h('span', {}, xMin), h('b', {}, `${axeX} →`), h('span', {}, xMax))));
}

// La roue (dessin du proprio, 24/11) : les saveurs tout autour, dans son ordre,
// en partant du haut. Chaque bouteille est tirée vers chaque saveur selon sa
// note, comme par des élastiques : elle se pose près de ce qui la domine, et
// au centre quand rien ne ressort. La puissance n'est pas une saveur : elle
// reste dans la taille des points.
const ROUE = ['Vanillé', 'Fruité', 'Épicé', 'Rondeur', 'Boisé', 'Fumé', 'Sucré'];
const R_ROUE = 40;   // rayon du cercle, en % du carré

function dessinerRoue(plan, ps, titre, redessiner) {
  const ancres = ROUE.map((k, i) => {
    const a = (-90 + i * 360 / ROUE.length) * Math.PI / 180;
    return { k, cx: Math.cos(a), cy: Math.sin(a) };
  });
  // Chaque bouteille est tirée vers ce qui la distingue des autres bouteilles
  // affichées : une saveur au-dessus de la moyenne la tire d'autant plus fort
  // qu'elle s'en écarte. Une bouteille forte partout (Bumbu : sucré, vanillé,
  // rond) ne s'annule donc pas au milieu ; une bouteille dans la moyenne, si.
  const stats = Object.fromEntries(ROUE.map((k) => {
    const vs = ps.map((p) => note(p, k));
    const moy = vs.reduce((a, b) => a + b, 0) / vs.length;
    const et = Math.sqrt(vs.reduce((a, v) => a + (v - moy) ** 2, 0) / vs.length);
    return [k, [moy, Math.max(et, 6)]];
  }));
  const brut = ps.map((p) => {
    let sx = 0, sy = 0, sw = 0;
    for (const { k, cx, cy } of ancres) {
      const [moy, et] = stats[k];
      const w = Math.max(0, (note(p, k) - moy) / et) ** 1.5;
      sx += w * cx; sy += w * cy; sw += w;
    }
    // Le poids total dit à quel point la bouteille est typée : il l'éloigne du centre.
    const r = Math.min(1, sw / 4);
    return { p, dx: sw ? sx / sw * r : 0, dy: sw ? sy / sw * r : 0 };
  });
  // On étale l'ensemble pour que la bouteille la plus typée touche presque le
  // bord, avec un effet loupe (puissance 0,6) qui desserre le milieu, où se
  // tassent les profils proches de la moyenne. L'ordre des distances au centre
  // est gardé : plus loin veut toujours dire plus typé.
  const rmax = Math.max(0.05, ...brut.map((b) => Math.hypot(b.dx, b.dy)));
  const points = brut.map(({ p, dx, dy }) => {
    const r = Math.hypot(dx, dy);
    const loupe = r ? 0.9 * (r / rmax) ** 0.6 / r : 0;
    return { p, x: 50 + dx * loupe * R_ROUE, y: 50 + dy * loupe * R_ROUE };
  });

  const zone = h('div', { class: 'sv-zone roue' });
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R_ROUE}" />`
    + ancres.map(({ cx, cy }) => `<line x1="50" y1="50" x2="${50 + cx * R_ROUE}" y2="${50 + cy * R_ROUE}" />`).join('')
    + '<circle cx="50" cy="50" r="1" class="c" /></svg>';
  zone.append(h('div', { class: 'sv-toile', html: svg }));
  for (const { k: nom, cx, cy } of ancres) {
    const lx = 50 + cx * (R_ROUE + 5), ly = 50 + cy * (R_ROUE + 4);
    const cote = cx > 0.3 ? 'g' : cx < -0.3 ? 'd' : 'c';
    zone.append(h('span', { class: `sv-saveur ${cote} ${nom === taille ? 'on' : ''}`, style: `left:${lx}%;top:${ly}%` }, nom));
  }
  plan.append(titre, h('div', { class: 'sv-cadre roue' }, zone));
  const cote = Math.max(260, Math.min(plan.clientWidth - 40, plan.clientHeight - 60));
  poserPoints(zone, ps, points, cote, redessiner);
}

// Les points et leurs noms, communs aux deux vues. Les étiquettes se gênent
// vite : chacune cherche une place libre à droite de son point, puis à gauche,
// en montant ou descendant d'un cran. Les points eux-mêmes sont des obstacles :
// un nom posé sur un autre point se ferait couper, et on ne saurait plus à qui
// il appartient.
function poserPoints(zone, ps, points, larg, redessiner) {
  const tailles = taille ? ps.map((p) => note(p, taille)) : [];
  const [ta, tb] = taille ? [Math.min(...tailles), Math.max(...tailles)] : [0, 1];
  points.sort((a, b) => a.y - b.y);
  // Deux bouteilles aux mêmes notes tomberaient l'une sur l'autre : la seconde
  // glisse d'un cran sur le côté, assez pour qu'on puisse toucher chacune.
  // On tourne autour de sa place en spirale jusqu'au premier trou, pour ne pas
  // former de traînée quand beaucoup se chevauchent.
  const proche = (pt, i) => points.slice(0, i).some((o) => Math.hypot(o.x - pt.x, o.y - pt.y) < 2.4);
  points.forEach((pt, i) => {
    const x0 = pt.x, y0 = pt.y;
    for (let n = 1; proche(pt, i) && n < 200; n++) {
      const a = n * 2.4, r = 1.2 * Math.sqrt(n);
      pt.x = x0 + Math.cos(a) * r; pt.y = y0 + Math.sin(a) * r;
    }
  });
  const poses = [];
  const libre = (x, y, w, moi) => !poses.some((b) => x < b.x + b.w && x + w > b.x && Math.abs(y - b.y) < 4.2)
    && !points.some((o) => o.p !== moi && o.x > x - 1.5 && o.x < x + w + 1.5 && Math.abs(o.y - y) < 3.5);
  for (const { p, x, y } of points) {
    // Un nom prend ~7 px par lettre, quelle que soit la taille de l'écran.
    const w = Math.min(40, (p.name.length * 7 + 6) / larg * 100);
    let lx = null, ly = y;
    for (const dy of [0, -3.5, 3.5, -7, 7]) {
      if (y + dy < 3 || y + dy > 97) continue;
      if (x + 2.2 + w <= 100 && libre(x + 2.2, y + dy, w, p)) { lx = x + 2.2; ly = y + dy; break; }
      if (x - 2.2 - w >= 0 && libre(x - 2.2 - w, y + dy, w, p)) { lx = x - 2.2 - w; ly = y + dy; break; }
    }
    const d = taille ? 12 + (tb > ta ? (note(p, taille) - ta) / (tb - ta) : 0.5) * 22 : 16;
    const on = choisi === p.id;
    zone.append(h('button', {
      class: `sv-pt ${on ? 'on' : ''} ${p.available === false ? 'off' : ''}`,
      style: `left:${x}%;top:${y}%`,
      'aria-label': p.name,
      onclick: () => { choisi = on ? null : p.id; redessiner(); },
    }, h('i', { style: `width:${d}px;height:${d}px` })));
    if (lx != null) {
      poses.push({ x: lx, y: ly, w });
      zone.append(h('span', { class: `sv-nom ${on ? 'on' : ''}`, style: `left:${lx}%;top:${ly}%;max-width:${w}%` }, p.name));
    }
  }
}

function choix(titre, courant, avecAucun, regler) {
  const opts = avecAucun ? [null, ...CRITERES] : CRITERES;
  return h('div', { class: 'sv-choix' },
    h('div', { class: 'eyebrow' }, titre),
    h('div', { class: 'sv-grille' }, opts.map((k) => h('button', {
      class: `chip ${courant === k ? 'active' : ''}`,
      onclick: () => regler(k),
    }, k || 'Aucun'))));
}

function dessinerCote(cote, redessiner, ouvrirFiche) {
  cote.append(h('div', { class: 'sv-choix' },
    h('div', { class: 'eyebrow' }, 'Vue'),
    h('div', { class: 'sv-grille deux' }, [['roue', 'Roue des saveurs'], ['axes', 'Deux axes']].map(([id, label]) =>
      h('button', { class: `chip ${vue === id ? 'active' : ''}`, onclick: () => { vue = id; redessiner(); } }, label)))));
  if (vue === 'axes') {
    cote.append(
      choix('Axe horizontal', axeX, false, (k) => { axeX = k; redessiner(); }),
      choix('Axe vertical', axeY, false, (k) => { axeY = k; redessiner(); }));
  }
  cote.append(choix('Taille des points', taille, true, (k) => { taille = k; redessiner(); }));

  const p = state.products.find((x) => x.id === choisi && NOTES[x.id]);
  if (!p) {
    cote.append(h('div', { class: 'sv-vide' }, 'Touche un point : son profil complet et les bouteilles au goût le plus proche s’affichent ici.'));
    return;
  }
  const f = ficheDe(p);
  const bouche = (f?.deg || []).find(([k]) => k === 'Bouche')?.[1];
  cote.append(h('div', { class: 'fi-card sv-fiche' },
    h('div', { class: 'sv-fiche-tete' }, h('h4', {}, p.name), h('b', {}, p.variants.map((v) => money(v.price)).join(' / '))),
    h('div', { class: 'sv-fiche-sous' }, [famDe(p), fait(f, 'Origine'), fait(f, 'Degré')].filter(Boolean).join(' · ')),
    bouche ? h('p', {}, bouche) : null,
    h('div', { class: 'fi-jauges' }, CRITERES.map((k) => h('div', { class: `fi-jauge ${k === axeX || k === axeY ? 'axe' : ''}` },
      h('span', {}, k), h('div', { class: 'fi-bar' }, h('i', { style: `width:${note(p, k)}%` }))))),
    h('div', { class: 'eyebrow sv-proches-t' }, 'S’il aime, proposer aussi'),
    h('div', { class: 'sv-proches' }, voisines(p).map((q) => h('button', {
      class: 'fi-alt-item',
      onclick: () => { if (famille !== TOUTES && famDe(q) !== famille) famille = TOUTES; choisi = q.id; redessiner(); },
    }, h('b', {}, q.name), h('span', {}, famDe(q))))),
    h('button', { class: 'btn sv-ouvrir', onclick: () => ouvrirFiche(p) }, 'Ouvrir la fiche')));
}
