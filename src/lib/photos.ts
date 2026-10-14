import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

/** Random v4 UUID; fine for a row id and storage folder name. */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Takes a photo or picks some from the gallery; returns their local URIs. */
export async function pickPhotos(source: 'camera' | 'library'): Promise<string[]> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alert('Camera permission is needed to take photos.');
      return [];
    }
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 10 });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Uploads a local photo to a private bucket as JPEG. */
export async function uploadPhoto(bucket: string, path: string, uri: string) {
  const bytes = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
}
