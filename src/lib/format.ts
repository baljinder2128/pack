import { Linking } from 'react-native';

import { colors } from '@/components/ui';
import type { TripStatus } from './types';

export const statusLabel: Record<TripStatus, string> = {
  planned: 'Planned',
  in_progress: 'On the road',
  completed: 'Completed',
};

export const statusColor: Record<TripStatus, string> = {
  planned: colors.muted,
  in_progress: colors.warning,
  completed: colors.success,
};

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function openMap(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
}

export function numOrNull(s: string): number | null {
  const n = Number(s.replace(/[, ]/g, ''));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
}
