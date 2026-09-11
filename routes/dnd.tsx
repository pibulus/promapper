import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: "/for/dnd",
      },
    });
  },
};
