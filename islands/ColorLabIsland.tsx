/**
 * ColorLabIsland — the /dev/colors tuning bench.
 *
 * Explore and tune color combos against the REAL app: the sliders drive the
 * same composeTheme derivation the dice uses, persistence goes through the
 * real theme engine (schema'd localStorage), and the preview iframe reloads
 * through the real FOUC path — what you see is exactly what a roll would be.
 * "Copy pair" emits a CURATED_PAIRS entry to paste into randomTheme.ts.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  composeTheme,
  CURATED_PAIRS,
  deriveStrong,
  mixHex,
} from "@core/theme/randomTheme.ts";
import { hexToOklch, oklchToHex } from "@core/theme/oklch.ts";
import { createThemeSystem } from "@core/theme/themeEngine.ts";
import { proMapperThemeConfig } from "@core/theme/themes.ts";

const themeSystem = createThemeSystem(proMapperThemeConfig);

const BAND_CREAM = "#ffefdc";

/** Accent inspo anchors (July 20 drop) — each sets the accent sliders. */
const ACCENT_PRESETS: ReadonlyArray<[string, string]> = [
  ["gum", "#ea88b9"],
  ["fluoro pink", "#FF48B0"],
  ["hexbloop", "#E600A3"],
  ["miami coral", "#FF6B6B"],
  ["electric", "#7659FF"],
  ["grape neon", "#8335ff"],
  ["raspberry", "#E85D8F"],
  ["cobalt", "#4a7bc9"],
];

/** Harmony modes — candidate ground hues derived from the accent hue
 * (the conversation_mapper idea, OKLCH edition). Golden = the φ angle. */
const HARMONY_MODES: ReadonlyArray<[string, ReadonlyArray<number>]> = [
  ["mono", [0]],
  ["analogous", [-30, 30]],
  ["distinct", [-55, 55]],
  ["split", [150, 210]],
  ["triadic", [120, 240]],
  ["complement", [180]],
  ["golden", [137.5, 222.5]],
];

/** Ground-family hue presets. */
const GROUND_PRESETS: ReadonlyArray<[string, number]> = [
  ["sunrise", 48],
  ["amber", 65],
  ["mint", 170],
  ["pool", 200],
  ["indigo", 278],
  ["dusk", 325],
];

export default function ColorLabIsland() {
  const aH = useSignal(350);
  const aL = useSignal(0.66);
  const aC = useSignal(0.2);
  const gH = useSignal(48);
  const gL = useSignal(0.86);
  const gC = useSignal(0.09);
  const copied = useSignal(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  function apply() {
    const parts = composeTheme({
      hue: aH.value,
      lightness: aL.value,
      chroma: aC.value,
      bgHue: gH.value,
      groundL: gL.value,
      groundC: gC.value,
    });
    // Real persistence path: schema'd localStorage → the iframe's FOUC
    // script repaints it pre-hydration on reload. Lab chrome follows too.
    themeSystem.applyCustomTheme(parts.theme);
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      frameRef.current?.contentWindow?.location.reload();
    }, 350);
  }

  // Paint the initial state once on mount.
  useEffect(() => {
    apply();
  }, []);

  function set(sig: { value: number }, v: number) {
    sig.value = v;
    copied.value = false;
    apply();
  }

  function loadPair(i: number) {
    const p = CURATED_PAIRS[i];
    const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
    aH.value = mid(p.accent);
    aL.value = mid(p.accentL);
    aC.value = mid(p.accentC);
    gH.value = mid(p.ground);
    gL.value = p.groundL;
    gC.value = p.groundC;
    apply();
  }

  function loadAccentHex(hex: string) {
    const [L, C, H] = hexToOklch(hex);
    aL.value = Math.min(0.72, Math.max(0.5, L));
    aC.value = C;
    aH.value = H;
    apply();
  }

  function copyPair() {
    const r = (n: number, d = 2) => Number(n.toFixed(d));
    const snippet = `{
  name: "hand-tuned",
  ground: [${r(gH.value - 8, 0)}, ${r(gH.value + 8, 0)}],
  accent: [${r(aH.value - 4, 0)}, ${r(aH.value + 4, 0)}],
  accentL: [${r(aL.value - 0.02)}, ${r(aL.value + 0.02)}],
  accentC: [${r(aC.value - 0.01)}, ${r(aC.value + 0.01)}],
  groundL: ${r(gL.value)},
  groundC: ${r(gC.value, 3)},
},`;
    navigator.clipboard?.writeText(snippet);
    copied.value = true;
  }

  const accentHex = oklchToHex(aL.value, aC.value, aH.value);
  const strong = deriveStrong(aH.value, aC.value);
  const band = mixHex(accentHex, BAND_CREAM, 0.62);
  const plate = mixHex(accentHex, BAND_CREAM, 0.7);
  const groundHex = oklchToHex(gL.value, gC.value, gH.value);

  const slider = (
    label: string,
    sig: { value: number },
    min: number,
    max: number,
    step: number,
  ) => (
    <label class="color-lab-slider">
      <span>
        {label} <b>{sig.value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sig.value}
        onInput={(e) => set(sig, Number(e.currentTarget.value))}
      />
    </label>
  );

  return (
    <div class="color-lab">
      <aside class="color-lab-panel">
        <h1>Color lab</h1>
        <p class="color-lab-hint">
          Sliders drive the real theme engine — the preview reloads through the
          same first-paint path a shuffle roll uses.
        </p>

        <div class="color-lab-swatches">
          {[
            ["accent", accentHex],
            ["band", band],
            ["plate", plate],
            ["strong", strong],
            ["ground", groundHex],
          ].map(([name, hex]) => (
            <div class="color-lab-swatch" key={name}>
              <i style={{ background: hex as string }} />
              <span>{name}</span>
              <code>{hex}</code>
            </div>
          ))}
        </div>

        <h2>Accent</h2>
        {slider("hue", aH, 0, 366, 1)}
        {slider("lightness", aL, 0.45, 0.78, 0.005)}
        {slider("chroma", aC, 0.05, 0.3, 0.005)}
        <div class="color-lab-chips">
          {ACCENT_PRESETS.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              onClick={() => loadAccentHex(hex)}
              style={{ "--chip": hex }}
            >
              {name}
            </button>
          ))}
        </div>

        <h2>Ground</h2>
        <p class="color-lab-hint">
          Harmony modes seed the ground hue from the accent — then tune.
        </p>
        <div class="color-lab-chips">
          {HARMONY_MODES.map(([name, offsets]) => (
            <span key={name} class="color-lab-harmony">
              <em>{name}</em>
              {offsets.map((off) => {
                const hue = ((aH.value + off) % 360 + 360) % 360;
                return (
                  <button
                    key={off}
                    type="button"
                    title={`ground hue ${Math.round(hue)}`}
                    onClick={() => set(gH, Math.round(hue))}
                    style={{ "--chip": oklchToHex(0.86, 0.09, hue) }}
                  >
                    {Math.round(hue)}
                  </button>
                );
              })}
            </span>
          ))}
        </div>
        <button
          type="button"
          class="color-lab-swap"
          onClick={() => {
            const h = aH.value;
            aH.value = gH.value;
            gH.value = h;
            apply();
          }}
        >
          Swap accent and ground hues
        </button>
        {slider("hue", gH, 0, 360, 1)}
        {slider("lightness", gL, 0.8, 0.94, 0.005)}
        {slider("chroma", gC, 0.02, 0.13, 0.005)}
        <div class="color-lab-chips">
          {GROUND_PRESETS.map(([name, hue]) => (
            <button
              key={name}
              type="button"
              onClick={() => set(gH, hue)}
              style={{
                "--chip": oklchToHex(0.86, 0.09, hue),
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <h2>Pair deck</h2>
        <div class="color-lab-pairs">
          {CURATED_PAIRS.map((p, i) => {
            const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => loadPair(i)}
              >
                <i
                  style={{
                    background: oklchToHex(
                      mid(p.accentL),
                      mid(p.accentC),
                      mid(p.accent),
                    ),
                  }}
                />
                <i
                  style={{
                    background: oklchToHex(
                      p.groundL,
                      p.groundC + 0.01,
                      mid(p.ground),
                    ),
                  }}
                />
                {p.name}
              </button>
            );
          })}
        </div>

        <button type="button" class="btn btn--accent" onClick={copyPair}>
          {copied.value ? "Copied — paste into CURATED_PAIRS" : "Copy as pair"}
        </button>
      </aside>

      <iframe
        ref={frameRef}
        class="color-lab-frame"
        src="/"
        title="Live app preview"
      />
    </div>
  );
}
