// profile.js — le profil de CET appareil : « Bluebird » ou « Le 22 ».
//
// Il vit en localStorage, jamais dans la table `settings` : celle-ci est
// synchronisée entre les iPads, et le profil du 22 se propagerait au bar entier.
// Même principe que la bascule téléphone/iPad (voir mobile/shell.js).
//
// Ce que le profil change :
//   • les onglets visibles sur cet appareil ;
//   • les familles proposées sur les pavés de touches.
// Tout ce qui reste visible est envoyable et imprimable : les droits découlent
// de ce qu'on voit, il n'y a pas de seconde règle cachée.
import { state } from './state.js';

const KEY = 'bb-profile';

export const PROFILES = [
  {
    id: 'bluebird',
    label: 'Bluebird',
    hint: 'Tous les onglets, toutes les familles.',
    // null = aucun filtrage.
    tabs: null,
    allCategories: true,
  },
  {
    id: '22',
    label: 'Le 22',
    hint: 'Comptoir, Salle et Cuisine. Seules les familles cochées « Disponible au 22 ».',
    tabs: ['home', 'floor', 'cuisine'],
    allCategories: false,
  },
];

export function profileId() {
  try { return localStorage.getItem(KEY) || 'bluebird'; } catch { return 'bluebird'; }
}

export function profile() {
  return PROFILES.find((p) => p.id === profileId()) || PROFILES[0];
}

export function setProfile(id) {
  try { localStorage.setItem(KEY, id); } catch {}
}

/** Le libellé qui signe les bons envoyés depuis cet appareil. */
export function senderLabel() {
  return profile().label;
}

export function tabAllowed(view) {
  const tabs = profile().tabs;
  return !tabs || tabs.includes(view);
}

/** Le Bluebird voit tout ; le 22 ne voit que les familles cochées. */
export function categoryAllowed(cat) {
  return profile().allCategories || !!cat?.au22;
}

/** Les familles à proposer sur les pavés de touches de cet appareil. */
export function visibleCategories() {
  return state.categories.filter(categoryAllowed);
}
