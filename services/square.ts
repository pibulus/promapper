// Square payment provider for ProMapper Supporter Pass.
// Creates online checkout payment links and verifies Square webhook signatures.

const DEFAULT_SQUARE_VERSION = "2026-01-22";

export function getSquareConfig() {
  return {
    environment: Deno.env.get("SQUARE_ENVIRONMENT")?.trim() || "production",
    accessToken: Deno.env.get("SQUARE_ACCESS_TOKEN")?.trim() || "",
    locationId: Deno.env.get("SQUARE_LOCATION_ID")?.trim() || "",
    apiVersion: Deno.env.get("SQUARE_API_VERSION")?.trim() ||
      DEFAULT_SQUARE_VERSION,
    webhookSignatureKey: Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY")?.trim() ||
      "",
  };
}

export function isSquareConfigured(): boolean {
  const config = getSquareConfig();
  return Boolean(config.accessToken && config.locationId);
}

export function getSquareBaseUrl(): string {
  const config = getSquareConfig();
  return config.environment.toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function getSupporterPrice() {
  const amountStr = Deno.env.get("SUPPORTER_PRICE_CENTS")?.trim();
  const amount = amountStr ? Number(amountStr) : 4900; // $49.00 AUD
  const currency = Deno.env.get("SUPPORTER_CURRENCY")?.trim() || "AUD";
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : 4900,
    currency,
    displayPrice: `$${(amount / 100).toFixed(0)}`,
  };
}

export interface CreateCheckoutOptions {
  checkoutId: string;
  redirectUrl: string;
  userEmail?: string;
}

export interface SquareCheckoutResult {
  paymentLinkId: string;
  providerOrderId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
}

/**
 * Create a Square Online Checkout payment link for ProMapper Supporter Pass.
 */
export async function createSquareCheckout(
  options: CreateCheckoutOptions,
): Promise<SquareCheckoutResult> {
  const config = getSquareConfig();
  if (!isSquareConfigured()) {
    throw new Error("Square checkout is not configured on the server");
  }

  const price = getSupporterPrice();
  const baseUrl = getSquareBaseUrl();

  const body: Record<string, unknown> = {
    idempotency_key: options.checkoutId,
    description: `ProMapper Supporter Pass (1 Year) — ${options.checkoutId}`,
    quick_pay: {
      name: "ProMapper Supporter Pass (1 Year)",
      price_money: {
        amount: price.amount,
        currency: price.currency,
      },
      location_id: config.locationId,
    },
    checkout_options: {
      redirect_url: options.redirectUrl,
      ask_for_shipping_address: false,
    },
    payment_note: `ProMapper Supporter Pass ${options.checkoutId}`,
  };

  if (options.userEmail && options.userEmail.includes("@")) {
    body.pre_populated_data = {
      buyer_email: options.userEmail.trim(),
    };
  }

  const res = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Square-Version": config.apiVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.payment_link?.url) {
    console.error("[Square] Failed to create payment link:", data);
    const msg = data.errors?.[0]?.detail || "Square checkout creation failed";
    throw new Error(msg);
  }

  return {
    paymentLinkId: data.payment_link.id,
    providerOrderId: data.payment_link.order_id || "",
    checkoutUrl: data.payment_link.long_url || data.payment_link.url,
    amount: price.amount,
    currency: price.currency,
  };
}

/**
 * Verify a Square Webhook HMAC-SHA256 signature.
 */
export async function verifySquareWebhookSignature(options: {
  rawBody: string;
  signature: string;
  notificationUrl: string;
}): Promise<boolean> {
  const config = getSquareConfig();
  const signatureKey = config.webhookSignatureKey;
  if (!signatureKey || !options.signature || !options.notificationUrl) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signatureKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const payload = `${options.notificationUrl}${options.rawBody}`;
    const expectedSigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload),
    );

    // Square sends base64 signature
    const providedSigBytes = Uint8Array.from(
      atob(options.signature),
      (c) => c.charCodeAt(0),
    );

    const expectedArray = new Uint8Array(expectedSigBytes);
    if (providedSigBytes.length !== expectedArray.length) {
      return false;
    }

    let diff = 0;
    for (let i = 0; i < expectedArray.length; i++) {
      diff |= expectedArray[i] ^ providedSigBytes[i];
    }
    return diff === 0;
  } catch (err) {
    console.error("[Square] Signature verification error:", err);
    return false;
  }
}

/**
 * Extract payment object from Square webhook event.
 */
export function extractSquarePayment(event: Record<string, unknown>) {
  const data = event?.data as Record<string, unknown> | undefined;
  const object = data?.object as Record<string, unknown> | undefined;
  const payment = object?.payment as Record<string, unknown> | undefined;
  if (!payment || typeof payment.id !== "string") {
    return null;
  }
  return {
    id: payment.id as string,
    orderId: (payment.order_id as string) || "",
    status: (payment.status as string) || "",
    buyerEmail: (payment.buyer_email_address as string) || "",
    amountMoney: payment.amount_money as
      | { amount: number; currency: string }
      | undefined,
  };
}
