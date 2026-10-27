import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: "/es/rol",
      },
    });
  },
};
