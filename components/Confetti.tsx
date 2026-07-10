/**
 * Confetti — celebration particles on demand.
 *
 * Adapted from magicui. Spawns colorful confetti pieces from a position
 * (default: center of viewport) with randomized colors, sizes, velocities,
 * and rotations. Pure canvas + requestAnimationFrame — no deps.
 *
 * Usage: <Confetti trigger={showConfetti} />
 *    or: <Confetti trigger={true} particleCount={80} />
 */

import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface ConfettiProps {
  trigger: boolean;
  particleCount?: number;
  spread?: number;
  colors?: string[];
  /** Burst point in viewport px — e.g. the checkbox that earned it.
      Confetti from nowhere reads as mystery litter; anchor it. */
  origin?: { x: number; y: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

export default function Confetti(
  { trigger, particleCount = 60, spread = 80, colors, origin }: ConfettiProps,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const defaultColors = [
    "#e8839c",
    "#6A9FB5",
    "#C9A0DC",
    "#7CA82B",
    "#E59866",
    "#D4A76A",
    "#5b8def",
    "#f0c060",
    "#52A37F",
  ];

  useEffect(() => {
    if (!IS_BROWSER || !trigger || !canvasRef.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const palette = colors ?? defaultColors;

    // Spawn from the given origin (the thing being celebrated); fall back
    // to upper-center for callers that have no anchor.
    const cx = origin?.x ?? canvas.width / 2;
    const cy = origin?.y ?? canvas.height / 3;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.random() * 2 - 1) * Math.PI * (spread / 180);
      const speed = 3 + Math.random() * 8;
      particlesRef.current.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed - 2,
        size: 6 + Math.random() * 8,
        color: palette[Math.floor(Math.random() * palette.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
      });
    }

    let frame = 0;
    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const gravity = 0.12;
      const drag = 0.98;

      particlesRef.current = particlesRef.current.filter((p) => {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        // Quick fade — lingering low-alpha pieces read as stray flecks,
        // not celebration.
        p.opacity -= 0.016;

        if (p.opacity <= 0 || p.y > canvas.height + 40) return false;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        return true;
      });

      frame++;
      if (frame < 120 && particlesRef.current.length > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesRef.current = [];
      }
    }
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [trigger]);

  if (!IS_BROWSER) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );
}
