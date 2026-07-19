/**
 * OKLCH color math — the perceptual engine under the color system
 * (docs/COLOR-SYSTEM.md). Björn Ottosson's reference OKLab matrices,
 * hand-rolled so core/ stays dependency-free.
 *
 * Everything is generated in OKLCH and stored as hex: equal L is equal
 * perceived lightness across hues (HSL's "same L" never was), and chroma
 * gets clamped to the sRGB gamut per hue — the ceiling at wash lightness
 * varies 3× between yellow-green and blue, so a fixed "saturation" number
 * across hues is exactly the bug this module retires.
 */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** OKLCH → linear-light sRGB triplet (may be out of [0,1] when out of gamut). */
function oklchToSrgbRaw(
  L: number,
  C: number,
  hueDeg: number,
): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

function isInGamut(L: number, C: number, H: number): boolean {
  const [r, g, b] = oklchToSrgbRaw(L, C, H);
  const e = 1e-4;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e &&
    b >= -e && b <= 1 + e;
}

/** Largest sRGB-representable chroma at this L/H (binary search). */
export function maxChroma(L: number, H: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut(L, mid, H)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** OKLCH → hex. Chroma is clamped into the sRGB gamut at constant L/H, so
 * hue and lightness are always honest — out-of-gamut requests desaturate,
 * they never skew. */
export function oklchToHex(L: number, C: number, hueDeg: number): string {
  const H = ((hueDeg % 360) + 360) % 360;
  const c = Math.min(C, maxChroma(L, H));
  const [r, g, b] = oklchToSrgbRaw(L, c, H);
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Hex → [L, C, H]. H in [0,360). */
export function hexToOklch(hex: string): [number, number, number] {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}
