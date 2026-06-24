/**
 * NumberTicker — animates a number counting up/down.
 *
 * Adapted from magicui. Uses requestAnimationFrame with easing.
 * Smooth count animation from 0 to the target value.
 *
 * Usage: <NumberTicker value={42} />  // animates 0→42
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface NumberTickerProps {
  value: number;
  duration?: number;
  delay?: number;
  decimal?: number;
}

export default function NumberTicker(
  { value, duration = 1200, delay = 0, decimal = 0 }: NumberTickerProps,
) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!IS_BROWSER) return;

    const startValue = display;
    const change = value - startValue;
    if (change === 0) return;

    const startTime = performance.now() + delay;
    let cancelled = false;

    function tick(now: number) {
      if (cancelled) return;
      const elapsed = now - startTime;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + change * eased;
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    // Small delay via setTimeout so the initial render is 0, then animate
    const t = setTimeout(() => {
      frameRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  return <>{display.toFixed(decimal)}</>;
}
