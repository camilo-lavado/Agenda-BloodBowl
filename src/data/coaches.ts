export interface Coach {
  /** slug estable; debe coincidir con el "id" en supabase/schema.sql y en schedule.ts */
  id: string;
  team_name: string;
  fumbbl_coach: string;
  race: string;
}

// Miembros del torneo "Tasting Blood VI 2026" (FUMBBL).
// Esto es la semilla fija. Los datos editables (nombre real, WhatsApp, notas)
// viven en Supabase y se cargan encima al abrir la página.
export const coaches: Coach[] = [
  { id: 'boumboumboum',              team_name: 'Boumboumboum',                    fumbbl_coach: 'ManestBB',                 race: 'Snotling' },
  { id: 'limari-zigurratz',          team_name: 'limari zigurratz',                fumbbl_coach: 'Benjagomez',               race: 'Chaos Dwarf' },
  { id: 'la-orden-del-santo-pernil', team_name: 'La orden del Santo Pernil',       fumbbl_coach: 'kroszover',                race: 'Bretonnian' },
  { id: 'necrotasting',              team_name: 'NecroTasting',                    fumbbl_coach: 'Varadal',                  race: 'Necromantic Horror' },
  { id: 'a-tut-voyage',              team_name: 'A Tut Voyage',                    fumbbl_coach: 'Virtuh4',                  race: 'Shambling Undead' },
  { id: 'goblins-sea-shanties',      team_name: 'Goblins Sea Shanties',            fumbbl_coach: 'FlySweater',               race: 'Goblin' },
  { id: 'caballeros-de-dol-amroth',  team_name: 'Caballeros de Dol Amroth',        fumbbl_coach: 'Yerkoacc',                 race: 'Bretonnian' },
  { id: 'defensores-de-ulthuan',     team_name: 'Defensores de Ulthuan [TB]',      fumbbl_coach: 'Kanekiiiiiiiiiiii',        race: 'High Elf' },
  { id: 'les-chevaliers',            team_name: 'Les Chevaliers dl Derniere Aube', fumbbl_coach: 'Kross',                    race: 'Bretonnian' },
  { id: 'olor-a-pescao',             team_name: 'Olor a Pescao [Tasting VI]',      fumbbl_coach: 'Nogardo',                  race: 'Dark Elf' },
  { id: 'desert-eagles',             team_name: 'Desert_Eagles',                   fumbbl_coach: 'Diegochea',               race: 'High Elf' },
  { id: 'alianza-mafiosa',           team_name: 'Alianza Mafiosa (Liga)',          fumbbl_coach: 'CESARGORAS',               race: 'Old World Alliance' },
  { id: 'dead-drunks',               team_name: 'Dead Drunks (torneo)',            fumbbl_coach: 'BarbarellaTheConqueror',   race: 'Necromantic Horror' },
  { id: 'red-corsairs',             team_name: 'Red Corsairs Tasting 2026',       fumbbl_coach: 'Erevan002',               race: 'Dark Elf' },
];
