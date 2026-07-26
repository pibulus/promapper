/**
 * Shuffle-theme guards for the NEON OFFICE generator (docs/COLOR-SYSTEM.md).
 *
 * The contract, since July 26 2026: the ground is always PAPER, the accent
 * comes from harmony math off any hue on the wheel and rides that hue's own
 * chroma ceiling, headers stay MONO while two companion hues ride along for
 * nodes and modules, and contrast holds BY CONSTRUCTION — dark ink over the
 * SOLVED band, white over the solved --accent-strong and the candy CTA plate,
 * the deep companion readable as ink on cream, and the paper light enough
 * that body ink stays readable everywhere.
 *
 * Note the inversion in the first test: it used to assert that accents stayed
 * inside eleven curated arcs. That constraint is what flattened the deck (8
 * of 11 pairs in the purple→pink arc, because little else was legal), so the
 * guard now asserts the wheel is COVERED instead.
 *
 * The 300-roll seeded sweep is the guard that caught real failures — keep it.
 */

import { assert } from "./_assert.ts";
import {
  contrast,
  generateThemeParts,
  hexToOklch,
  maxChroma,
  oklchToHex,
  SURFACE_CREAM,
} from "../theme/randomTheme.ts";

/** Deterministic LCG so the sweep is reproducible. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const wrap = (h: number) => ((h % 360) + 360) % 360;

/** Circular hue distance in degrees. */
function _hueDist(a: number, b: number): number {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 360 - d);
}

Deno.test("the accent wheel is OPEN — rolls reach every hue family", () => {
  // July 26: green-family accents reopened. The old ban (yellow→teal, hues
  // 60–244) is what flattened the deck: 8 of 11 curated pairs landed in the
  // purple→pink arc because nothing else was legal. The guard now asserts the
  // OPPOSITE — that the wheel is genuinely covered — so a future narrowing
  // trips a test instead of quietly re-flattening the shuffle.
  const rand = seededRand(28);
  const buckets = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const { hue } = generateThemeParts(rand);
    buckets.add(Math.floor(wrap(hue) / 30)); // twelve 30° buckets
  }
  assert(
    buckets.size >= 11,
    `accent hues only covered ${buckets.size}/12 of the wheel`,
  );
});

Deno.test("accents are NEON — every roll rides near its hue's chroma ceiling", () => {
  const rand = seededRand(505);
  for (let i = 0; i < 300; i++) {
    const { chroma, lightness, hue } = generateThemeParts(rand);
    // The usable band: below 0.56 an accent reads "too dark" as a candy
    // plate, above 0.82 it cannot hold a header band. Both vetoed live.
    assert(
      lightness >= 0.56 && lightness <= 0.82,
      `outside the usable band: L${lightness}`,
    );
    // Neon means riding the ceiling. maxChroma varies ~3x between hues, so
    // this is a RATIO test, not the old flat C >= 0.12 (which is what made
    // cobalt sulk while coral screamed).
    const ceiling = maxChroma(lightness, wrap(hue));
    assert(
      chroma >= ceiling * 0.85,
      `accent left its ceiling: C${chroma.toFixed(3)} vs ${
        ceiling.toFixed(3)
      } at h${wrap(hue).toFixed(0)}`,
    );
  }
});

Deno.test("the ground is always PAPER — the room never competes with the accent", () => {
  const rand = seededRand(6161);
  for (let i = 0; i < 300; i++) {
    const { bgBase } = generateThemeParts(rand);
    // The top stop carries the ground's full chroma; on paper it stays under
    // the Flexoki register's ceiling.
    const [L, C] = hexToOklch(bgBase[0]);
    assert(C <= 0.05, `ground too saturated for paper: C${C.toFixed(3)}`);
    assert(L >= 0.9, `ground too dark for paper: L${L.toFixed(3)}`);
  }
});

Deno.test("band and plate are SOLVED to a consistent weight, never left pastel", () => {
  // The bug this guards: a fixed 62% mix turns a deep cobalt into a rich band
  // (L 0.73) and a peak-vividness mint into a washed one (L 0.86 — above every
  // hand-approved theme, which measured 0.692–0.840).
  const rand = seededRand(8888);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const band = theme.cssVars?.["--header-band"] as string;
    const plate = theme.cssVars?.["--cta-plate"] as string;
    assert(!!band?.startsWith("#"), "roll missing a solved --header-band");
    assert(!!plate?.startsWith("#"), "roll missing a solved --cta-plate");
    const [bL] = hexToOklch(band);
    const [pL] = hexToOklch(plate);
    assert(
      Math.abs(bL - 0.755) <= 0.06,
      `band drifted off target weight: L${bL.toFixed(3)} for ${theme.accent}`,
    );
    assert(
      Math.abs(pL - 0.733) <= 0.06,
      `plate drifted off target weight: L${pL.toFixed(3)}`,
    );
  }
});

Deno.test("every roll carries two companion hues for nodes and modules", () => {
  const rand = seededRand(1234);
  for (let i = 0; i < 300; i++) {
    const { theme, secondary, tertiary } = generateThemeParts(rand);
    assert(secondary.startsWith("#"), "roll missing a secondary hue");
    assert(tertiary.startsWith("#"), "roll missing a tertiary hue");
    assert(theme.cssVars?.["--accent-2"] === secondary, "--accent-2 mismatch");
    assert(theme.cssVars?.["--accent-3"] === tertiary, "--accent-3 mismatch");
  }
});

Deno.test("headers are MONO — rolls emit no supporting band hues", () => {
  const rand = seededRand(719);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    assert(
      theme.cssVars?.["--band-hue-b"] === undefined,
      "--band-hue-b has returned — headers are mono (July 20 ruling)",
    );
    assert(
      theme.cssVars?.["--band-hue-c"] === undefined,
      "--band-hue-c has returned — the carnival stays dead",
    );
  }
});

Deno.test("warm-black ink passes AA on the candy CTA plate for every roll", () => {
  // The candy plate (v3): bright accent fill, dark label. Dark plates with
  // light ink kept reading murky/garish; this pins the bright direction so no
  // roll's accent can dip the ink below AA.
  const SOFT_BLACK = "#1e1714";
  const rand = seededRand(4242);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const plate = theme.cssVars?.["--cta-plate"] as string;
    const ratio = contrast(SOFT_BLACK, plate);
    assert(ratio >= 4.5, `ink/candy ${ratio.toFixed(2)} for ${plate}`);
  }
});

Deno.test("ink on the roll's header band passes AA for every roll", () => {
  const rand = seededRand(1982);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    // The band is solved per roll now, so read it back rather than
    // re-deriving it from a fixed percentage the generator no longer uses.
    const band = theme.cssVars?.["--header-band"] as string;
    const ratio = contrast(theme.text, band);
    assert(ratio >= 4.5, `ink/band ${ratio.toFixed(2)} for ${theme.accent}`);
  }
});

Deno.test("white on the solved --accent-strong passes AA for every roll", () => {
  const rand = seededRand(777);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const strong = theme.cssVars?.["--accent-strong"] as string;
    assert(!!strong && strong.startsWith("#"), "roll missing --accent-strong");
    const ratio = contrast("#fffef7", strong);
    assert(ratio >= 4.5, `warmwhite/strong ${ratio.toFixed(2)} for ${strong}`);
    // Ink and fill route through the same solved companion.
    assert(theme.cssVars?.["--accent-ink"] === strong, "ink != strong");
    assert(theme.cssVars?.["--accent-fill"] === strong, "fill != strong");
  }
});

Deno.test("the deep companion reads as ink on cream for every roll", () => {
  const rand = seededRand(41);
  for (let i = 0; i < 300; i++) {
    const { theme } = generateThemeParts(rand);
    const strong = theme.cssVars?.["--accent-strong"] as string;
    const ratio = contrast(strong, SURFACE_CREAM);
    assert(ratio >= 4.5, `strong/cream ${ratio.toFixed(2)} for ${strong}`);
  }
});

Deno.test("background family stays light — body ink readable everywhere", () => {
  const rand = seededRand(90210);
  for (let i = 0; i < 300; i++) {
    const { theme, bgWashes, bgBase } = generateThemeParts(rand);
    const baseSolid = theme.cssVars?.["--color-base-solid"] as string;
    // 5.5 floor: only footer/empty-state text sits directly on the bg, and
    // AA is 4.5 — this keeps a wide margin while letting the saturated
    // dusk/violet washes (lowest luminance per lightness) stay lush.
    for (const layer of [...bgWashes, ...bgBase, baseSolid]) {
      const ratio = contrast(theme.text, layer);
      assert(
        ratio >= 5.5,
        `ink/bg ${ratio.toFixed(2)} on ${layer} (accent ${theme.accent})`,
      );
    }
  }
});

Deno.test("the ground hue is never the accent's own hue", () => {
  // The paper still belongs to a different part of the wheel than the neon —
  // the harmony hands the base hue to the ground and a companion to the
  // accent, so the room and the pop never collapse into one note.
  const rand = seededRand(333);
  let collisions = 0;
  for (let i = 0; i < 300; i++) {
    const { bgHue, hue } = generateThemeParts(rand);
    if (_hueDist(bgHue, hue) < 12) collisions++;
  }
  // Analogous rolls legitimately sit close; anything more is a bug.
  assert(
    collisions < 30,
    `${collisions}/300 rolls collapsed ground into accent`,
  );
});

Deno.test("every roll re-tints the app background gradient", () => {
  const a = generateThemeParts(seededRand(1));
  const b = generateThemeParts(seededRand(2));
  const ga = a.theme.cssVars?.["--gradient-bg"] as string;
  const gb = b.theme.cssVars?.["--gradient-bg"] as string;
  assert(!!ga && ga.includes("radial-gradient"), "roll missing bg mesh");
  assert(ga !== gb, "two different rolls produced the same background");
});

Deno.test("oklch round-trip sanity", () => {
  // Known anchor: DAYBREAK cobalt #4a7bc9 ≈ oklch(0.586 0.132 259.3)
  const [L, C, H] = hexToOklch("#4a7bc9");
  assert(Math.abs(L - 0.586) < 0.01, `L ${L}`);
  assert(Math.abs(C - 0.132) < 0.01, `C ${C}`);
  assert(Math.abs(H - 259.3) < 1, `H ${H}`);
  // Round trip lands on the same hex.
  assert(oklchToHex(L, C, H) === "#4a7bc9", oklchToHex(L, C, H));
  // Gamut clamp: an impossible chroma request degrades to a valid color at
  // the same hue/lightness instead of skewing.
  const clamped = oklchToHex(0.9, 0.4, 260);
  const [cl, , ch] = hexToOklch(clamped);
  assert(Math.abs(cl - 0.9) < 0.02, `clamped L drifted: ${cl}`);
  assert(Math.abs(ch - 260) < 3, `clamped hue drifted: ${ch}`);
});
