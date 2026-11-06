// Passport index for ProMapper: SS- code → the token/identity it belongs to.
//
// This is the short link the card's QR encodes. It is deliberately a lookup,
// not a second copy of the pass: the token is re-verified before it leaves.

export interface PassportRecord {
  code: string;
  name: string;
  phrase: string;
  licenseToken: string;
  exp: number;
  checkoutId?: string;
  email?: string;
  /** Filled by savePassportRecord. */
  updatedAt?: number;
}

const KEY_PREFIX = "promapper_passports";

let kvPromise: Promise<Deno.Kv> | null = null;

async function getKv(): Promise<Deno.Kv | null> {
  try {
    const path = Deno.env.get("DENO_KV_PATH") || undefined;
    if (!kvPromise) kvPromise = Deno.openKv(path);
    return await kvPromise;
  } catch (err) {
    kvPromise = null;
    console.error("[PassportStore] Deno KV unavailable:", err);
    if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
      throw new Error(
        `Deno KV is required in production: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return null;
  }
}

const memStore = new Map<string, PassportRecord>();

export async function savePassportRecord(
  record: PassportRecord,
): Promise<void> {
  const value = { ...record, updatedAt: Date.now() };
  const kv = await getKv();
  if (kv) {
    await kv.set([KEY_PREFIX, record.code], value, {
      expireIn: 400 * 24 * 60 * 60 * 1000,
    });
  } else {
    memStore.set(record.code, value);
  }
}

export async function getPassportRecord(
  code: string,
): Promise<PassportRecord | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const kv = await getKv();
  if (kv) {
    const res = await kv.get<PassportRecord>([KEY_PREFIX, normalized]);
    return res.value;
  }
  return memStore.get(normalized) ?? null;
}
