const MAX_SIDE = 1200;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });

  let w = bmp.width;
  let h = bmp.height;

  if (w > MAX_SIDE || h > MAX_SIDE) {
    const ratio = MAX_SIDE / Math.max(w, h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponible');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression échouée'))),
      'image/jpeg',
      QUALITY,
    );
  });
}
