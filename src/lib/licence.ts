import { colors } from '@/components/ui';
import { addDays, parseISODate, toISODate } from './pay';

/** Licence expiry status for badges on the drivers list. */
export function licenceStatus(expiry: string | null): { label: string; color: string } | null {
  if (!expiry) return null;
  const today = toISODate(new Date());
  if (expiry < today) return { label: 'Licence expired', color: colors.danger };
  if (expiry <= addDays(today, 30)) return { label: 'Licence expires soon', color: colors.warning };
  return null;
}

// Australian heavy vehicle licence classes.
export const LICENCE_CLASSES = [
  { value: 'MC', label: 'MC – Multi combination' },
  { value: 'HC', label: 'HC – Heavy combination' },
  { value: 'HR', label: 'HR – Heavy rigid' },
  { value: 'MR', label: 'MR – Medium rigid' },
  { value: 'LR', label: 'LR – Light rigid' },
  { value: 'C', label: 'C – Car' },
];

export const STATES = [
  { value: 'NSW', label: 'NSW – New South Wales' },
  { value: 'VIC', label: 'VIC – Victoria' },
  { value: 'QLD', label: 'QLD – Queensland' },
  { value: 'WA', label: 'WA – Western Australia' },
  { value: 'SA', label: 'SA – South Australia' },
  { value: 'TAS', label: 'TAS – Tasmania' },
  { value: 'ACT', label: 'ACT – Australian Capital Territory' },
  { value: 'NT', label: 'NT – Northern Territory' },
];

/** Days until the licence expires (negative once expired), or null with no expiry on file. */
export function daysToExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const today = parseISODate(toISODate(new Date())).getTime();
  return Math.round((parseISODate(expiry).getTime() - today) / 86400000);
}
