/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

// Non-fatal .env load: Deno Deploy has no .env file on disk, and a hard
// `import "$std/dotenv/load.ts"` throws at boot there. Locally this still
// populates Deno.env exactly as before; in the container it no-ops and the
// platform's own env vars take over.
try {
  await import("$std/dotenv/load.ts");
} catch {
  // No .env present (Deno Deploy) — env comes from the platform.
}

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

await start(manifest, config);
