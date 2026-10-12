import { colors } from '@/components/ui';
import { addDays, toISODate } from './pay';

/** Licence expiry status for badges on the drivers list. */
export function licenceStatus(expiry: string | null): { label: string; color: string } | null {
  if (!expiry) return null;
  const today = toISODate(new Date());
  if (expiry < today) return { label: 'Licence expired', color: colors.danger };
  if (expiry <= addDays(today, 30)) return { label: 'Licence expires soon', color: colors.warning };
  return null;
}
