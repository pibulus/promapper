/**
 * Guard against drift between the typed theme source (core/theme/themes.ts) and
 * the hand-inlined FOUC-prevention map in routes/_app.tsx. The FOUC script must
 * stay zero-import (it runs before any module JS), so the palette is duplicated
 * there by necessity — this test fails if the two ever fall out of sync.
 */

import { assertEquals } from "./_assert.ts";
import { proMapperThemes } from "../theme/themes.ts";

const appSource = await Deno.readTextFile(
  new URL("../../routes/_app.tsx", import.meta.url),
);

Deno.test("every theme name appears in the _app.tsx FOUC script", () => {
  for (const theme of proMapperThemes) {
    assertEquals(
      appSource.includes(`"${theme.name}"`),
      true,
      `Theme "${theme.name}" is defined in themes.ts but missing from the FOUC script in routes/_app.tsx`,
    );
  }
});

Deno.test("each theme's accent color appears in the _app.tsx FOUC script", () => {
  for (const theme of proMapperThemes) {
    // accent is a plain hex literal; if it drifts the pre-paint color is stale
    assertEquals(
      appSource.includes(theme.accent),
      true,
      `Theme "${theme.name}" accent ${theme.accent} is missing/stale in the FOUC script in routes/_app.tsx`,
    );
  }
});
