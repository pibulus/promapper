// Supporter & Pricing Modal Island for ProMapper.
// Handles Square checkout redirect, return poller, code redemption, and BYO API Key setup.

import { useEffect, useState } from "preact/hooks";
import {
  activatePass,
  byokKeySignal,
  closeSupporterModal,
  isSupporterSignal,
  refreshSupporterState,
  removeByoKey,
  saveByoKey,
  supporterExpirySignal,
  supporterModalOpen,
} from "../signals/supporterStore.ts";
import {
  clearPendingCheckout,
  getPendingCheckout,
  setPendingCheckout,
} from "../utils/supporter-pass.ts";
import { t } from "../utils/i18n.ts";

function stripCheckoutParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("checkout")) return;
  url.searchParams.delete("checkout");
  history.replaceState(null, "", url.toString());
}

export default function SupporterModal() {
  const i18n = t();
  const isOpen = supporterModalOpen.value;
  const isSupporter = isSupporterSignal.value;
  const expiry = supporterExpirySignal.value;
  const activeByoKey = byokKeySignal.value;

  const [tab, setTab] = useState<"pass" | "byok" | "faq">("pass");
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [pastedCode, setPastedCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // BYOK state
  const [byoInput, setByoInput] = useState(activeByoKey || "");
  const [byoTestStatus, setByoTestStatus] = useState<string | null>(null);
  const [isTestingByo, setIsTestingByo] = useState(false);

  // Initial sync on mount
  useEffect(() => {
    refreshSupporterState();

    // Check if coming back from Square (?checkout=CHECKOUT_ID)
    if (typeof window === "undefined") return;
    const fromUrl = new URL(window.location.href).searchParams.get("checkout");
    const checkoutId = fromUrl || getPendingCheckout();

    if (!checkoutId || isSupporter) {
      if (fromUrl) stripCheckoutParam();
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/supporter/checkout/${checkoutId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "paid" && data.license) {
            activatePass(data.license);
            clearPendingCheckout();
            stripCheckoutParam();
            setRedeemStatus("Supporter pass activated! Thank you 💜");
            return;
          }
        }
      } catch (err) {
        console.error("Poller error:", err);
      }

      if (attempts < 15) {
        setTimeout(poll, 2500);
      } else {
        clearPendingCheckout();
        if (fromUrl) stripCheckoutParam();
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [isSupporter]);

  if (!isOpen) return null;

  async function handleStartCheckout() {
    setIsStartingCheckout(true);
    setRedeemStatus(null);
    try {
      const res = await fetch("/api/supporter/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        setPendingCheckout(data.checkoutId);
        window.location.href = data.checkoutUrl;
      } else {
        setRedeemStatus(data.error || "Could not start Square checkout");
        setIsStartingCheckout(false);
      }
    } catch {
      setRedeemStatus("Network error starting checkout. Please try again.");
      setIsStartingCheckout(false);
    }
  }

  async function handleRedeemCode() {
    if (!pastedCode.trim()) return;
    setIsRedeeming(true);
    setRedeemStatus(null);
    try {
      const res = await fetch("/api/supporter/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pastedCode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.license) {
        activatePass(data.license);
        setPastedCode("");
        setRedeemStatus("✓ Supporter pass unlocked! Welcome to the crew 💜");
      } else {
        setRedeemStatus(data.error || "Invalid supporter code");
      }
    } catch {
      setRedeemStatus("Network error redeeming code.");
    } finally {
      setIsRedeeming(false);
    }
  }

  async function handleSaveByoKey() {
    const key = byoInput.trim();
    if (!key) {
      removeByoKey();
      setByoTestStatus("BYO Key cleared");
      return;
    }

    setIsTestingByo(true);
    setByoTestStatus("Verifying key with OpenRouter...");

    try {
      // Test key via OpenRouter endpoint
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        saveByoKey(key);
        setByoTestStatus("✓ Key verified & saved! All house limits bypassed.");
      } else {
        setByoTestStatus("OpenRouter refused that key. Check for typos.");
      }
    } catch {
      // If network blocked, still save locally
      saveByoKey(key);
      setByoTestStatus("✓ Key saved locally.");
    } finally {
      setIsTestingByo(false);
    }
  }

  function handleCopyPass() {
    const pass = localStorage.getItem("pm_supporter_pass");
    if (pass && navigator.clipboard) {
      navigator.clipboard.writeText(pass);
      setRedeemStatus("Pass token copied to clipboard!");
    }
  }

  return (
    <div
      class="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        background: "rgba(24, 20, 17, 0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSupporterModal();
      }}
    >
      <div
        class="w-full max-w-xl bg-[var(--surface-card)] border-4 border-[var(--line-ink)] rounded-2xl shadow-[6px_6px_0px_var(--line-ink)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div class="px-6 py-4 bg-gradient-to-r from-[var(--accent-rose-wash)] via-[var(--accent-rose-wash-soft)] to-[var(--surface-card)] border-b-3 border-[var(--line-ink)] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🗺️</span>
            <div>
              <h2 class="text-xl font-black text-[var(--soft-black)] leading-none">
                {i18n.supporterTitle}
              </h2>
              <p class="text-xs font-bold text-[var(--color-text-secondary)] mt-0.5">
                {i18n.supporterSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSupporterModal}
            class="w-8 h-8 rounded-lg border-2 border-[var(--line-ink)] bg-[var(--surface-white-warm)] text-[var(--soft-black)] font-black text-sm hover:bg-[var(--accent-strong)] hover:text-[var(--surface-white-warm)] transition-colors flex items-center justify-center shadow-[2px_2px_0px_var(--line-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div class="flex border-b-3 border-[var(--line-ink)] bg-[var(--surface-cream-hover)]">
          <button
            type="button"
            onClick={() => setTab("pass")}
            class={`flex-1 py-2.5 text-xs sm:text-sm font-black border-r-2 border-[var(--line-ink)] transition-colors ${
              tab === "pass"
                ? "bg-[var(--surface-card)] text-[var(--soft-black)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--surface-cream-hover)]"
            }`}
          >
            {i18n.tabPass}
          </button>
          <button
            type="button"
            onClick={() => setTab("byok")}
            class={`flex-1 py-2.5 text-xs sm:text-sm font-black border-r-2 border-[var(--line-ink)] transition-colors ${
              tab === "byok"
                ? "bg-[var(--surface-card)] text-[var(--soft-black)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--surface-cream-hover)]"
            }`}
          >
            {i18n.tabByok}
          </button>
          <button
            type="button"
            onClick={() => setTab("faq")}
            class={`py-2.5 px-4 text-xs sm:text-sm font-black transition-colors ${
              tab === "faq"
                ? "bg-[var(--surface-card)] text-[var(--soft-black)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--surface-cream-hover)]"
            }`}
          >
            {i18n.tabFaq}
          </button>
        </div>

        {/* Modal Body */}
        <div class="p-6 overflow-y-auto space-y-6">
          {tab === "pass" && (
            <div class="space-y-6">
              {/* Active Pass Banner */}
              {isSupporter && (
                <div class="p-4 bg-[var(--accent-rose-wash-soft)] border-3 border-[var(--line-ink)] rounded-xl shadow-[3px_3px_0px_var(--line-ink)] flex items-center justify-between">
                  <div>
                    <div class="font-black text-sm text-[var(--accent-ink)]">
                      {i18n.activePassBanner}
                    </div>
                    <div class="text-xs text-[var(--color-text-secondary)] font-medium mt-0.5">
                      {expiry
                        ? i18n.validUntil(
                          expiry.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }),
                        )
                        : i18n.lifetimePass}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPass}
                    class="px-3 py-1.5 bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg text-xs font-bold shadow-[2px_2px_0px_var(--line-ink)] hover:bg-[var(--surface-cream-hover)]"
                  >
                    {i18n.copyToken}
                  </button>
                </div>
              )}

              {/* Price & Pitch */}
              <div class="p-5 bg-gradient-to-br from-[var(--accent-rose-wash-soft)] to-[var(--surface-card)] border-3 border-[var(--line-ink)] rounded-xl shadow-[4px_4px_0px_var(--line-ink)] relative">
                <div class="flex justify-between items-start">
                  <div>
                    <span class="text-xs font-black uppercase tracking-wider bg-[var(--accent-strong)] text-[var(--surface-white-warm)] px-2.5 py-0.5 rounded-md border-2 border-[var(--line-ink)]">
                      {i18n.pass1Year}
                    </span>
                    <h3 class="text-2xl font-black text-[var(--soft-black)] mt-2">
                      $49 AUD{" "}
                      <span class="text-xs font-bold text-[var(--color-text-secondary)]">
                        / {i18n.supporterTerm}
                      </span>
                    </h3>
                  </div>
                  <div class="text-3xl">✨</div>
                </div>

                <ul class="mt-4 space-y-2 text-xs sm:text-sm font-medium text-[var(--color-text)]">
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>Unlimited Audio Takes</strong>{" "}
                    (no daily recording cap)
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>Live Collab Rooms</strong>{" "}
                    (PartyKit multiplayer + WebRTC voice relay)
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>All 8 Export Decks</strong>{" "}
                    (Plan, Research, Haiku, Unasked, Custom)
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>Ask Panel Deep Queries</strong>{" "}
                    (unlimited conversational Q&A)
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>Permanent Cloud Share Links</strong>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={handleStartCheckout}
                  disabled={isStartingCheckout}
                  class="w-full mt-5 py-3.5 px-6 bg-[var(--cta-plate)] hover:bg-[var(--cta-plate-hover)] text-[var(--soft-black)] font-black text-base border-3 border-[var(--line-ink)] rounded-xl shadow-[4px_4px_0px_var(--line-ink)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50"
                >
                  {isStartingCheckout
                    ? i18n.ctaSquareBusy
                    : isSupporter
                    ? `Extend Supporter Pass ($49 AUD)`
                    : i18n.ctaSquare}
                </button>
                <p class="text-[11px] text-center text-[var(--color-text-secondary)] mt-2 font-bold">
                  Card payment via Square · Zero subscriptions · No auto-renew
                </p>
              </div>

              {/* Restore / Redeem Section */}
              <div class="p-4 bg-[var(--surface-card)] border-3 border-[var(--line-ink)] rounded-xl shadow-[3px_3px_0px_var(--line-ink)] space-y-3">
                <div class="font-bold text-xs text-[var(--soft-black)]">
                  {i18n.haveCode}
                </div>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={pastedCode}
                    onInput={(e) =>
                      setPastedCode((e.target as HTMLInputElement).value)}
                    placeholder="Paste pass token or master code"
                    class="flex-1 px-3 py-2 text-xs font-mono bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemCode}
                    disabled={isRedeeming || !pastedCode.trim()}
                    class="px-4 py-2 bg-[var(--soft-black)] text-[var(--surface-white-warm)] text-xs font-black rounded-lg border-2 border-[var(--line-ink)] hover:bg-[var(--soft-black)] disabled:opacity-50"
                  >
                    {isRedeeming ? "..." : i18n.redeemBtn}
                  </button>
                </div>
                {redeemStatus && (
                  <p class="text-xs font-bold text-[var(--accent-ink)]">
                    {redeemStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "byok" && (
            <div class="space-y-4">
              <div class="p-4 bg-[var(--surface-cream-hover)] border-3 border-[var(--line-ink)] rounded-xl shadow-[3px_3px_0px_var(--line-ink)]">
                <h4 class="font-black text-sm text-[var(--soft-black)]">
                  Bring Your Own OpenRouter Key
                </h4>
                <p class="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  If you already have an OpenRouter or Gemini key, plug it here.
                  ProMapper will route all transcription and analysis calls
                  directly through your key.
                </p>
              </div>

              <div class="space-y-2">
                <label class="block text-xs font-bold text-[var(--soft-black)]">
                  OpenRouter API Key:
                </label>
                <input
                  type="password"
                  value={byoInput}
                  onInput={(e) =>
                    setByoInput((e.target as HTMLInputElement).value)}
                  placeholder="sk-or-v1-..."
                  class="w-full px-3 py-2 text-xs font-mono bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div class="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveByoKey}
                  disabled={isTestingByo}
                  class="flex-1 py-2.5 px-4 bg-[var(--soft-black)] hover:bg-[var(--soft-black)] text-[var(--surface-white-warm)] font-black text-xs rounded-xl border-2 border-[var(--line-ink)] shadow-[3px_3px_0px_var(--line-ink)] disabled:opacity-50"
                >
                  {isTestingByo ? "Verifying..." : "Save Key"}
                </button>
                {activeByoKey && (
                  <button
                    type="button"
                    onClick={() => {
                      removeByoKey();
                      setByoInput("");
                      setByoTestStatus("Key removed.");
                    }}
                    class="py-2.5 px-4 bg-[var(--surface-white-warm)] hover:bg-[var(--surface-cream-hover)] text-[var(--color-text-secondary)] font-black text-xs rounded-xl border-2 border-[var(--line-ink)] shadow-[3px_3px_0px_var(--line-ink)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {byoTestStatus && (
                <p class="text-xs font-bold text-[var(--accent-ink)]">
                  {byoTestStatus}
                </p>
              )}

              <div class="text-[11px] text-[var(--color-text-secondary)] space-y-1 pt-2">
                <p>
                  🔒 <strong>Privacy:</strong>{" "}
                  Your key stays in your browser cookie (`pm_byok`). It is never
                  stored in any database or logged on our servers.
                </p>
              </div>
            </div>
          )}

          {tab === "faq" && (
            <div class="space-y-3 text-xs text-[var(--color-text)]">
              <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                <strong class="text-[var(--soft-black)] block mb-1">
                  Is this a recurring subscription?
                </strong>
                No. It is a single $49 AUD flat payment for 365 days. No cards
                stored, no surprises.
              </div>
              <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                <strong class="text-[var(--soft-black)] block mb-1">
                  Paying from outside Australia?
                </strong>
                Fine — the price is in Australian dollars, which lands lower
                than it reads almost everywhere else. Card issuers handle the
                conversion at their own rate.
              </div>
              <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                <strong class="text-[var(--soft-black)] block mb-1">
                  How do I use it on another laptop/phone?
                </strong>
                Copy your pass token (under the Supporter tab) and paste it into
                the "Already have a pass?" box on your other devices.
              </div>
              <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                <strong class="text-[var(--soft-black)] block mb-1">
                  What is the Free Tier limit?
                </strong>
                Free tier gives you 10 minutes of audio processing per day and 3
                saved maps with full AI intelligence. The Supporter Pass unlocks
                infinite audio and multiplayer live rooms.
              </div>
              <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                <strong class="text-[var(--soft-black)] block mb-1">
                  Refund policy?
                </strong>
                30 days, no questions asked. Email hello@promapper.app.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
