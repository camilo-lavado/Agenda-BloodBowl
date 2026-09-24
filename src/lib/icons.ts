// Iconos Lucide (lucide-static, licencia ISC) como SVG en línea.
// Se usan tanto en el servidor (frontmatter de Astro) como en el <script> del cliente.
import skull from 'lucide-static/icons/skull.svg?raw';
import ghost from 'lucide-static/icons/ghost.svg?raw';
import shield from 'lucide-static/icons/shield.svg?raw';
import castle from 'lucide-static/icons/castle.svg?raw';
import hammer from 'lucide-static/icons/hammer.svg?raw';
import axe from 'lucide-static/icons/axe.svg?raw';
import sprout from 'lucide-static/icons/sprout.svg?raw';
import sword from 'lucide-static/icons/sword.svg?raw';
import bowArrow from 'lucide-static/icons/bow-arrow.svg?raw';
import trophy from 'lucide-static/icons/trophy.svg?raw';
import goal from 'lucide-static/icons/goal.svg?raw';
import swords from 'lucide-static/icons/swords.svg?raw';
import target from 'lucide-static/icons/target.svg?raw';
import star from 'lucide-static/icons/star.svg?raw';
import droplet from 'lucide-static/icons/droplet.svg?raw';
import clover from 'lucide-static/icons/clover.svg?raw';
import heartCrack from 'lucide-static/icons/heart-crack.svg?raw';
import bandage from 'lucide-static/icons/bandage.svg?raw';
import hospital from 'lucide-static/icons/hospital.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import triangleAlert from 'lucide-static/icons/triangle-alert.svg?raw';
import calendar from 'lucide-static/icons/calendar.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw';
import externalLink from 'lucide-static/icons/external-link.svg?raw';

const RAW = {
  skull, ghost, shield, castle, hammer, axe, sprout, sword,
  'bow-arrow': bowArrow, trophy, goal, swords, target, star, droplet, clover,
  'heart-crack': heartCrack, bandage, hospital, lock,
  'triangle-alert': triangleAlert, calendar, x, check,
  'chevron-right': chevronRight, 'chevron-left': chevronLeft,
  'external-link': externalLink,
} as const;

export type IconName = keyof typeof RAW;

function clean(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="24"/g, '')
    .replace(/class="[^"]*"/, '')
    .trim();
}

const CLEAN = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k, clean(v)]),
) as Record<IconName, string>;

/** SVG Lucide en línea; hereda color (currentColor) y tamaño (1em). */
export function icon(name: IconName, cls = ''): string {
  const klass = `ico ${cls}`.trim();
  return CLEAN[name].replace('<svg', `<svg class="${klass}" aria-hidden="true" focusable="false"`);
}

/** Icono por raza de equipo. */
const RACE: Record<string, IconName> = {
  'High Elf': 'bow-arrow',
  'Dark Elf': 'sword',
  Snotling: 'sprout',
  'Chaos Dwarf': 'hammer',
  Bretonnian: 'castle',
  'Necromantic Horror': 'skull',
  'Shambling Undead': 'ghost',
  Goblin: 'axe',
  'Old World Alliance': 'shield',
};
export const raceIcon = (race: string): string => icon(RACE[race] ?? 'trophy', 'ico-race');
