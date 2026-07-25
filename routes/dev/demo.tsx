/**
 * /dev/demo — seed a demo project and open the dashboard.
 *
 * Dev-only (DENO_ENV=development), not linked anywhere. For screenshots and
 * showing the thing off without burning an AI call or needing a key.
 */

import { Head } from "$fresh/runtime.ts";
import { Handlers } from "$fresh/server.ts";
import DemoSeedIsland from "../../islands/DemoSeedIsland.tsx";

export const handler: Handlers = {
  GET(_req, ctx) {
    if (Deno.env.get("DENO_ENV") !== "development") {
      return ctx.renderNotFound();
    }
    return ctx.render();
  },
};

export default function DemoSeedPage() {
  return (
    <>
      <Head>
        <title>Seeding demo — ProMapper</title>
      </Head>
      <main style={{ minHeight: "100vh" }}>
        <DemoSeedIsland />
      </main>
    </>
  );
}
