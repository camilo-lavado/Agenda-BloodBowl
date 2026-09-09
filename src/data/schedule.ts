// Emparejamientos por ronda. Edita esto cuando cambie la ronda:
// solo hay que actualizar los pares (usa los "id" de coaches.ts) y "currentRoundKey".
export type Pair = [string, string];

export const currentRoundLabel = 'Ronda 1';
// Clave corta y estable de la ronda; se usa para el id de cada partido en Supabase.
export const currentRoundKey = 'r1';

// id único y estable de un partido (no depende del orden en que se abra).
export function fixtureId(a: string, b: string): string {
  return `${currentRoundKey}__${[a, b].sort().join('__')}`;
}

export const currentRound: Pair[] = [
  ['desert-eagles', 'defensores-de-ulthuan'],
  ['caballeros-de-dol-amroth', 'dead-drunks'],
  ['boumboumboum', 'olor-a-pescao'],
  ['limari-zigurratz', 'la-orden-del-santo-pernil'],
  ['red-corsairs', 'necrotasting'],
  ['les-chevaliers', 'alianza-mafiosa'],
  ['a-tut-voyage', 'goblins-sea-shanties'],
];

export function rivalId(id: string): string | null {
  const pair = currentRound.find((p) => p[0] === id || p[1] === id);
  if (!pair) return null;
  return pair[0] === id ? pair[1] : pair[0];
}
