import { FreshContext } from "$fresh/server.ts";

/**
 * Security headers on every response.
 *
 * ProMapper was serving NONE of these — not even HSTS — while the rest of the
 * fleet had them. Added 2026-07-31.
 *
 * Referrer-Policy is the one that earns its place here. A shared map is
 * authorised by knowing its URL (/shared/<shareId>), and a live room by
 * /live/<roomId>. Without this header, any outbound click from inside one of
 * those pages puts the id in the Referer header and hands the entire auth model
 * to whoever is on the receiving end.
 *
 * X-Frame-Options is SAMEORIGIN, not DENY as elsewhere in the fleet, and that
 * difference is deliberate: islands/ColorLabIsland.tsx embeds `/` in a
 * same-origin iframe for its live preview (routes/dev/colors.tsx), and DENY
 * blocks same-origin framing too. SAMEORIGIN still stops another site framing
 * ProMapper, which is the clickjacking case that matters. Do not "fix" this to
 * DENY without deleting that preview first.
 *
 * No Content-Security-Policy yet, on purpose. This app loads Excalidraw and d3,
 * opens websockets to the collab Durable Object and to Deepgram, and talks to
 * OpenRouter server-side. A CSP that misses one of those white-screens a
 * feature silently, with nothing pointing back at this file. It wants its own
 * pass with the origin list verified against the running app.
 */
export async function handler(_req: Request, ctx: FreshContext) {
  const resp = await ctx.next();

  resp.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  resp.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resp.headers.set("X-Frame-Options", "SAMEORIGIN");
  resp.headers.set("X-Content-Type-Options", "nosniff");

  return resp;
}
