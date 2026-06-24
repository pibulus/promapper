/**
 * BorderBeam — an animated glowing border that travels around an element.
 *
 * Adapted from magicui. Pure CSS — uses a rotating conic gradient mask.
 * Wrap any card or button to give it a border glow animation.
 *
 * Usage: <BorderBeam><div class="card">Content</div></BorderBeam>
 */

import { ComponentChildren } from "preact";

interface BorderBeamProps {
  children: ComponentChildren;
  /** Beam color. Defaults to accent pink. */
  color?: string;
  /** Border width. */
  size?: number;
  /** Duration of one full rotation in seconds. */
  duration?: number;
  /** Border radius. */
  borderRadius?: string;
}

export default function BorderBeam(
  { children, color, size = 2, duration = 8, borderRadius = "12px" }:
    BorderBeamProps,
) {
  const beamColor = color ?? "var(--color-accent, #e8839c)";

  return (
    <div
      style={{ position: "relative", borderRadius, display: "inline-block" }}
    >
      <div
        aria-hidden="true"
        class="border-beam-ring"
        style={{
          position: "absolute",
          inset: `-${size}px`,
          borderRadius,
          background:
            `conic-gradient(from 0deg, transparent, ${beamColor}, transparent, ${beamColor}, transparent)`,
          mask:
            `radial-gradient(farthest-side, transparent calc(100% - ${size}px), #000 calc(100% - ${size}px + 1px))`,
          WebkitMask:
            `radial-gradient(farthest-side, transparent calc(100% - ${size}px), #000 calc(100% - ${size}px + 1px))`,
          animation: `border-beam-spin ${duration}s linear infinite`,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.7,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      <style>
        {`
          @keyframes border-beam-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
