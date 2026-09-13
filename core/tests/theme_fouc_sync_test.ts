/**
 * Guard: the FOUC script in _app.tsx handles SHUFFLE rolls (the only theme
 * source a user ever SEES since Aug 2026 — though the named themes are not
 * dead: they remain the crash-safe fallback, see docs/COLOR-SYSTEM.md). It
 * must restore saved vars and check the current schema version so old rolls
 * get discarded rather than replaying frozen vars forever.
 */

import { assertEquals } from "./_assert.ts";
import { SHUFFLE_SCHEMA_VERSION } from "../theme/themeEngine.ts";

const appSource = await Deno.readTextFile(
  new URL("../../routes/_app.tsx", import.meta.url),
);

Deno.test("FOUC script restores SHUFFLE rolls from localStorage", () => {
  assertEquals(
    appSource.includes('"SHUFFLE"'),
    true,
    "FOUC script must handle SHUFFLE theme name",
  );
  assertEquals(
    appSource.includes("custom.vars"),
    true,
    "FOUC script must apply saved vars from custom.vars",
  );
});

Deno.test("FOUC script checks the current SHUFFLE_SCHEMA_VERSION", () => {
  assertEquals(
    appSource.includes(`parsed.v!==${SHUFFLE_SCHEMA_VERSION}`),
    true,
    `FOUC script must check v===${SHUFFLE_SCHEMA_VERSION} (bump both together)`,
  );
});
