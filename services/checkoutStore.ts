// Checkout Store for ProMapper Supporter Passes using Deno KV.
// Tracks pending checkouts, marks paid transactions, and stores signed passes.

import { signSupporterPass } from "./supporterPass.ts";

export interface CheckoutRecord {
  checkoutId: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  currency: string;
  providerOrderId?: string;
  paymentId?: string;
  email?: string;
  licenseToken?: string;
  createdAt: number;
  paidAt?: number;
}

let kvPromise: Promise<Deno.Kv> | null = null;

async function getKv(): Promise<Deno.Kv | null> {
  try {
    const path = Deno.env.get("DENO_KV_PATH") || undefined;
    if (!kvPromise) kvPromise = Deno.openKv(path);
    return await kvPromise;
  } catch (err) {
    console.error("[CheckoutStore] Deno KV unavailable:", err);
    return null;
  }
}

// In-memory fallback for local dev / tests when KV is not available
const memStore = new Map<string, CheckoutRecord>();

/**
 * Save a newly created pending checkout.
 */
export async function savePendingCheckout(data: {
  checkoutId: string;
  amount: number;
  currency: string;
  providerOrderId?: string;
  email?: string;
}): Promise<CheckoutRecord> {
  const record: CheckoutRecord = {
    checkoutId: data.checkoutId,
    status: "pending",
    amount: data.amount,
    currency: data.currency,
    providerOrderId: data.providerOrderId,
    email: data.email,
    createdAt: Date.now(),
  };

  const kv = await getKv();
  if (kv) {
    await kv.set(["promapper_checkouts", data.checkoutId], record, {
      expireIn: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    if (data.providerOrderId) {
      await kv.set(
        ["promapper_orders", data.providerOrderId],
        data.checkoutId,
        { expireIn: 30 * 24 * 60 * 60 * 1000 },
      );
    }
  } else {
    memStore.set(data.checkoutId, record);
    if (data.providerOrderId) {
      memStore.set(`order:${data.providerOrderId}`, record);
    }
  }

  return record;
}

/**
 * Get checkout by ID.
 */
export async function getCheckout(
  checkoutId: string,
): Promise<CheckoutRecord | null> {
  const kv = await getKv();
  if (kv) {
    const res = await kv.get<CheckoutRecord>([
      "promapper_checkouts",
      checkoutId,
    ]);
    return res.value;
  }
  return memStore.get(checkoutId) ?? null;
}

/**
 * Find checkout ID from Square order ID.
 */
export async function findCheckoutIdByOrderId(
  orderId: string,
): Promise<string | null> {
  if (!orderId) return null;
  const kv = await getKv();
  if (kv) {
    const res = await kv.get<string>(["promapper_orders", orderId]);
    return res.value;
  }
  const record = memStore.get(`order:${orderId}`);
  return record ? record.checkoutId : null;
}

/**
 * Mark a checkout as paid, mint a signed supporter pass token, and save it.
 */
export async function markCheckoutPaid(options: {
  checkoutId: string;
  providerOrderId?: string;
  paymentId?: string;
  email?: string;
}): Promise<CheckoutRecord | null> {
  const existing = await getCheckout(options.checkoutId);
  // Square sends payment.created AND payment.updated, and retries anything
  // that hiccups. The second COMPLETED must not mint a second pass or send a
  // second receipt — the first one already did the job.
  if (existing?.status === "paid" && existing.licenseToken) return existing;
  const now = Date.now();

  const licenseToken = await signSupporterPass({
    checkoutId: options.checkoutId,
    email: options.email ?? existing?.email,
    durationDays: 365,
    tier: "supporter",
  });

  const updated: CheckoutRecord = {
    checkoutId: options.checkoutId,
    status: "paid",
    amount: existing?.amount ?? 4900,
    currency: existing?.currency ?? "AUD",
    providerOrderId: options.providerOrderId ?? existing?.providerOrderId,
    paymentId: options.paymentId ?? existing?.paymentId,
    email: options.email ?? existing?.email,
    licenseToken,
    createdAt: existing?.createdAt ?? now,
    paidAt: now,
  };

  const kv = await getKv();
  if (kv) {
    await kv.set(["promapper_checkouts", options.checkoutId], updated, {
      expireIn: 400 * 24 * 60 * 60 * 1000, // 400 days (1 year pass + grace)
    });
    if (updated.providerOrderId) {
      await kv.set(
        ["promapper_orders", updated.providerOrderId],
        options.checkoutId,
        { expireIn: 400 * 24 * 60 * 60 * 1000 },
      );
    }
  } else {
    memStore.set(options.checkoutId, updated);
  }

  // Attempt to send magic email if Resend key is configured
  if (updated.email) {
    void sendSupporterReceiptEmail({
      email: updated.email,
      licenseToken,
      checkoutId: options.checkoutId,
    });
  }

  return updated;
}

/**
 * Send a pastel-punk receipt email with the 1-click magic unlock link via Resend (optional).
 */
async function sendSupporterReceiptEmail(options: {
  email: string;
  licenseToken: string;
  checkoutId: string;
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendApiKey || !options.email.includes("@")) return;

  const appUrl = Deno.env.get("APP_URL")?.trim() || "https://promapper.app";
  const unlockLink = `${appUrl}/?pass=${
    encodeURIComponent(options.licenseToken)
  }`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ProMapper <hello@promapper.app>",
        to: [options.email],
        subject: "Your ProMapper Supporter Pass is inside 💜",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background: #fffcf4; border: 3px solid #181411; border-radius: 16px;">
            <h1 style="font-size: 24px; font-weight: 900; color: #181411; margin-bottom: 8px;">You're a Supporter! 💜</h1>
            <p style="font-size: 15px; line-height: 1.5; color: #3a322c;">
              Thank you for supporting ProMapper. Your 1-year Supporter Pass is active with unlimited audio takes, live multiplayer rooms, and full export decks.
            </p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${unlockLink}" style="display: inline-block; padding: 14px 28px; background: #ff6ac2; color: #ffffff; text-decoration: none; font-weight: 900; font-size: 16px; border: 3px solid #181411; border-radius: 12px; box-shadow: 4px 4px 0px #181411;">
                Unlock ProMapper on This Device
              </a>
            </div>
            <p style="font-size: 13px; color: #726559;">
              <strong>Your Pass Token:</strong><br/>
              <code style="display: block; margin-top: 6px; padding: 10px; background: #f0eae1; border: 1px solid #181411; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 12px;">${options.licenseToken}</code>
            </p>
            <p style="font-size: 12px; color: #8e8072; margin-top: 24px; border-top: 1px solid #e2d9cd; padding-top: 12px;">
              ProMapper by Pablo Alvarado · Zero tracking, zero surveillance.
            </p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error("[CheckoutStore] Resend email error (non-fatal):", err);
  }
}
