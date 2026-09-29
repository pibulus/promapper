/**
 * Chonky QR Code Engine (Pass 8 & Fleet QR Module)
 *
 * Generates sovereign, zero-external-network SVG QR codes
 * styled in SoftStack neo-toybrut aesthetics.
 */

import QRCode from "npm:qrcode@^1.5.4";

export interface ChonkyQrOptions {
  /** Dark module color (default #1e1714) */
  color?: string;
  /** Light background color (default #fffef7) */
  background?: string;
  /** Margin / quiet zone module count (default 1) */
  margin?: number;
  /** Desired SVG width in px (default 260) */
  width?: number;
}

/**
 * Generate a standalone SVG string for any URL or text payload.
 */
export async function generateChonkyQrSvg(
  text: string,
  options: ChonkyQrOptions = {},
): Promise<string> {
  const {
    color = "#1e1714",
    background = "#fffef7",
    margin = 1,
    width = 260,
  } = options;

  return await QRCode.toString(text, {
    type: "svg",
    margin,
    width,
    color: {
      dark: color,
      light: background,
    },
    errorCorrectionLevel: "M",
  });
}

/**
 * Generate a data URL string (data:image/svg+xml;utf8,...) for direct use in <img src>
 */
export async function generateChonkyQrDataUrl(
  text: string,
  options: ChonkyQrOptions = {},
): Promise<string> {
  const svg = await generateChonkyQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
