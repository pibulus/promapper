import { defineConfig } from "$fresh/server.ts";

// No tailwind plugin: it compiles CSS at runtime and does not survive a Deno
// Deploy build ("Finish setting up Fresh" 500). Tailwind is compiled ahead of
// time instead — `deno task build:css` turns static/styles.css into the
// committed static/styles.build.css that _app.tsx links. Re-run that task after
// changing styles or adding classes to routes/islands/components.
export default defineConfig({
  server: {
    hostname: "0.0.0.0", // Allow local network access for phone testing
    port: 8003,
  },
});
