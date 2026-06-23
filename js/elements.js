// elements.js — bibliothèque d'éléments du plan (visuels assets_terrasse/ & assets_interieur/).
// img = chemin de base (sans .png). areas = zones où l'élément est proposé dans la palette.
// w/h = taille logique par défaut (px du plan), respectant le ratio de l'image.
const EXT = ['terrasse', 'arcade'];   // mobilier d'extérieur (+ arcade)
const INT = ['interieur', 'arcade'];  // mobilier d'intérieur (+ arcade)

export const ELEMENT_TYPES = [
  // ── EXTÉRIEUR / TERRASSE ──────────────────────────────────
  { group: 'Tables',  type: 'table_haute_ronde',  label: 'Table ronde',  img: 'assets_terrasse/table_haute_ronde',  w: 130, h: 130, isTable: true,  capacity: 4, areas: EXT },
  { group: 'Tables',  type: 'table_haute_carree', label: 'Table carrée',  img: 'assets_terrasse/table_haute_carree', w: 130, h: 130, isTable: true,  capacity: 4, areas: EXT },
  { group: 'Tables',  type: 'table_basse_ronde',  label: 'Table basse',   img: 'assets_terrasse/table_basse_ronde',  w: 150, h: 120, isTable: true,  capacity: 2, areas: EXT },
  { group: 'Assises', type: 'chaise_noire',  label: 'Chaise noire', img: 'assets_terrasse/chaise_noire',  w: 52, h: 60, isTable: false, capacity: 0, areas: EXT },
  { group: 'Assises', type: 'chaise_verte',  label: 'Chaise verte', img: 'assets_terrasse/chaise_verte',  w: 52, h: 60, isTable: false, capacity: 0, areas: EXT },
  { group: 'Assises', type: 'tabouret',      label: 'Tabouret',     img: 'assets_terrasse/tabouret',      w: 46, h: 46, isTable: false, capacity: 0, areas: EXT },
  { group: 'Assises', type: 'tabouret_noir', label: 'Tabouret noir',img: 'assets_terrasse/tabouret_noir', w: 46, h: 46, isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'parasol',     label: 'Parasol',   img: 'assets_terrasse/parasol',     w: 175, h: 175, isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'platane',     label: 'Arbre',     img: 'assets_terrasse/platane',     w: 185, h: 185, isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'jardiniere',  label: 'Jardinière',img: 'assets_terrasse/jardiniere',  w: 175, h: 33,  isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'arche_pierre',label: 'Arche',     img: 'assets_terrasse/arche_pierre',w: 185, h: 60,  isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'mat_bois',    label: 'Mât',       img: 'assets_terrasse/mat_bois',    w: 42, h: 42,   isTable: false, capacity: 0, areas: EXT },
  { group: 'Décor',   type: 'moto',        label: 'Moto',      img: 'assets_terrasse/moto',        w: 120, h: 75,  isTable: false, capacity: 0, areas: EXT },
  { group: 'Lumières',type: 'guirlande_lumineuse', label: 'Guirlande', img: 'assets_terrasse/guirlande_lumineuse', w: 210, h: 74, isTable: false, capacity: 0, areas: EXT },
  { group: 'Lumières',type: 'enseigne_bluebird',   label: 'Enseigne',  img: 'assets_terrasse/enseigne_bluebird',   w: 190, h: 49, isTable: false, capacity: 0, areas: ['terrasse', 'arcade', 'interieur'] },
  { group: 'Lumières',type: 'enseigne_neon_b',     label: 'Néon B',    img: 'assets_terrasse/enseigne_neon_b',     w: 70,  h: 80, isTable: false, capacity: 0, areas: ['terrasse', 'arcade', 'interieur'] },
  { group: 'Sol',     type: 'caniveau',    label: 'Caniveau',  img: 'assets_terrasse/caniveau',    w: 175, h: 24,  isTable: false, capacity: 0, areas: EXT },

  // ── INTÉRIEUR ─────────────────────────────────────────────
  { group: 'Tables',  type: 'table_ronde_nappe', label: 'Table nappée', img: 'assets_interieur/table_ronde_nappe', w: 140, h: 140, isTable: true, capacity: 4, areas: INT },
  { group: 'Tables',  type: 'table_gueridon',    label: 'Guéridon',     img: 'assets_interieur/table_gueridon',    w: 110, h: 110, isTable: true, capacity: 2, areas: INT },
  { group: 'Assises', type: 'chaise_velours',         label: 'Chaise velours', img: 'assets_interieur/chaise_velours',         w: 60,  h: 63,  isTable: false, capacity: 0, areas: INT },
  { group: 'Assises', type: 'fauteuil_chesterfield',  label: 'Fauteuil',       img: 'assets_interieur/fauteuil_chesterfield',  w: 95,  h: 100, isTable: false, capacity: 0, areas: INT },
  { group: 'Assises', type: 'canape_chesterfield_2p', label: 'Canapé 2p',      img: 'assets_interieur/canape_chesterfield_2p', w: 160, h: 111, isTable: false, capacity: 0, areas: INT },
  { group: 'Assises', type: 'canape_chesterfield_3p', label: 'Canapé 3p',      img: 'assets_interieur/canape_chesterfield_3p', w: 200, h: 100, isTable: false, capacity: 0, areas: INT },
  { group: 'Assises', type: 'tabouret_bar_velours',   label: 'Tabouret bar',   img: 'assets_interieur/tabouret_bar_velours',   w: 56,  h: 56,  isTable: false, capacity: 0, areas: INT },
  { group: 'Bar',     type: 'comptoir_bar',  label: 'Comptoir', img: 'assets_interieur/comptoir_bar',  w: 380, h: 267, isTable: false, capacity: 0, areas: INT },
  { group: 'Bar',     type: 'tireuse_biere',  label: 'Tireuse',  img: 'assets_interieur/tireuse_biere',  w: 60,  h: 63,  isTable: false, capacity: 0, areas: INT },
  { group: 'Lumières',type: 'lustre_cristal',   label: 'Lustre cristal', img: 'assets_interieur/lustre_cristal',   w: 120, h: 120, isTable: false, capacity: 0, areas: INT },
  { group: 'Lumières',type: 'lustre_cage',      label: 'Lustre cage',    img: 'assets_interieur/lustre_cage',      w: 110, h: 110, isTable: false, capacity: 0, areas: INT },
  { group: 'Lumières',type: 'lampe_champignon', label: 'Lampe',          img: 'assets_interieur/lampe_champignon', w: 60,  h: 60,  isTable: false, capacity: 0, areas: INT },
  { group: 'Lumières',type: 'applique_murale',  label: 'Applique',       img: 'assets_interieur/applique_murale',  w: 56,  h: 59,  isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'gramophone',          label: 'Gramophone', img: 'assets_interieur/gramophone',          w: 90, h: 80,  isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'cadre_tableau',       label: 'Cadre',      img: 'assets_interieur/cadre_tableau',       w: 110, h: 83, isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'miroir_baroque',      label: 'Miroir baroque', img: 'assets_interieur/miroir_baroque',  w: 80, h: 105, isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'miroir_rectangulaire',label: 'Miroir',     img: 'assets_interieur/miroir_rectangulaire',w: 80, h: 103, isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'porte_manteau',       label: 'Porte-manteau', img: 'assets_interieur/porte_manteau',    w: 70, h: 70,  isTable: false, capacity: 0, areas: INT },
  { group: 'Décor',   type: 'logo_bb',             label: 'Logo BB',    img: 'assets_interieur/logo_bb',             w: 75, h: 100, isTable: false, capacity: 0, areas: ['interieur', 'arcade'] },
  { group: 'Sol',     type: 'tapis_oriental', label: 'Tapis', img: 'assets_interieur/tapis_oriental', w: 280, h: 178, isTable: false, capacity: 0, areas: INT },
];

export const TYPE_MAP = Object.fromEntries(ELEMENT_TYPES.map((t) => [t.type, t]));

// Compat : anciens types -> images, pour que les plans déjà créés s'affichent.
const LEGACY_IMG = {
  'table-round': 'assets_terrasse/table_haute_ronde',
  'table-square': 'assets_terrasse/table_haute_carree',
  'table-rect': 'assets_terrasse/table_haute_carree',
  'chair': 'assets_terrasse/chaise_noire',
  'plant': 'assets_terrasse/platane',
};
const LEGACY_TABLE = new Set(['table-round', 'table-square', 'table-rect']);

export function assetFor(type) {
  return TYPE_MAP[type]?.img || LEGACY_IMG[type] || null;
}
export function isTableType(type) {
  return !!TYPE_MAP[type]?.isTable || LEGACY_TABLE.has(type);
}
// Types proposés dans la palette pour une zone donnée.
export function typesForArea(area) {
  return ELEMENT_TYPES.filter((t) => (t.areas || []).includes(area));
}
