// reglages.js — la page Réglages (bouton ⚙).
//
// Quatre blocs, rangés par ce qu'on vient y faire et non par ce qu'ils
// stockent : « Le bar » (partagé par tous les appareils), « Aide »,
// « Cet appareil » (rien ne se synchronise) et « Données ».
//
// Pas de bouton « Enregistrer » : chaque réglage s'applique dès qu'on le
// touche, comme un interrupteur. Avant, deux champs attendaient le bouton et
// les autres agissaient tout de suite — on ne savait jamais lequel.
import { state, loadAll, reloadCatalog, reloadLayout, reloadOrders, reloadTickets, reloadMenage } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { syncActive, clearToken, cloudEnabled } from './cloud.js';
import { PROFILES, profile, profileId, setProfile } from './profile.js';
import { uiModeSelector } from './mobile/shell.js';
import { tutoOn, setTutoOn, startParcours } from './tuto.js';

// ── Briques ──────────────────────────────────────────────────
/** Une ligne : libellé + explication à gauche, la commande à droite. */
function ligne(titre, aide, commande, { cls = '' } = {}) {
  return h('div', { class: `rg-row ${cls}` },
    h('div', { class: 'rg-txt' },
      h('div', { class: 'rg-lbl' }, titre),
      aide ? h('div', { class: 'rg-aide' }, aide) : null),
    commande ? h('div', { class: 'rg-cmd' }, commande) : null);
}

/** Une ligne entière à toucher, qui mène ailleurs. */
function lien(titre, aide, onclick) {
  return h('button', { class: 'rg-row rg-lien', type: 'button', onclick },
    h('span', { class: 'rg-txt' },
      h('span', { class: 'rg-lbl' }, titre),
      aide ? h('span', { class: 'rg-aide' }, aide) : null),
    h('span', { class: 'rg-chev', 'aria-hidden': 'true' }, '›'));
}

function bloc(titre, sousTitre, ...lignes) {
  return h('section', { class: 'rg-bloc' },
    h('div', { class: 'rg-bloc-head' },
      h('h3', {}, titre),
      sousTitre ? h('span', { class: 'rg-bloc-sub' }, sousTitre) : null),
    h('div', { class: 'rg-rows' }, lignes));
}

function interrupteur(checked, onchange, label) {
  const input = h('input', { type: 'checkbox', checked, 'aria-label': label });
  input.addEventListener('change', () => onchange(input.checked));
  return h('label', { class: 'switch' }, input, h('span', { class: 'track' }));
}

// ── Le bar ───────────────────────────────────────────────────
function blocBar() {
  const hh = () => state.settings.happyHour || {};
  const de = h('input', { class: 'input', type: 'time', value: hh().from || '17:00', 'aria-label': 'Début' });
  const a = h('input', { class: 'input', type: 'time', value: hh().to || '21:00', 'aria-label': 'Fin' });

  async function sauverHH(enabled) {
    const v = { enabled, from: de.value || '17:00', to: a.value || '21:00' };
    state.settings.happyHour = v;
    await store.setSetting('happyHour', v);
    horaires.hidden = !enabled;
    toast(enabled ? `Bluebird’s Hour de ${v.from} à ${v.to}` : 'Bluebird’s Hour éteint');
  }
  de.addEventListener('change', () => sauverHH(true));
  a.addEventListener('change', () => sauverHH(true));

  const horaires = ligne('Horaires', 'Appliqué tout seul aux produits concernés.',
    h('div', { class: 'rg-heures' }, de, h('span', { class: 'muted' }, '→'), a), { cls: 'rg-sous' });
  horaires.hidden = !hh().enabled;

  // Le PIN se change dans une fenêtre à part : on ne le modifie pas d'un
  // frôlement, et « vide » doit rester un choix volontaire.
  const etatPin = h('span', { class: 'rg-val' });
  const btnPin = h('button', { class: 'btn btn-sm', type: 'button', onclick: changerPin });
  const peindrePin = () => {
    const pin = state.settings.pin;
    etatPin.textContent = pin ? `${pin.length} chiffres` : 'Aucun';
    btnPin.textContent = pin ? 'Modifier' : 'Définir';
  };
  async function changerPin() {
    const input = h('input', { class: 'input', type: 'tel', inputmode: 'numeric', maxlength: 6,
      value: state.settings.pin || '', placeholder: 'Aucun',
      style: 'text-align:center; letter-spacing:.4em; font-size:22px' });
    const v = await modal({
      title: 'Code PIN',
      body: [field('4 à 6 chiffres', input),
        h('div', { class: 'faint', style: 'font-size:13px' }, 'Laisse vide pour retirer le code.')],
      actions: [{ label: 'Annuler', value: false }, { label: 'Enregistrer', kind: 'primary', value: true }],
      onMount: () => setTimeout(() => input.focus(), 50),
    });
    if (v !== true) return;
    const pin = input.value.replace(/\D/g, '');
    state.settings.pin = pin;
    await store.setSetting('pin', pin);
    peindrePin();
    toast(pin ? 'Code PIN enregistré' : 'Code PIN retiré');
  }
  peindrePin();

  return bloc('Le bar', 'Pareil sur tous les appareils',
    ligne('Bluebird’s Hour', '1 acheté = 1 offert, aux heures choisies.',
      interrupteur(!!hh().enabled, sauverHH, 'Bluebird’s Hour')),
    horaires,
    ligne('Code PIN', 'Protège l’onglet Produits et la modification du plan de salle.',
      [etatPin, btnPin]));
}

// ── Aide ─────────────────────────────────────────────────────
function blocAide({ navigate }) {
  const visite = lien('Refaire la visite complète', 'Tous les écrans, un par un.', () => startParcours());
  visite.hidden = !tutoOn();
  return bloc('Aide', null,
    lien('Tutos vidéo', 'Les gestes filmés, avec leurs étapes à cocher.', () => navigate('tutos')),
    ligne('Mode débutant', 'Un tuto guide chaque écran à sa première ouverture. Le bouton « ? » le rejoue.',
      interrupteur(tutoOn(), (on) => { visite.hidden = !on; setTutoOn(on); }, 'Mode débutant')),
    visite);
}

// ── Cet appareil ─────────────────────────────────────────────
function blocAppareil() {
  const profils = h('div', { class: 'm-seg' }, PROFILES.map((pr) => h('button', {
    class: `chip ${pr.id === profileId() ? 'active' : ''}`, type: 'button',
    onclick: async () => {
      if (pr.id === profileId()) return;
      if (!(await confirmDialog(`Passer cet appareil en profil « ${pr.label} » ? ${pr.hint}`, { okLabel: 'Changer' }))) return;
      setProfile(pr.id);
      location.reload();   // le plus simple pour réappliquer onglets et pavés
    },
  }, pr.label)));

  return bloc('Cet appareil', 'Ne change rien sur les autres',
    ligne('Profil', `${profile().hint} Il signe aussi les bons envoyés en cuisine.`, profils, { cls: 'rg-pile' }),
    ligne('Affichage', 'Auto choisit selon la taille de l’écran. Changer recharge la page.', uiModeSelector(), { cls: 'rg-pile' }));
}

// ── Données ──────────────────────────────────────────────────
function blocDonnees() {
  const fichier = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fichier.addEventListener('change', async () => {
    const f = fichier.files[0]; if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      // Un import efface puis réécrit toutes les tables, et la synchro propage
      // l'effacement : ça ne restaure pas cet iPad, ça restaure le bar entier.
      if (!(await confirmDialog('Remplacer toutes les données par cette sauvegarde ? Avec la synchro, cela remplace aussi celles des autres appareils.', { okLabel: 'Importer', danger: true }))) return;
      await store.importAll(dump);
      await loadAll();
      reloadCatalog(); reloadLayout(); reloadOrders(); reloadTickets(); reloadMenage();
      toast('Sauvegarde importée');
    } catch (e) { toast('Fichier invalide'); }
    fichier.value = '';
  });

  const enLigne = cloudEnabled() && syncActive();
  const etat = !cloudEnabled() ? 'Désactivée dans la configuration'
    : enLigne ? 'Connecté à la caisse partagée' : 'Hors ligne : données de cet appareil seulement';

  // Pas de bouton « recharger la carte / le plan par défaut » : avec la
  // synchro, il n'effacerait pas cet appareil mais TOUS les autres. Le seul
  // filet est l'import d'une sauvegarde, qui porte le même avertissement.
  return bloc('Données', null,
    ligne('Synchronisation', null,
      h('span', { class: `rg-etat ${enLigne ? 'ok' : ''}` }, h('i', {}), etat)),
    ligne('Sauvegarde', 'Toute la caisse dans un fichier. Importer remplace les données de tous les appareils.',
      [h('button', { class: 'btn btn-sm', type: 'button', onclick: exporter }, 'Exporter'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => fichier.click() }, 'Importer'),
        fichier]),
    // Verrouiller ne coupe pas la synchro : ça efface le seul jeton d'accès de
    // cet appareil. Au prochain lancement, le verrou d'entrée (gate.js)
    // redemande le mot de passe du bar. La file d'écritures est conservée.
    cloudEnabled() ? ligne('Verrouiller cet appareil', 'Il faudra ressaisir le mot de passe du bar pour rouvrir la caisse.',
      h('button', { class: 'btn btn-sm btn-ghost rg-danger', type: 'button', onclick: async () => {
        if (await confirmDialog('Verrouiller la caisse sur cet appareil ? Il faudra ressaisir le mot de passe du bar pour la rouvrir.', { okLabel: 'Verrouiller', danger: true })) {
          clearToken(); location.reload();
        }
      } }, 'Verrouiller')) : null);
}

async function exporter() {
  const dump = await store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'bluebird-sauvegarde.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Sauvegarde exportée');
}

// `navigate` et `retour` sont injectés par app.js (pas d'import circulaire).
export function renderReglages(container, { navigate, retour }) {
  clear(container);
  container.append(h('div', { class: 'rg-screen' },
    h('div', { class: 'viewbar' },
      h('h2', {}, 'Réglages'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: retour }, 'Fermer')),
    h('div', { class: 'rg-grid' },
      h('div', { class: 'rg-col' }, blocBar(), blocAide({ navigate })),
      h('div', { class: 'rg-col' }, blocAppareil(), blocDonnees()))));
}
