// POST /api/supporter/email-pass
// Emails a verified Passport holder their code, 4-word passkey, and restore link.
// Never logs or stores the email address.

import { Handlers } from "$fresh/server.ts";
import { guardPublicRequest } from "@services/requestGuard.ts";
import {
  isSupporterEmailConfigured,
  sendSupporterReceiptEmail,
} from "@services/checkoutStore.ts";
import {
  passportFromPayload,
  verifySupporterPass,
} from "@services/supporterPass.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LEN = 254;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const handler: Handlers = {
  async POST(req) {
    const limited = guardPublicRequest(req);
    if (limited) return limited;

    let body: { email?: unknown; token?: unknown; pass?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ sent: false, error: "Invalid JSON body" }, 400);
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (
      !email ||
      email.length > MAX_EMAIL_LEN ||
      /[\r\n]/.test(email) ||
      !EMAIL_RE.test(email)
    ) {
      return json(
        { sent: false, error: "That email address looks off." },
        400,
      );
    }

    const rawToken = req.headers.get("x-promapper-supporter-token")?.trim() ||
      (typeof body.token === "string" ? body.token.trim() : "") ||
      (typeof body.pass === "string" ? body.pass.trim() : "");

    if (!rawToken) {
      return json(
        { sent: false, error: "Active Passport required." },
        401,
      );
    }

    const verified = await verifySupporterPass(rawToken);
    if (!verified) {
      return json(
        { sent: false, error: "That Passport could not be verified." },
        401,
      );
    }

    if (!isSupporterEmailConfigured()) {
      return json(
        {
          sent: false,
          error: "Passport email needs server setup first.",
        },
        503,
      );
    }

    const details = await passportFromPayload(verified);
    if (!details) {
      return json(
        { sent: false, error: "Passport details unavailable." },
        400,
      );
    }

    const origin = new URL(req.url).origin;
    const result = await sendSupporterReceiptEmail({
      email,
      code: details.code,
      name: details.name,
      phrase: details.phrase,
      checkoutId: verified.checkoutId,
      appOrigin: origin,
    });

    if (!result.sent) {
      return json(
        {
          sent: false,
          error: result.error || "The email did not send. Try again.",
        },
        502,
      );
    }

    return json({ ok: true, sent: true });
  },
};
