import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Background location task. Must be defined at module load (imported from the
// root layout) so the OS can wake the app and deliver positions to it.
export const TRACKING_TASK = 'sbt-duty-tracking';

type LocationTaskData = { locations: Location.LocationObject[] };

if (Platform.OS !== 'web') {
  TaskManager.defineTask<LocationTaskData>(TRACKING_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const { data: auth } = await supabase.auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) return;

    const rows = data.locations.map((l) => ({
      driver_id: userId,
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy: l.coords.accuracy,
      speed: l.coords.speed,
      heading: l.coords.heading,
      recorded_at: new Date(l.timestamp).toISOString(),
    }));
    const { error: insertError } = await supabase.from('driver_locations').insert(rows);
    // RLS rejects inserts once the driver is off duty; stop the task then.
    if (insertError?.code === '42501') {
      await stopTracking();
      return;
    }

    const last = data.locations[data.locations.length - 1];
    await supabase
      .from('trips')
      .update({ last_lat: last.coords.latitude, last_lng: last.coords.longitude, last_seen_at: new Date(last.timestamp).toISOString() })
      .eq('driver_id', userId)
      .eq('status', 'in_progress');
  });
}

/**
 * Asks for location permission (foreground, then "Allow all the time") and
 * starts background updates. Returns an error message, or null on success.
 */
export async function startTracking(): Promise<string | null> {
  if (Platform.OS === 'web') return 'Live tracking works in the Android and iOS apps only.';
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'Location permission is needed to go on duty.';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted')
    return 'Choose "Allow all the time" for location so the office can see you while the app is in the background.';

  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) return null;
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60 * 1000,
    distanceInterval: 200,
    deferredUpdatesInterval: 60 * 1000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'SBT Trucking: on duty',
      notificationBody: 'Your location is shared with the office. Go off duty in the app to stop.',
      notificationColor: '#1d4ed8',
    },
  });
  return null;
}

export async function stopTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}

/** Sends one position straight away so the office map updates immediately. */
export async function sendCurrentPosition(userId: string): Promise<void> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await supabase.from('driver_locations').insert({
      driver_id: userId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
    });
  } catch {
    // The background task will catch up.
  }
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
