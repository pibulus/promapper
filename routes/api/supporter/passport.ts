// GET /api/supporter/passport?code=SS-XXXX-XXXX-XXXX
// Short-link lookup for the card's QR. The code is the handle; the token is
// re-verified before it leaves, so a deleted/expired record cannot leak a pass.

import { Handlers } from "$fresh/server.ts";
import { getPassportRecord } from "@services/passportStore.ts";
import { verifySupporterPass } from "@services/supporterPass.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";
import { normalizeCode } from "../../../utils/softstack-passport/index.js";

const NO_STORE = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
};

export const handler: Handlers = {
  async GET(req) {
    const limited = guardPublicRequest(req);
    if (limited) return limited;

    const code = normalizeCode(
      new URL(req.url).searchParams.get("code") ?? "",
    );
    if (!code) {
      return new Response(JSON.stringify({ error: "Invalid Passport code" }), {
        status: 400,
        headers: NO_STORE,
      });
    }

    const record = await getPassportRecord(code);
    if (!record) {
      return new Response(JSON.stringify({ error: "Passport not found" }), {
        status: 404,
        headers: NO_STORE,
      });
    }

    const verified = await verifySupporterPass(record.licenseToken);
    if (!verified) {
      return new Response(JSON.stringify({ error: "Passport expired" }), {
        status: 404,
        headers: NO_STORE,
      });
    }

    return new Response(
      JSON.stringify({
        license: record.licenseToken,
        expires: new Date(verified.exp * 1000).toISOString(),
        passport: {
          code: record.code,
          name: record.name,
          phrase: record.phrase,
        },
      }),
      { headers: NO_STORE },
    );
  },
};
