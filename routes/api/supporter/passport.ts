// GET /api/supporter/passport — retired (bare SS- code is a public handle, never a credential).
// POST /api/supporter/passport — restores a Passport given its 4-word passkey.

import { Handlers } from "$fresh/server.ts";
import {
  clearPhraseFailures,
  getPassportRecordByPhrase,
  isPhraseLockedOut,
  recordPhraseFailure,
} from "@services/passportStore.ts";
import { verifySupporterPass } from "@services/supporterPass.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";
import {
  isCode,
  parseFourWordPasskey,
} from "../../../utils/softstack-passport/index.js";

const NO_STORE = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
};

export const handler: Handlers = {
  GET(_req) {
    return new Response(
      JSON.stringify({
        error:
          "Code-only lookup is retired. Enter the 4-word passkey to restore this Passport.",
      }),
      {
        status: 410,
        headers: NO_STORE,
      },
    );
  },

  async POST(req) {
    const limited = guardPublicRequest(req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const rawInput = typeof body.phrase === "string"
      ? body.phrase.trim()
      : typeof body.code === "string"
      ? body.code.trim()
      : "";

    if (!rawInput || isCode(rawInput)) {
      return new Response(
        JSON.stringify({
          error:
            "Enter the 4-word passkey to restore this Passport. The SS- code is a public handle.",
        }),
        {
          status: 400,
          headers: NO_STORE,
        },
      );
    }

    const parsed = parseFourWordPasskey(rawInput);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Enter a valid 4-word passkey." }),
        {
          status: 400,
          headers: NO_STORE,
        },
      );
    }

    if (await isPhraseLockedOut(parsed.phrase)) {
      return new Response(
        JSON.stringify({
          error:
            "Too many attempts for this passkey. Wait 15 minutes and try again.",
        }),
        {
          status: 429,
          headers: NO_STORE,
        },
      );
    }

    const record = await getPassportRecordByPhrase(parsed.phrase);
    if (!record) {
      await recordPhraseFailure(parsed.phrase);
      return new Response(JSON.stringify({ error: "Passport not found" }), {
        status: 404,
        headers: NO_STORE,
      });
    }

    const verified = await verifySupporterPass(record.licenseToken);
    if (!verified) {
      await recordPhraseFailure(parsed.phrase);
      return new Response(JSON.stringify({ error: "Passport expired" }), {
        status: 404,
        headers: NO_STORE,
      });
    }

    await clearPhraseFailures(parsed.phrase);

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
