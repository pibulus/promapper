/**
 * Live Collaboration Route
 *
 * Real-time shared view of a conversation. Anyone with the room link can view
 * and edit; updates sync to everyone via PartyKit. The room id is the secret
 * (no passwords); rooms expire 24h after last activity.
 */

import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import LiveCollabIsland from "../../islands/LiveCollabIsland.tsx";

interface LiveData {
  roomId: string;
  partyHost: string;
}

export const handler: Handlers<LiveData> = {
  GET(_req, ctx) {
    // The browser connects directly to PartyKit, so it needs the public host.
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
      </Head>

      <div class="mapper-scene min-h-screen">
        <LiveCollabIsland roomId={data.roomId} partyHost={data.partyHost} />
      </div>
    </>
  );
}
