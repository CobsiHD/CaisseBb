// mobile/views.js — table de routage de l'interface téléphone.
//
// Carte, Recettes, Produits, Tableau de bord, Cuisine et Ménage sont déjà en colonne
// unique :
// ils réutilisent les vues de l'iPad, que le CSS mobile resserre. Seuls la
// salle et le comptoir ont une mise en page à part.
import { renderMenu } from '../menu.js';
import { renderRecettes } from '../recettes.js';
import { renderCatalog } from '../catalog.js';
import { renderDashboard } from '../dashboard.js';
import { renderCuisine } from '../cuisine.js';
import { renderMenage } from '../menage.js';
import { renderMFloor } from './mfloor.js';
import { renderMHome } from './mhome.js';

export const MOBILE_VIEWS = {
  home: renderMHome,
  floor: renderMFloor,
  menu: renderMenu,
  recettes: renderRecettes,
  catalog: renderCatalog,
  dashboard: renderDashboard,
  cuisine: renderCuisine,
  menage: renderMenage,
};

// Sur téléphone on arrive dans la salle : c'est de là que part le service.
export const MOBILE_HOME_VIEW = 'floor';
