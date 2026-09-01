// openorder.js — aiguillage vers le bon écran de prise de commande.
//
// Le plan de salle et le tableau de bord n'ont pas à savoir sur quel appareil
// ils tournent : ils demandent « ouvre la note de cette table », et c'est ici
// qu'on choisit l'écran iPad (deux colonnes) ou l'écran téléphone (une colonne).
import { isMobileUI } from './mobile/shell.js';
import { openNote as openPadNote } from './order.js';
import { openMOrder } from './mobile/morder.js';

export function openNote(tableId) {
  if (isMobileUI()) openMOrder(tableId);
  else openPadNote(tableId);
}
