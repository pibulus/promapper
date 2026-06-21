/**
 * Haptics — tiny wrappers around the Vibration API.
 *
 * No-ops gracefully where unsupported (desktop, iOS Safari, reduced-motion).
 * Part of the SoftStack design DNA: small tactile confirmations that make
 * interactions feel physical without being annoying.
 */

function canVibrate(): boolean {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return false;
  }
  // Respect users who asked for less motion.
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return true;
}

function buzz(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore — vibration is a nicety, never a hard dependency.
  }
}

/** A light tick — selection, pickup, small confirmations. */
export function hapticTap(): void {
  buzz(8);
}

/** A firmer bump — drop committed, item completed. */
export function hapticBump(): void {
  buzz(16);
}

/** A soft double — reorder landed in a new slot. */
export function hapticSnap(): void {
  buzz([10, 30, 12]);
}
