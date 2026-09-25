// Supporter & BYOK reactive signals for ProMapper UI.

import { computed, signal } from "@preact/signals";
import {
  clearSupporterPass,
  getSupporterPass,
  setSupporterPass,
  supporterPassExpiry,
} from "../utils/supporter-pass.ts";
import { clearByoKey, getByoKey, setByoKey } from "../utils/byoKey.ts";

export const supporterModalOpen = signal(false);
export const isSupporterSignal = signal(false);
export const supporterExpirySignal = signal<Date | null>(null);
export const byokKeySignal = signal<string | null>(null);

/**
 * Sync signals with localStorage & cookies.
 */
export function refreshSupporterState() {
  if (typeof window === "undefined") return;

  const pass = getSupporterPass();
  isSupporterSignal.value = pass !== null;
  supporterExpirySignal.value = supporterPassExpiry();

  const byo = getByoKey();
  byokKeySignal.value = byo;
}

/**
 * A stored pass is only a claim; the server is the judge. A rotated secret or
 * a dropped code otherwise leaves the badge lit while every request quietly
 * rides the free rail. Asked once per load, and forgotten only on a clear
 * "no" (400) — a network blip or a 429 proves nothing.
 */
export async function confirmStoredPass(): Promise<void> {
  const pass = getSupporterPass();
  if (!pass) return;
  try {
    const res = await fetch("/api/supporter/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pass }),
    });
    if (res.status === 400) deactivatePass();
  } catch {
    // offline — keep the pass; the next load asks again
  }
}

export function openSupporterModal() {
  supporterModalOpen.value = true;
}

export function closeSupporterModal() {
  supporterModalOpen.value = false;
}

export function activatePass(pass: string): boolean {
  const ok = setSupporterPass(pass);
  if (ok) {
    refreshSupporterState();
  }
  return ok;
}

export function deactivatePass() {
  clearSupporterPass();
  refreshSupporterState();
}

export function saveByoKey(key: string) {
  setByoKey(key);
  refreshSupporterState();
}

export function removeByoKey() {
  clearByoKey();
  refreshSupporterState();
}

export const hasProAccess = computed(() => {
  return isSupporterSignal.value || Boolean(byokKeySignal.value);
});
