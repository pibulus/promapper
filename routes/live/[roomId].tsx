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
    return ctx.render({ roomId: ctx.params.roomId, partyHost });
  },
};

export default function LiveRoom({ data }: PageProps<LiveData>) {
  return (
    <>
      <Head>
        <title>Live Collaboration | ProMapper</title>
        <meta
          name="description"
          content="A live ProMapper collaboration room"
        />
        <meta name="robots" content="noindex" />
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
