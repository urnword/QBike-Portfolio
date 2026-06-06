/**
 * Canvas-based JPEG compression utility.
 * Resizes to max 1920px on the longest edge, then iteratively reduces
 * JPEG quality until the output is ≤ targetSizeKB (default 300 KB).
 *
 * Zero external dependencies — uses browser-native canvas APIs.
 */

const MAX_DIMENSION = 1920;
const DEFAULT_TARGET_KB = 300;
const INITIAL_QUALITY = 0.8;
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.05;

/**
 * Compress an image blob to JPEG at roughly the target file size.
 *
 * @param source  Original image `Blob` (any browser-supported format)
 * @param targetKB  Maximum output size in kilobytes (default 300)
 * @returns  Compressed JPEG `Blob`
 */
export async function compressImage(
  source: Blob,
  targetKB: number = DEFAULT_TARGET_KB,
): Promise<Blob> {
  // 1. Decode into an ImageBitmap (works in Web Workers too)
  const bitmap = await createImageBitmap(source);

  // 2. Compute scaled dimensions (max 1920 on longest side)
  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // 3. Draw to offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // 4. Iteratively reduce quality until ≤ target size
  const targetBytes = targetKB * 1024;
  let quality = INITIAL_QUALITY;

  while (quality >= MIN_QUALITY) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= targetBytes || quality <= MIN_QUALITY) {
      return blob;
    }
    quality -= QUALITY_STEP;
  }

  // Fallback — return at minimum quality
  return canvasToBlob(canvas, MIN_QUALITY);
}

/** Promise wrapper around canvas.toBlob */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null."));
      },
      "image/jpeg",
      quality,
    );
  });
}
