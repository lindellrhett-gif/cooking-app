import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import type { ParsedReceipt } from '@/lib/types';

/** Long edge after downscaling. Enough to read receipt print, small enough to send. */
const MAX_EDGE = 1600;

/**
 * Base64 to bytes.
 *
 * React Native has atob through a polyfill but no Buffer, and fetch against a
 * file:// URI is unreliable across platforms. Decoding the base64 that the
 * image manipulator already produced avoids both problems.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Downscale and re-encode before upload.
 *
 * A modern phone camera produces several megabytes per photo. Sending that
 * untouched makes every scan slow and expensive for no gain in accuracy, since
 * the text is legible at a fraction of the resolution.
 */
export async function prepareImage(uri: string): Promise<{ bytes: Uint8Array; uri: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_EDGE });
  const rendered = await context.renderAsync();

  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });

  if (!result.base64) {
    throw new Error('Could not read the image after resizing.');
  }

  return { bytes: base64ToBytes(result.base64), uri: result.uri };
}

/**
 * Upload, then ask the Edge Function to read it.
 *
 * The storage path starts with the household id because the bucket policies
 * gate on that first path segment.
 */
export async function uploadAndParse(
  householdId: string,
  userId: string,
  imageUri: string,
): Promise<{ scanId: string; parsed: ParsedReceipt }> {
  const { bytes } = await prepareImage(imageUri);

  const { data: scan, error: scanError } = await supabase
    .from('receipt_scans')
    .insert({
      household_id: householdId,
      uploaded_by: userId,
      // Filled in immediately below, once we know the row id.
      storage_path: 'pending',
      status: 'pending',
    })
    .select('id')
    .single();

  if (scanError) throw scanError;

  const path = `${householdId}/${scan.id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    await supabase
      .from('receipt_scans')
      .update({ status: 'failed', error: uploadError.message })
      .eq('id', scan.id);
    throw uploadError;
  }

  await supabase.from('receipt_scans').update({ storage_path: path }).eq('id', scan.id);

  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    body: { scanId: scan.id },
  });

  if (error) {
    // The function's own error body is more useful than the generic wrapper,
    // so dig it out when it is there.
    let detail = error.message;
    try {
      const body = await (error as unknown as { context?: Response }).context?.json();
      if (body?.error) detail = body.error;
    } catch {
      // Keep the original message.
    }
    throw new Error(detail);
  }

  return { scanId: scan.id, parsed: data as ParsedReceipt };
}
