/**
 * Dr. Shrink Cartridge Node (Pass 8 & SoftStack Cartridge Ingestion)
 *
 * Client-side 80/20 image downsampler and WebP compressor.
 * Prevents 15MB iPhone whiteboard photos from exhausting IndexedDB quotas
 * or triggering mobile Safari jetsam crashes.
 *
 * Sourced from Dr. Shrink (compressService.js).
 */

const IMAGE_QUALITY = 0.85;
const MAX_DIMENSION = 2560; // Crisp enough for text/whiteboards, small in memory
const MIN_WORTHWHILE_SAVING = 0.08; // Only replace if saved > 8%

const IMAGE_RE = /\.(jpe?g|png|webp|bmp|heic|heif)$/i;

export function isShrinkableImage(
  file: { name?: string; type?: string },
): boolean {
  const type = file.type || "";
  const name = file.name || "";
  if (type.startsWith("image/svg") || /\.svg$/i.test(name)) return false;
  if (type.startsWith("image/gif") || /\.gif$/i.test(name)) return false; // Don't flatten animated GIFs
  return type.startsWith("image/") || IMAGE_RE.test(name);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof URL === "undefined" || typeof Image === "undefined") {
      return reject(new Error("DOM Image not available in this environment"));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

async function decodeImage(
  file: Blob,
): Promise<
  {
    width: number;
    height: number;
    close?: () => void;
    drawTo: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  }
> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        width: bmp.width,
        height: bmp.height,
        close: () => bmp.close(),
        drawTo: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      };
    } catch {
      // Fallback to standard <img>
    }
  }

  const img = await loadImage(file);
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    drawTo: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
  };
}

export interface ShrinkResult {
  file: File;
  originalSize: number;
  shrunkSize: number;
  saved: number;
  didShrink: boolean;
}

/**
 * Client-side downsample and compress image File.
 * Returns the compressed File or the original File if compression wasn't worthwhile.
 */
export async function shrinkImageFile(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<ShrinkResult> {
  const originalSize = file.size;

  // Headless / SSR safety guard
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function" ||
    !isShrinkableImage(file)
  ) {
    return {
      file,
      originalSize,
      shrunkSize: originalSize,
      saved: 0,
      didShrink: false,
    };
  }

  const maxDim = options.maxDimension || MAX_DIMENSION;
  const quality = options.quality || IMAGE_QUALITY;

  try {
    const decoded = await decodeImage(file);
    let { width, height } = decoded;
    const longest = Math.max(width, height);

    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      decoded.close?.();
      return {
        file,
        originalSize,
        shrunkSize: originalSize,
        saved: 0,
        didShrink: false,
      };
    }

    decoded.drawTo(ctx, width, height);
    decoded.close?.();

    // Try WebP first
    let bestBlob: Blob | null = await canvasToBlob(
      canvas,
      "image/webp",
      quality,
    );
    let bestType = "image/webp";
    let bestExt = "webp";

    // If WebP is not supported or larger, check JPEG for photo types
    if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (jpegBlob && (!bestBlob || jpegBlob.size < bestBlob.size)) {
        bestBlob = jpegBlob;
        bestType = "image/jpeg";
        bestExt = "jpg";
      }
    }

    if (!bestBlob) {
      return {
        file,
        originalSize,
        shrunkSize: originalSize,
        saved: 0,
        didShrink: false,
      };
    }

    // Only use compressed result if it meets minimum savings
    if (bestBlob.size <= originalSize * (1 - MIN_WORTHWHILE_SAVING)) {
      const newName = file.name.replace(/\.[^.]+$/, `.${bestExt}`);
      const shrunkFile = new File([bestBlob], newName, {
        type: bestType,
        lastModified: Date.now(),
      });
      return {
        file: shrunkFile,
        originalSize,
        shrunkSize: bestBlob.size,
        saved: originalSize - bestBlob.size,
        didShrink: true,
      };
    }

    return {
      file,
      originalSize,
      shrunkSize: originalSize,
      saved: 0,
      didShrink: false,
    };
  } catch (_e) {
    // If decoding failed (e.g. corrupt or unsupported raw file), safely return original
    return {
      file,
      originalSize,
      shrunkSize: originalSize,
      saved: 0,
      didShrink: false,
    };
  }
}
