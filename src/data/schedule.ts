// Emparejamientos por ronda. Cuando salga una ronda nueva: añade un bloque
// nuevo al final de "rounds" (usa los "id" de coaches.ts). Las rondas
// anteriores se quedan tal cual, para poder verlas en el carrusel.
export type Pair = [string, string];

export interface RoundDef {
  /** Clave corta y estable; se usa para el id de cada partido en Supabase. */
  key: string;
  label: string;
  pairs: Pair[];
}

export const rounds: RoundDef[] = [
  {
    key: 'r1',
    label: 'Ronda 1',
    pairs: [
      ['desert-eagles', 'defensores-de-ulthuan'],
      ['caballeros-de-dol-amroth', 'dead-drunks'],
      ['boumboumboum', 'olor-a-pescao'],
      ['limari-zigurratz', 'la-orden-del-santo-pernil'],
      ['red-corsairs', 'necrotasting'],
      ['les-chevaliers', 'alianza-mafiosa'],
      ['a-tut-voyage', 'goblins-sea-shanties'],
    ],
  },
  {
    key: 'r2',
    label: 'Ronda 2',
    pairs: [
      ['a-tut-voyage', 'la-orden-del-santo-pernil'],
      ['defensores-de-ulthuan', 'red-corsairs'],
      ['les-chevaliers', 'boumboumboum'],
      ['dead-drunks', 'desert-eagles'],
      ['caballeros-de-dol-amroth', 'alianza-mafiosa'],
      ['limari-zigurratz', 'goblins-sea-shanties'],
      ['olor-a-pescao', 'necrotasting'],
    ],
  },
  {
    key: 'r3',
    label: 'Ronda 3',
    pairs: [
      ['la-orden-del-santo-pernil', 'les-chevaliers'],
      ['defensores-de-ulthuan', 'boumboumboum'],
      ['red-corsairs', 'desert-eagles'],
      ['limari-zigurratz', 'a-tut-voyage'],
      ['olor-a-pescao', 'caballeros-de-dol-amroth'],
      ['alianza-mafiosa', 'dead-drunks'],
      ['necrotasting', 'goblins-sea-shanties'],
    ],
  },
];

export const currentRound = rounds[rounds.length - 1];
export const currentRoundKey = currentRound.key;
export const currentRoundLabel = currentRound.label;

// id único y estable de un partido (no depende del orden en que se abra).
export function fixtureId(roundKey: string, a: string, b: string): string {
  return `${roundKey}__${[a, b].sort().join('__')}`;
}

// Rival de "id" en la ronda actual (para la ficha de contacto y "tu partido").
export function rivalId(id: string): string | null {
  const pair = currentRound.pairs.find((p) => p[0] === id || p[1] === id);
  if (!pair) return null;
  return pair[0] === id ? pair[1] : pair[0];
}
