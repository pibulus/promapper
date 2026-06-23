/**
 * /dev/nodemap — standalone node-map test harness.
 *
 * Dev-only. Not linked anywhere in the app; a place to render the node map in
 * isolation so we can screenshot it, drive its living-update behavior, and
 * measure memory without the rest of the dashboard in the way.
 */

import { Head } from "$fresh/runtime.ts";
import { Handlers } from "$fresh/server.ts";
import NodemapTestIsland from "../../islands/NodemapTestIsland.tsx";

export const handler: Handlers = {
  GET(_req, ctx) {
    if (Deno.env.get("DENO_ENV") !== "development") {
      return ctx.renderNotFound();
    }
    return ctx.render();
  },
};

export default function NodemapTestPage() {
  return (
    <>
      <Head>
        <title>Nodemap Test — ProMapper</title>
      </Head>
      <main style={{ minHeight: "100vh", padding: "1.5rem 0" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--heading-size)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          Node Map Test Harness
        </h1>
        <NodemapTestIsland />
      </main>
    </>
  );
}
