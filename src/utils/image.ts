export interface Point {
  x: number; // 0..1, fraction of image width
  y: number; // 0..1, fraction of image height
}

export function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export interface FractionalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Reduces four corner points (fractional 0..1 coordinates, in any order) to
 * their axis-aligned bounding rectangle, clamped to the image bounds. No
 * perspective correction — v1 crop is a manual rectangle only, per the
 * project plan's non-goals.
 */
export function boundingRectFromCorners(corners: Point[]): FractionalRect {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(1, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(1, Math.max(...ys));
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** Crops an image to the given fractional rectangle (see `boundingRectFromCorners`). */
export function cropImageToRect(img: HTMLImageElement, corners: Point[]): Promise<Blob> {
  const rect = boundingRectFromCorners(corners);

  const sx = rect.x * img.naturalWidth;
  const sy = rect.y * img.naturalHeight;
  const sw = Math.max(1, rect.width * img.naturalWidth);
  const sh = Math.max(1, rect.height * img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode cropped image'));
    }, 'image/jpeg', 0.92);
  });
}

export const DEFAULT_CORNERS: Point[] = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];
