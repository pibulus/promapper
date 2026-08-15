/**
 * Deck export — Slideomatic handoff.
 *
 * The "Deck" export preset asks the model for Slideomatic deck JSON (an array
 * of typed slides — schema documented in slideomatic/modules/voice-modes.js).
 * This validates the output and builds the deck URL in slideomatic's own
 * share encoding: `?data=gz.<base64url(gzip(json))>` (its decoder at
 * modules/deck-persistence.js handles both the gz. form and plain base64).
 */

export const SLIDEOMATIC_DECK_URL = "https://slideomatic.app/deck.html";

// Slideomatic's full slide-type set — anything else fails validation rather
// than rendering a broken deck.
const VALID_SLIDE_TYPES = new Set([
  "title",
  "standard",
  "quote",
  "split",
  "pillars",
  "gallery",
  "image",
  "graph",
]);

/**
 * Parse model output into a slides array, or null when it isn't a valid deck.
 * Tolerates a stray markdown fence and the `{slides: [...]}` wrapper shape.
 */
export function parseDeckJson(raw: string): Record<string, unknown>[] | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const slides = Array.isArray(data)
    ? data
    : data && typeof data === "object" &&
        Array.isArray((data as { slides?: unknown[] }).slides)
    ? (data as { slides: unknown[] }).slides
    : null;
  if (!slides || slides.length === 0) return null;
  const allValid = slides.every(
    (s) =>
      s !== null &&
      typeof s === "object" &&
      !Array.isArray(s) &&
      typeof (s as { type?: unknown }).type === "string" &&
      VALID_SLIDE_TYPES.has((s as { type: string }).type),
  );
  return allValid ? (slides as Record<string, unknown>[]) : null;
}

/** gzip + base64url with slideomatic's `gz.` prefix. */
export async function encodeDeckParam(slides: unknown[]): Promise<string> {
  const json = JSON.stringify(slides);
  if (typeof CompressionStream === "undefined") {
    // Legacy plain-base64 form — slideomatic's decoder accepts it too.
    return btoa(unescape(encodeURIComponent(json)));
  }
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return "gz." +
    btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Full Slideomatic URL that opens the deck. */
export async function buildDeckUrl(slides: unknown[]): Promise<string> {
  return `${SLIDEOMATIC_DECK_URL}?data=${await encodeDeckParam(slides)}`;
}
