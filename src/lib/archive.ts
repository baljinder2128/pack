import { alert } from './alert';
import { supabase } from './supabase';

/**
 * Removes a reviewed record from the office lists, or puts it back. The record
 * itself is never deleted; it stays in the Archive view permanently.
 * Resolves false if the user cancels.
 */
export function setArchived(table: 'trips' | 'inspections', id: string, archive: boolean, userId: string): Promise<boolean> {
  const run = async () => {
    const { error } = await supabase
      .from(table)
      .update(archive ? { archived_at: new Date().toISOString(), archived_by: userId } : { archived_at: null, archived_by: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  };
  if (!archive) return run();
  return new Promise((resolve, reject) =>
    alert('Remove from list?', 'It will be kept permanently in the Archive, where you can still view it.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', onPress: () => run().then(resolve, reject) },
    ]),
  );
}
