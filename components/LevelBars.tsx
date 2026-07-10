/**
 * LevelBars — a tiny live level meter for recording states. Feed it the
 * recorder's MediaStream and four bars dance with the voice; silence is
 * VISIBLE (bars settle low), so "is it actually hearing me?" answers
 * itself. Renders nothing without a stream.
 *
 * Uses currentColor so it reads correctly on any surface (white on the
 * live pill, ink on cream).
 */

import { useEffect, useRef } from "preact/hooks";

const BAR_COUNT = 4;

export default function LevelBars({ stream }: { stream: MediaStream | null }) {
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!stream || !wrapRef.current) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = Array.from(wrapRef.current.children) as HTMLElement[];
    let raf = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars.length; i++) {
        // Low-mid bins where the voice lives; each bar samples its own band.
        const v = data[1 + i * 3] / 255;
        bars[i].style.transform = `scaleY(${0.2 + v * 0.8})`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close();
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <span class="level-bars" ref={wrapRef} aria-hidden="true">
      {Array.from(
        { length: BAR_COUNT },
        (_, i) => <span key={i} class="level-bars__bar" />,
      )}
    </span>
  );
}
