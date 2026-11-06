// Passport index for ProMapper: PBKDF2(phrase) → SS- code → the token/identity.
//
// The 4-word passphrase is the root credential; the SS- code is the public
// handle. The token is re-verified before it leaves.

import {
  getPassportSecret,
  hashPasskeyPhrase,
  passportForSeed,
} from "./supporterPass.ts";
import { parseFourWordPasskey } from "../utils/softstack-passport/index.js";

export interface PassportRecord {
  code: string;
  name: string;
  phrase: string;
  licenseToken: string;
  exp: number;
  checkoutId?: string;
  email?: string;
  aliases?: string[];
  /** Filled by savePassportRecord. */
  updatedAt?: number;
}

interface LockoutState {
  misses: number;
  windowStart: number;
}

const KEY_PREFIX = "promapper_passports";
const KEY_PREFIX_PHRASE = "promapper_passkey_index";
const KEY_PREFIX_LOCKOUT = "promapper_passkey_lockout";
const LOCKOUT_MAX_MISSES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

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
const memPhraseIndex = new Map<string, string>();
const memLockouts = new Map<string, LockoutState>();

export async function savePassportRecord(
  record: PassportRecord,
): Promise<void> {
  const value = { ...record, updatedAt: Date.now() };
  const phraseHash = record.phrase
    ? await hashPasskeyPhrase(record.phrase)
    : "";
  const kv = await getKv();
  if (kv) {
    await kv.set([KEY_PREFIX, record.code], value, {
      expireIn: 400 * 24 * 60 * 60 * 1000,
    });
    if (phraseHash) {
      await kv.set([KEY_PREFIX_PHRASE, phraseHash], record.code, {
        expireIn: 400 * 24 * 60 * 60 * 1000,
      });
    }
  } else {
    memStore.set(record.code, value);
    if (phraseHash) {
      memPhraseIndex.set(phraseHash, record.code);
    }
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

export async function getPassportRecordByPhrase(
  phrase: string,
): Promise<PassportRecord | null> {
  const parsed = parseFourWordPasskey(phrase);
  if (!parsed) return null;
  const phraseHash = await hashPasskeyPhrase(parsed.phrase);
  if (!phraseHash) return null;

  const kv = await getKv();
  if (kv) {
    const indexed = await kv.get<string>([KEY_PREFIX_PHRASE, phraseHash]);
    if (indexed.value) {
      const record = await getPassportRecord(indexed.value);
      if (record) return record;
    }
  } else {
    const indexedCode = memPhraseIndex.get(phraseHash);
    if (indexedCode) {
      const record = memStore.get(indexedCode);
      if (record) return record;
    }
  }

  // Fallback for deterministic phrase -> code derivation
  const derived = await passportForSeed(parsed.phrase, getPassportSecret());
  const record = await getPassportRecord(derived.code);
  if (record && record.phrase === parsed.phrase) {
    return record;
  }
  return null;
}

export async function isPhraseLockedOut(phrase: string): Promise<boolean> {
  const parsed = parseFourWordPasskey(phrase);
  if (!parsed) return false;
  const phraseHash = await hashPasskeyPhrase(parsed.phrase);
  if (!phraseHash) return false;

  const now = Date.now();
  const kv = await getKv();
  if (kv) {
    const res = await kv.get<LockoutState>([KEY_PREFIX_LOCKOUT, phraseHash]);
    const state = res.value;
    if (!state) return false;
    if (now - state.windowStart > LOCKOUT_WINDOW_MS) return false;
    return state.misses >= LOCKOUT_MAX_MISSES;
  }

  const state = memLockouts.get(phraseHash);
  if (!state) return false;
  if (now - state.windowStart > LOCKOUT_WINDOW_MS) {
    memLockouts.delete(phraseHash);
    return false;
  }
  return state.misses >= LOCKOUT_MAX_MISSES;
}

export async function recordPhraseFailure(phrase: string): Promise<void> {
  const parsed = parseFourWordPasskey(phrase);
  if (!parsed) return;
  const phraseHash = await hashPasskeyPhrase(parsed.phrase);
  if (!phraseHash) return;

  const now = Date.now();
  const kv = await getKv();
  if (kv) {
    const res = await kv.get<LockoutState>([KEY_PREFIX_LOCKOUT, phraseHash]);
    const prev = res.value;
    const next: LockoutState =
      prev && now - prev.windowStart <= LOCKOUT_WINDOW_MS
        ? { misses: prev.misses + 1, windowStart: prev.windowStart }
        : { misses: 1, windowStart: now };
    await kv.set([KEY_PREFIX_LOCKOUT, phraseHash], next, {
      expireIn: LOCKOUT_WINDOW_MS,
    });
    return;
  }

  const prev = memLockouts.get(phraseHash);
  const next: LockoutState = prev && now - prev.windowStart <= LOCKOUT_WINDOW_MS
    ? { misses: prev.misses + 1, windowStart: prev.windowStart }
    : { misses: 1, windowStart: now };
  memLockouts.set(phraseHash, next);
}

export async function clearPhraseFailures(phrase: string): Promise<void> {
  const parsed = parseFourWordPasskey(phrase);
  if (!parsed) return;
  const phraseHash = await hashPasskeyPhrase(parsed.phrase);
  if (!phraseHash) return;

  const kv = await getKv();
  if (kv) {
    await kv.delete([KEY_PREFIX_LOCKOUT, phraseHash]);
  } else {
    memLockouts.delete(phraseHash);
  }
}
