// POST /api/supporter/redeem
// Validates and redeems a 4-word passkey, master code, or restores an existing pass token.

import { Handlers } from "$fresh/server.ts";
import {
  redeemSupporterCode,
  verifySupporterPass,
} from "@services/supporterPass.ts";
import {
  clearPhraseFailures,
  getPassportRecordByPhrase,
  isPhraseLockedOut,
  recordPhraseFailure,
  savePassportRecord,
} from "@services/passportStore.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";
import {
  isCode,
  parseFourWordPasskey,
} from "../../../utils/softstack-passport/index.js";

export const handler: Handlers = {
  async POST(req) {
    // Master codes and passkeys must cost something to guess.
    const limited = guardPublicRequest(req);
    if (limited) return limited;
    try {
      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string"
        ? body.code.trim()
        : typeof body.phrase === "string"
        ? body.phrase.trim()
        : "";

      if (!code) {
        return new Response(
          JSON.stringify({ error: "Enter a 4-word passkey or token." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      if (isCode(code)) {
        return new Response(
          JSON.stringify({
            valid: false,
            error:
              "4-word passkey required to restore this Passport. The SS- code is a public handle.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const parsedPhrase = parseFourWordPasskey(code);
      if (parsedPhrase) {
        if (await isPhraseLockedOut(parsedPhrase.phrase)) {
          return new Response(
            JSON.stringify({
              error:
                "Too many attempts for this passkey. Wait 15 minutes and try again.",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }

        const record = await getPassportRecordByPhrase(parsedPhrase.phrase);
        const verified = record
          ? await verifySupporterPass(record.licenseToken)
          : null;
        if (!record || !verified) {
          await recordPhraseFailure(parsedPhrase.phrase);
          return new Response(
            JSON.stringify({
              error: "Invalid or expired supporter passkey. Check for typos.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        await clearPhraseFailures(parsedPhrase.phrase);
        return new Response(
          JSON.stringify({
            valid: true,
            license: record.licenseToken,
            expires: new Date(verified.exp * 1000).toISOString(),
            passport: {
              code: record.code,
              name: record.name,
              phrase: record.phrase,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const result = await redeemSupporterCode(code);
      if (!result.valid || !result.license) {
        return new Response(
          JSON.stringify({
            error: "Invalid or expired supporter code. Check for typos.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      if (result.passport) {
        await savePassportRecord({
          ...result.passport,
          licenseToken: result.license,
          exp: result.exp ??
            Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        });
      }

      return new Response(
        JSON.stringify({
          valid: true,
          license: result.license,
          expires: result.exp
            ? new Date(result.exp * 1000).toISOString()
            : null,
          passport: result.passport ?? null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("[SupporterRedeem] Error:", err);
      return new Response(
        JSON.stringify({ error: "Redeem failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
