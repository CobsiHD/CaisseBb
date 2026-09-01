// cloud-config.js — configuration de la synchronisation entre iPads.
//
// Les données sont hébergées sur TON serveur (VPS), pas chez un tiers.
// Voir DEPLOY.md pour l'installation.
export const CLOUD = {
  // false = chaque iPad reste autonome (données locales uniquement).
  ENABLED: true,

  // Adresse de l'API. Vide = même serveur que le site (cas normal).
  // À remplir seulement si l'API est sur un autre domaine, ex. 'https://caisse.exemple.fr'.
  URL: '',
};
