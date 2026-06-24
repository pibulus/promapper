/**
 * Tooltip — floating-ui powered tooltips for Preact.
 *
 * Wraps a trigger element and shows a viewport-aware tooltip on hover/focus.
 * Uses @floating-ui/dom for smart positioning (flip, shift, offset, arrow).
 * Accessible: role="tooltip", aria-describedby linking.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { ComponentChildren, JSX } from "preact";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface TooltipProps {
  content: ComponentChildren;
  children: JSX.Element;
  /** Preferred placement. Falls back via flip middleware if no room. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Extra delay before showing (ms). Default 300. */
  delay?: number;
}

export default function Tooltip(
  { content, children, placement = "top", delay = 300 }: TooltipProps,
) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useRef(`tt-${crypto.randomUUID().slice(0, 8)}`).current;

  useEffect(() => {
    if (
      !IS_BROWSER || !visible || !containerRef.current || !tooltipRef.current
    ) {
      return;
    }

    let cancelled = false;

    async function position() {
      const { computePosition, offset, flip, shift, arrow } = await import(
        "@floating-ui/dom"
      );

      const { x, y, placement: finalPlacement, middlewareData } =
        await computePosition(containerRef.current!, tooltipRef.current!, {
          placement,
          middleware: [
            offset(8),
            flip({ fallbackAxisSideDirection: "start" }),
            shift({ padding: 8 }),
            arrow({ element: arrowRef.current!, padding: 6 }),
          ],
        });

      if (cancelled) return;

      Object.assign(tooltipRef.current!.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      const arrowX = middlewareData.arrow?.x;
      const arrowY = middlewareData.arrow?.y;
      const staticSide = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      }[finalPlacement];

      if (arrowRef.current && arrowX != null && arrowY != null) {
        Object.assign(arrowRef.current.style, {
          left: arrowX != null ? `${arrowX}px` : "",
          top: arrowY != null ? `${arrowY}px` : "",
          [staticSide]: "-5px",
        });
      }
    }

    position();

    return () => {
      cancelled = true;
    };
  }, [visible, placement]);

  function show() {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setVisible(true), delay);
  }

  function hide() {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    setVisible(false);
  }

  return (
    <span
      ref={containerRef}
      style={{ display: "inline-flex", position: "relative" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={tooltipId}
    >
      {children}

      {IS_BROWSER && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          class={`tooltip-floating${visible ? " is-visible" : ""}`}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div ref={arrowRef} class="tooltip-arrow" />
          {content}
        </div>
      )}
    </span>
  );
}
