/**
 * Live Collaboration Route
 *
 * Anyone with the room link joins the live session. The page renders the
 * standard HomeIsland, and a small bootstrap script sets the liveSession
 * signal so live features (PartyKit sync, voice drawer, recording, chat)
 * activate automatically on the current dashboard.
 */

import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import HomeIsland from "../../islands/HomeIsland.tsx";

interface LiveData {
  roomId: string;
  partyHost: string;
}

export const handler: Handlers<LiveData> = {
  GET(_req, ctx) {
    const partyHost = (Deno.env.get("PUBLIC_PARTYKIT_HOST") ??
      Deno.env.get("PARTYKIT_HOST") ?? "").trim();
    // Sanitize the roomId before it reaches the template — V8's JSON.stringify
    // does NOT guarantee escaping of </ (engine-dependent). A roomId containing
    // </script> would break out of the inline bootstrap script.
    const safeRoomId = ctx.params.roomId.replace(/[<>&"'/]/g, "");
    return ctx.render({ roomId: safeRoomId, partyHost });
  },
};

/**
 * OG/Twitter tags for a live room. Deliberately content-free — a live link is
 * private-by-key, so the preview must NEVER hint at what's inside the room.
 * Charming + generic: "someone saved you a seat".
 */
function LiveOgTags() {
  const title = "Someone opened a live ProMapper room with you";
  const description =
    "Hop in — you'll shape this project map together, in real time.";
  return (
    <>
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta
        property="og:image"
        content="https://promapper.app/og-image.png"
      />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content="ProMapper — project maps from messy conversations"
      />
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta
        property="twitter:image"
        content="https://promapper.app/og-image.png"
      />
    </>
  );
}

export default function LiveRoom({ data }: PageProps<LiveData>) {
  // No PartyKit host configured = live sync can never connect. Say so instead
  // of rendering a normal-looking homepage that silently isn't live (the
  // shared link would just look dead to the person who received it).
  if (!data.partyHost) {
    return (
      <>
        <Head>
          <title>Live Collaboration | ProMapper</title>
          <meta name="robots" content="noindex" />
          <LiveOgTags />
        </Head>
        <main class="live-unconfigured">
          <h1>Live rooms are napping</h1>
          <p>
            This server isn't set up for live collaboration yet (no PartyKit
            host configured). You can still use ProMapper solo on the{" "}
            <a href="/">home page</a>.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Live Collaboration | ProMapper</title>
        <meta
          name="description"
          content="A live ProMapper collaboration room"
        />
        <meta name="robots" content="noindex" />
        <LiveOgTags />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LIVE_ROOM__ = ${
              JSON.stringify({ roomId: data.roomId, partyHost: data.partyHost })
            };`,
          }}
        />
      </Head>
      <HomeIsland />
    </>
  );
}
