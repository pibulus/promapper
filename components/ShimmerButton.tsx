/**
 * ShimmerButton — a button with an animated gradient shimmer sweep.
 *
 * Adapted from magicui. Pure CSS animation — no JS deps.
 * The shimmer sweeps left-to-right across the button on hover.
 *
 * Usage: <ShimmerButton onClick={...}>Start Meeting</ShimmerButton>
 */

import { ComponentChildren, JSX } from "preact";

interface ShimmerButtonProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
}

export default function ShimmerButton(
  {
    children,
    shimmerColor = "rgba(255,255,255,0.15)",
    shimmerSize = "60%",
    borderRadius = "10px",
    style,
    ...rest
  }: ShimmerButtonProps,
) {
  return (
    <button
      {...rest}
      style={{
        position: "relative",
        overflow: "hidden",
        border: "none",
        padding: "0.55rem 1.2rem",
        borderRadius,
        fontWeight: 700,
        fontSize: "var(--small-size)",
        cursor: "pointer",
        background: `var(--color-accent, #e8839c)`,
        color: "#fff",
        ...(style as Record<string, string>),
      }}
    >
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
      <span
        class="shimmer-overlay"
        style={{
          position: "absolute",
          inset: 0,
          background:
            `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
          width: shimmerSize,
          transform: "translateX(-150%) skewX(-20deg)",
          animation: "shimmer-sweep 2.5s infinite",
        }}
      />
      <style>
        {`
          @keyframes shimmer-sweep {
            0%   { transform: translateX(-150%) skewX(-20deg); }
            100% { transform: translateX(250%) skewX(-20deg); }
          }
        `}
      </style>
    </button>
  );
}
