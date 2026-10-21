export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MIN_PHOTO_WIDTH = 256;
export const MIN_PHOTO_HEIGHT = 384;

/** Validates the real file contents (signature + decode + dimensions), not just its name. */
export async function validatePhoto(file: File): Promise<string | null> {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    return "Please choose a JPEG or PNG photo.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "That photo is too large. Choose an image under 8 MB.";
  }

  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = signature.length === 8 && pngSignature.every((byte, i) => signature[i] === byte);
  if (!isJpeg && !isPng) {
    return "The file contents do not match a supported JPEG or PNG image.";
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (width < MIN_PHOTO_WIDTH || height < MIN_PHOTO_HEIGHT) {
      return "Choose a clear portrait at least 256 × 384 pixels.";
    }
    if (width > 4096 || height > 4096 || width * height > 12_000_000) {
      return "The image dimensions are too large. The maximum is 4096 × 4096 pixels.";
    }
  } catch {
    return "This image could not be opened. Try another JPEG or PNG.";
  }
  return null;
}
