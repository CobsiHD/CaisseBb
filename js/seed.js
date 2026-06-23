// Catalogue Bluebird — pré-rempli depuis la carte officielle (menu-6199.pdf).
// Prix nets en euros, taxes & service compris.
// happyHour: true  => éligible "Bluebird's Hour" 17h-21h, 1 acheté = 1 offert.

export const CATEGORIES = [
  { id: 'cocktails',   name: 'Cocktails' },
  { id: 'sans-alcool', name: 'Sans Alcool' },
  { id: 'vins',        name: 'Vins' },
  { id: 'spiritueux',  name: 'Spiritueux' },
  { id: 'bieres',      name: 'Bières' },
  { id: 'softs',       name: 'Softs' },
  { id: 'snack',       name: 'Snack salé' },
];

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Helper : construit un produit normalisé.
// price peut être un nombre (variante unique) ou un objet {label: prix, ...}.
function P(categoryId, sub, name, price, extra = {}) {
  const variants = typeof price === 'number'
    ? [{ label: '', price }]
    : Object.entries(price).map(([label, p]) => ({ label, price: p }));
  return {
    id: `${categoryId}-${slug(name)}`,
    categoryId, sub, name, variants,
    options: extra.options || [],
    happyHour: !!extra.happyHour,
    desc: extra.desc || '',
    available: true,
  };
}

const SAUCES = ['Ketchup', 'Mayonnaise', 'Barbecue', 'Algérienne', 'Samouraï', 'Burger']
  .map((label) => ({ label, delta: 0 }));
const SAUCES2 = ['Mayonnaise', 'Mayonnaise Spicy', 'Barbecue', 'Curry Mango']
  .map((label) => ({ label, delta: 0 }));
const DILUANT = [{ label: 'Diluant', delta: 1 }];

export const PRODUCTS = [
  // ── COCKTAILS ──────────────────────────────────────────────
  P('cocktails', 'Signature', 'Le Bluebird', 10.5,
    { desc: 'Bourbon infusé Hibiscus, Liqueur de Fleur de sureau, Prosecco, Citron, Sirop de miel maison' }),

  P('cocktails', 'Création', 'How Is Your Heart', 11,
    { desc: 'Tequila Milagro, Liqueur Chambord, Citron, Miel, Purée de passion' }),
  P('cocktails', 'Création', 'Alone With Everybody', 11,
    { desc: 'Gin Hendrick’s, Liqueur Fruit de la Passion, Sirop de Fleur de Sureau, Jus de Poire, Citron' }),
  P('cocktails', 'Création', 'A Smile To Remember', 12,
    { desc: 'Hendrick’s Orbium, Sirop de Rose, Liqueur de Marasquin, Jus de Litchi, Citron, Pomelo & Baies Roses' }),
  P('cocktails', 'Création', 'I Will Remember', 12,
    { desc: 'Liqueur de Mandarine, Cognac, Sirop de Noisette, Jus de Pomme, Sirop de Vanille' }),
  P('cocktails', 'Création', 'Raw With Love', 11,
    { desc: 'Vodka Absolut Tabasco, Tomate Acide, Sirop de Pêche, Eau pétillante' }),
  P('cocktails', 'Création', 'More, Much More', 11,
    { desc: 'Rhum infusé au Peanut Butter, Jus d’Ananas infusé à la cannelle, Purée de Coco' }),

  P('cocktails', 'Classiques', 'Mojito', 9,
    { happyHour: true, desc: 'Rhum Havana, Cassonade, Menthe & Citron Vert, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Negroni', 12,
    { happyHour: true, desc: 'Gin Tanqueray Ten, Campari, Vermouth Del Professore Rouge' }),
  P('cocktails', 'Classiques', 'Old Fashioned', 10,
    { happyHour: true, desc: 'Bourbon Bulleit, Sucre, Angostura Bitter' }),
  P('cocktails', 'Classiques', 'Apérol Spritz', 8,
    { happyHour: true, desc: 'Apérol, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Campari Spritz', 9,
    { happyHour: true, desc: 'Campari, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Italicus Spritz', 9,
    { happyHour: true, desc: 'Italicus, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'St Germain Spritz', 9,
    { happyHour: true, desc: 'St Germain, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Limoncello Spritz', 8,
    { happyHour: true, desc: 'Limoncello, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Melonade Spritz', 9,
    { happyHour: true, desc: 'Melonade, Prosecco, Eau Pétillante' }),
  P('cocktails', 'Classiques', 'Margarita', 11,
    { happyHour: true, desc: 'Tequila Milagro, Cointreau, Citron' }),
  P('cocktails', 'Classiques', 'Pina Colada', 10,
    { happyHour: true, desc: 'Rhum Havana 7 ans, Purée de coco, Jus d’Ananas, Citron' }),
  P('cocktails', 'Classiques', 'Cosmopolitan', 11,
    { happyHour: true, desc: 'Vodka Ciroc, Cointreau, Jus de Cranberry, Citron' }),

  // ── SANS ALCOOL ────────────────────────────────────────────
  P('sans-alcool', 'Cocktails Sans Alcool', 'Roll The Dice', 8.5,
    { desc: 'Tanqueray 0%, Sirop de Rose, Jus de Litchi, Citron, Tonic Pomelo & Baies Roses' }),
  P('sans-alcool', 'Cocktails Sans Alcool', 'Cause And Effect', 8.5,
    { desc: 'Sirop Fleur de Sureau, Purée de Passion, Jus de Poire, Citron' }),
  P('sans-alcool', 'Cocktails Sans Alcool', 'Virgin More, Much More', 8.5,
    { desc: 'Captain Morgan infusé au Peanut Butter, Ananas, Coco' }),

  // ── VINS ───────────────────────────────────────────────────
  P('vins', 'Rouges', 'Côtes de Bœuf', { 'Verre': 4.5, 'Bouteille': 23 }),
  P('vins', 'Rouges', 'Crozes Hermitage', { 'Verre': 6, 'Bouteille': 30 }),
  P('vins', 'Rouges', 'Syrah', { 'Verre': 4.5, 'Bouteille': 23 }),
  P('vins', 'Rosé', 'Studio Rosé', { 'Verre': 6, 'Bouteille': 30 }),
  P('vins', 'Rosé', 'Cap des Pins', { 'Verre': 4, 'Bouteille': 21 }),
  P('vins', 'Blancs', 'Chardonnay Bphr', { 'Verre': 4.5, 'Bouteille': 23 }),
  P('vins', 'Blancs', 'Orélie', { 'Verre': 4, 'Bouteille': 21 }),
  P('vins', 'Blancs', 'Uby', { 'Verre': 4.5, 'Bouteille': 23 }),
  P('vins', 'Blancs', 'Studio Blanc', { 'Verre': 6, 'Bouteille': 28 }),
  P('vins', 'Champagne', 'Lallier', { 'Bouteille': 100 }),
  P('vins', 'Champagne', 'Veuve Clicquot', { 'Bouteille': 130 }),
  P('vins', 'Champagne', 'Moët Impérial', { 'Bouteille': 110 }),
  P('vins', 'Champagne', 'Moët Impérial Rosé', { 'Bouteille': 110 }),

  // ── SPIRITUEUX (dose, +1€ diluant) ─────────────────────────
  P('spiritueux', 'Rhums', 'Mathusalem 15 Ans', 11, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Centenario 20e Anniversaire', 12, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Angostura 1919', 12, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Appleton 12 Ans', 13, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Ron Libertad', 14, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Santa Teresa', 14, { options: DILUANT }),
  P('spiritueux', 'Rhums', 'Zacapa 23 Ans', 15, { options: DILUANT }),

  P('spiritueux', 'Whiskys', 'Monkey Shoulder Classic', 9, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'The Deacon', 12, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Bulleit Bourbon', 10, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Bulleit Rye', 10, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Glenfiddich 12 Ans', 13, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Glenfiddich 15 Ans', 14, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Glenfiddich 18 Ans', 15, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Ailsa Bay', 13, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Blanton’s', 15, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Sequoia Black Cat', 14, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Sequoia Craft', 14, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Bellevoye Bleue', 13, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Bellevoye Blanche', 14, { options: DILUANT }),
  P('spiritueux', 'Whiskys', 'Bellevoye Rouge', 15, { options: DILUANT }),

  P('spiritueux', 'Tequilas', 'Milagro Silver', 9, { options: DILUANT }),
  P('spiritueux', 'Tequilas', 'Espolón Reposado', 12, { options: DILUANT }),
  P('spiritueux', 'Tequilas', 'Patrón Platinum', 50, { options: DILUANT }),
  P('spiritueux', 'Tequilas', 'Patron Silver', 13, { options: DILUANT }),
  P('spiritueux', 'Tequilas', 'Patron Reposado', 14, { options: DILUANT }),

  P('spiritueux', 'Gins & Tonic', 'Hendrick’s', 10),
  P('spiritueux', 'Gins & Tonic', 'Hendrick’s Orbium', 10),
  P('spiritueux', 'Gins & Tonic', 'Hendrick’s Neptunia', 10),
  P('spiritueux', 'Gins & Tonic', 'Hendrick’s Flora Adora', 10),
  P('spiritueux', 'Gins & Tonic', 'Hendrick’s Grand Cabaret', 10),
  P('spiritueux', 'Gins & Tonic', '4 Hendrick’s Tonic (service à thé)', 35),
  P('spiritueux', 'Gins & Tonic', 'Kinobi', 10),
  P('spiritueux', 'Gins & Tonic', 'Après 92 Black Raspberry', 11),
  P('spiritueux', 'Gins & Tonic', 'Après 92 Spices & Orange', 11),
  P('spiritueux', 'Gins & Tonic', 'June Pastèque', 10),
  P('spiritueux', 'Gins & Tonic', 'June Poire & Cardamome', 10),
  P('spiritueux', 'Gins & Tonic', 'June Mangue & Passion', 10),
  P('spiritueux', 'Gins & Tonic', 'June Pêche de Vigne', 10),
  P('spiritueux', 'Gins & Tonic', 'Tanqueray Ten', 10),
  P('spiritueux', 'Gins & Tonic', 'Renais', 11),
  P('spiritueux', 'Gins & Tonic', 'Birdie', 11),

  P('spiritueux', 'Liqueurs & Autres', 'Get27', 7),
  P('spiritueux', 'Liqueurs & Autres', 'Génépi', 8),
  P('spiritueux', 'Liqueurs & Autres', 'Chartreuse Verte', 8),
  P('spiritueux', 'Liqueurs & Autres', 'Chartreuse Jaune', 8),
  P('spiritueux', 'Liqueurs & Autres', 'Chartreuse VEP', 40),
  P('spiritueux', 'Liqueurs & Autres', 'Pastis des Alpes', 3),
  P('spiritueux', 'Liqueurs & Autres', 'La Guilde du Cognac Fins Bois 2011', 15),
  P('spiritueux', 'Liqueurs & Autres', 'Martel VSOP Cognac', 14),
  P('spiritueux', 'Liqueurs & Autres', 'Patron XO Café', 8),

  // ── BIÈRES ─────────────────────────────────────────────────
  P('bieres', 'Pressions', 'Bud', { '25cl': 3.5, '50cl': 5.5 }, { happyHour: true }),
  P('bieres', 'Pressions', 'Hoegarden Rosé', { '25cl': 5, '50cl': 8 }, { happyHour: true }),
  P('bieres', 'Pressions', 'Kasteel Framboise', { '25cl': 5, '50cl': 8 }, { happyHour: true }),
  P('bieres', 'Pressions', 'Mont-Blanc Rousse', { '25cl': 5, '50cl': 8 }, { happyHour: true }),
  P('bieres', 'Pressions', 'La Bagarre', { '25cl': 5, '50cl': 8 }, { happyHour: true }),
  P('bieres', 'Pressions', 'Delirium Tremens', { '25cl': 5.5, '50cl': 8.5 }, { happyHour: true }),
  P('bieres', 'Pressions', 'La Ballon d’orge', { '25cl': 5, '50cl': 8 }, { happyHour: true }),
  P('bieres', 'Bouteilles', 'Kasteel 0%', 6,
    { options: [{ label: 'Rouge', delta: 0 }, { label: 'Tropicale', delta: 0 }] }),

  // ── SOFTS ──────────────────────────────────────────────────
  P('softs', 'Classiques', 'Limonade', 3.2),
  P('softs', 'Classiques', 'Coca-Cola Classique', 3.5),
  P('softs', 'Classiques', 'Coca-Cola Zéro', 3.5),
  P('softs', 'Classiques', 'Badoit Fines Bulles', 3.5),
  P('softs', 'Classiques', 'Sirop', 2.5,
    { options: ['Fraise', 'Grenadine', 'Menthe', 'Pêche', 'Citron'].map((l) => ({ label: l, delta: 0 })) }),
  P('softs', 'Classiques', 'Diabolo', 3.5,
    { options: ['Fraise', 'Grenadine', 'Menthe', 'Pêche', 'Citron'].map((l) => ({ label: l, delta: 0 })) }),
  P('softs', 'Classiques', 'Jus de Fruits Granini', 3.5,
    { options: ['Tomate', 'Orange', 'Pomme'].map((l) => ({ label: l, delta: 0 })) }),
  P('softs', 'Schweppes', 'Schweppes Tonic', 4.5),
  P('softs', 'Schweppes', 'Schweppes Soda Pomelo', 4.5),
  P('softs', 'Schweppes', 'Schweppes Ginger Beer', 4.5),

  // ── SNACK SALÉ ─────────────────────────────────────────────
  P('snack', 'À grignoter', 'Frites maison', 5, { options: SAUCES }),
  P('snack', 'À grignoter', 'Frites maison XXL', 10, { options: SAUCES }),
  P('snack', 'À grignoter', 'Chilli Cheese (6 pièces)', 7, { options: SAUCES2 }),
  P('snack', 'À grignoter', 'Tenders de poulet (4 pièces)', 7, { options: SAUCES2 }),
  P('snack', 'À grignoter', 'Plateau Charcuterie & Fromage', { 'Petite': 14.5, 'Grande': 20.5 }),
];

// Plan de démonstration (coordonnées dans le plan logique 1200×760, éditable ensuite).
export const DEMO_LAYOUT = [
  // Terrasse
  { area: 'terrasse', type: 'enseigne_bluebird', x: 500, y: 8,  w: 200, h: 51,  rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'guirlande_lumineuse', x: 150, y: 70, w: 300, h: 74, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'guirlande_lumineuse', x: 560, y: 70, w: 300, h: 74, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'platane', x: 975, y: 110, w: 185, h: 185, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'parasol', x: 120, y: 290, w: 175, h: 175, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'table_haute_ronde',  x: 175, y: 330, w: 130, h: 130, rotation: 0, number: '301', capacity: 4, zone: 'Terrasse' },
  { area: 'terrasse', type: 'table_haute_carree', x: 430, y: 330, w: 130, h: 130, rotation: 0, number: '302', capacity: 4, zone: 'Terrasse' },
  { area: 'terrasse', type: 'table_basse_ronde',  x: 690, y: 340, w: 150, h: 120, rotation: 0, number: '303', capacity: 2, zone: 'Terrasse' },
  { area: 'terrasse', type: 'table_haute_ronde',  x: 930, y: 380, w: 130, h: 130, rotation: 0, number: '304', capacity: 4, zone: 'Terrasse' },
  { area: 'terrasse', type: 'jardiniere', x: 150, y: 560, w: 175, h: 33, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'terrasse', type: 'moto', x: 980, y: 560, w: 120, h: 75, rotation: 0, number: '', capacity: 0, zone: '' },
  // Arcade
  { area: 'arcade', type: 'enseigne_neon_b', x: 80, y: 40, w: 70, h: 80, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'arcade', type: 'enseigne_bluebird', x: 470, y: 30, w: 220, h: 56, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'arcade', type: 'table_basse_ronde', x: 300, y: 300, w: 150, h: 120, rotation: 0, number: '201', capacity: 2, zone: 'Arcade' },
  { area: 'arcade', type: 'table_basse_ronde', x: 650, y: 300, w: 150, h: 120, rotation: 0, number: '202', capacity: 2, zone: 'Arcade' },
  { area: 'arcade', type: 'tabouret_noir', x: 270, y: 250, w: 46, h: 46, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'arcade', type: 'tabouret_noir', x: 470, y: 250, w: 46, h: 46, rotation: 0, number: '', capacity: 0, zone: '' },
  // Intérieur (tapis en premier = au fond)
  { area: 'interieur', type: 'tapis_oriental', x: 360, y: 360, w: 440, h: 280, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'comptoir_bar', x: 55, y: 45, w: 380, h: 267, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'tireuse_biere', x: 210, y: 300, w: 60, h: 63, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'lustre_cristal', x: 540, y: 110, w: 120, h: 120, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'cadre_tableau', x: 760, y: 40, w: 110, h: 83, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'miroir_baroque', x: 1060, y: 150, w: 80, h: 105, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'table_ronde_nappe', x: 470, y: 380, w: 140, h: 140, rotation: 0, number: '101', capacity: 4, zone: 'Salle' },
  { area: 'interieur', type: 'table_gueridon',    x: 720, y: 400, w: 110, h: 110, rotation: 0, number: '102', capacity: 2, zone: 'Salle' },
  { area: 'interieur', type: 'table_ronde_nappe', x: 920, y: 380, w: 140, h: 140, rotation: 0, number: '103', capacity: 4, zone: 'Salle' },
  { area: 'interieur', type: 'fauteuil_chesterfield', x: 470, y: 540, w: 95, h: 100, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'canape_chesterfield_3p', x: 850, y: 545, w: 200, h: 100, rotation: 0, number: '', capacity: 0, zone: '' },
  { area: 'interieur', type: 'gramophone', x: 120, y: 430, w: 90, h: 80, rotation: 0, number: '', capacity: 0, zone: '' },
];

export const SETTINGS_DEFAULTS = {
  pin: '',
  activeArea: 'terrasse',
  happyHour: { enabled: false, from: '17:00', to: '21:00' },
};
