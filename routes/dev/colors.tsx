/**
 * /dev/colors — the color tuning bench.
 *
 * Dev-only. Explore accent × ground combos with OKLCH sliders against a live
 * preview of the real app, then export the result as a CURATED_PAIRS entry.
 * See docs/COLOR-SYSTEM.md for the law the sliders play inside.
 */

import { Head } from "$fresh/runtime.ts";
import { Handlers } from "$fresh/server.ts";
import ColorLabIsland from "../../islands/ColorLabIsland.tsx";

export const handler: Handlers = {
  GET(_req, ctx) {
    if (Deno.env.get("DENO_ENV") !== "development") {
      return ctx.renderNotFound();
    }
    return ctx.render();
  },
};

export default function ColorLabPage() {
  return (
    <>
      <Head>
        <title>Color lab — ProMapper</title>
        <link rel="stylesheet" href="/styles.css" />
      </Head>
      <ColorLabIsland />
    </>
  );
}
