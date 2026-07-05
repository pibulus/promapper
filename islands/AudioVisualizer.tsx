/**
 * Audio Visualizer Island - Real-time frequency visualization
 *
 * Uses Web Audio API AnalyserNode to display actual audio frequency data
 * Ported from Svelte AudioVisualizer.svelte
 */

import { useEffect, useRef } from "preact/hooks";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
}

export default function AudioVisualizer({ analyser }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const accentColorRef = useRef<string>("rgba(232, 131, 156, 0.8)");

  useEffect(() => {
    if (!analyser || !canvasRef.current) {
      console.warn("AudioVisualizer: No analyser or canvas available");
      return;
    }

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");

    if (!canvasCtx) {
      console.error("Failed to get canvas context");
      return;
    }

    // Read accent color from CSS variables
    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent").trim();
    if (accentColor) {
      accentColorRef.current = accentColor;
    }

    // Initialize data array for frequency data
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Animation draw function - ELEGANT BARS
    function draw() {
      if (!analyser || !canvasCtx || !canvas || !dataArrayRef.current) return;

      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;

      animationFrameIdRef.current = requestAnimationFrame(draw);

      // Get frequency data from analyser
      analyser.getByteFrequencyData(dataArrayRef.current);

      // Clear canvas with subtle bg
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.02)";
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      // Sample fewer bars for cleaner look (every 4th bar)
      const barCount = 48;
      const barWidth = Math.floor(WIDTH / barCount) - 4;
      const sampleStep = Math.floor(dataArrayRef.current.length / barCount);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * sampleStep;
        const value = dataArrayRef.current[dataIndex];
        const barHeight = (value / 255) * HEIGHT * 0.8; // 80% max height

        const x = i * (barWidth + 4) + 2;
        const y = HEIGHT - barHeight;

        // Gradient from accent to lighter
        const gradient = canvasCtx.createLinearGradient(x, y, x, HEIGHT);
        gradient.addColorStop(0, accentColorRef.current);
        gradient.addColorStop(0.6, accentColorRef.current);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0.1)");

        canvasCtx.fillStyle = gradient;

        // Rounded bars
        canvasCtx.beginPath();
        const radius = Math.min(barWidth / 2, 3);
        canvasCtx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        canvasCtx.fill();
      }
    }

    // Start animation
    draw();

    // Cleanup
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [analyser]);

  return (
    <div
      class="w-full"
      style={{
        background: "rgba(0, 0, 0, 0.03)",
        border: "1.5px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.06)",
      }}
    >
      <canvas
        ref={canvasRef}
        class="w-full"
        width="1024"
        height="120"
        style={{
          display: "block",
          height: "60px",
          borderRadius: "6px",
        }}
      />
    </div>
  );
}
