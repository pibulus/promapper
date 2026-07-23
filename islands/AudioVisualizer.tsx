/**
 * Audio Visualizer Island — nine fat pill-bars dancing to one voice
 *
 * Not a spectrum analyzer: the whole row breathes from a single smoothed
 * level (center-weighted, per-bar wobble), growing from the middle like a
 * voice, not from a lab bench. No chrome, no divisions, no numbers.
 */

import { useEffect, useRef } from "preact/hooks";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
}

const BAR_COUNT = 9;
// Center-weighted envelope: the row reads as one voice swelling, not bands.
const WEIGHTS = [0.45, 0.62, 0.8, 0.93, 1, 0.93, 0.8, 0.62, 0.45];
// The badge-chip trio, saturated enough to sing on cream.
const COLORS = ["#ff8fc7", "#4ecdc4", "#ffc46b"];

export default function AudioVisualizer({ analyser }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    let smoothed = 0;

    function draw() {
      if (!analyser || !canvasCtx || !canvas) return;
      animationFrameIdRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(data);
      // One voice level from the speech-ish low bins.
      const bins = Math.min(64, data.length);
      let sum = 0;
      for (let i = 0; i < bins; i++) sum += data[i];
      const level = sum / bins / 255;
      // Quick to rise, slow to fall — bars feel eager, not jittery.
      smoothed += (level - smoothed) * (level > smoothed ? 0.35 : 0.12);

      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;
      const t = performance.now() / 1000;
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      const gap = WIDTH * 0.028;
      const barWidth = (WIDTH - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        // Per-bar wobble so the row dances instead of marching.
        const wobble = 0.82 + 0.18 * Math.sin(t * (2.1 + i * 0.13) + i * 1.7);
        const h = HEIGHT *
          Math.min(1, 0.14 + 1.5 * smoothed * WEIGHTS[i] * wobble);
        const x = i * (barWidth + gap);
        const y = (HEIGHT - h) / 2; // grow from the center, like a voice
        canvasCtx.fillStyle = COLORS[i % COLORS.length];
        // roundRect is Safari 16+; without the guard an old WebView would
        // throw inside rAF and silently freeze the bars forever.
        if (canvasCtx.roundRect) {
          canvasCtx.beginPath();
          canvasCtx.roundRect(x, y, barWidth, h, barWidth / 2);
          canvasCtx.fill();
        } else {
          canvasCtx.fillRect(x, y, barWidth, h);
        }
      }
    }

    draw();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      class="w-full"
      width="720"
      height="144"
      style={{ display: "block", height: "72px" }}
    />
  );
}
