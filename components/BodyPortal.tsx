/**
 * BodyPortal — renders children into document.body.
 *
 * Every fixed-position overlay that lives inside a flip card needs this:
 * the flip faces carry perspective/rotateY transforms, which make ancestors
 * the containing block for position:fixed. Without the portal, "fullscreen"
 * overlays fill the card instead of the viewport and context menus land
 * offset from the cursor.
 */

import { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";

export default function BodyPortal(
  { children }: { children: ComponentChildren },
) {
  // SSR: no document — render inline (overlays are interaction-driven, so
  // this branch only ever renders nothing-visible markup).
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(<>{children}</>, document.body);
}
