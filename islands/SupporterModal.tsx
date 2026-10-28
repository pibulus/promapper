// Supporter & Pricing Modal Island for ProMapper.
// Handles Square checkout redirect, return poller, code redemption, and BYO API Key setup.

import { useEffect, useState } from "preact/hooks";
import {
  activatePass,
  byokKeySignal,
  closeSupporterModal,
  confirmStoredPass,
  isSupporterSignal,
  localWhisperModelSignal,
  localWhisperSignal,
  refreshSupporterState,
  removeByoKey,
  saveByoKey,
  selectLocalWhisperModel,
  supporterExpirySignal,
  supporterModalOpen,
  supporterTierSignal,
  toggleLocalWhisper,
} from "@signals/supporterStore.ts";
import {
  preloadOfflineWhisper,
  WHISPER_MODEL_OPTIONS,
  type WhisperModelTier,
} from "../utils/offlineWhisper.ts";
import {
  clearPendingCheckout,
  getPendingCheckout,
  setPendingCheckout,
} from "../utils/supporter-pass.ts";
import { isSpanish, t } from "../utils/i18n.ts";

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
  const activeTier = supporterTierSignal.value;
  const expiry = supporterExpirySignal.value;
  const activeByoKey = byokKeySignal.value;
  const localWhisperEnabled = localWhisperSignal.value;
  const selectedWhisperModel = localWhisperModelSignal.value;
  const spanish = isSpanish();

  const [tab, setTab] = useState<"pass" | "byok" | "faq">("pass");
  const [selectedPlan, setSelectedPlan] = useState<"solo" | "guild">("solo");
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [pastedCode, setPastedCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [whisperPreloading, setWhisperPreloading] = useState<
    WhisperModelTier | null
  >(null);
  const [whisperProgress, setWhisperProgress] = useState<number | null>(null);
  const [whisperReadyTier, setWhisperReadyTier] = useState<
    WhisperModelTier | null
  >(null);

  // BYOK state
  const [byoInput, setByoInput] = useState(activeByoKey || "");
  const [byoTestStatus, setByoTestStatus] = useState<string | null>(null);
  const [isTestingByo, setIsTestingByo] = useState(false);

  useEffect(() => {
    void confirmStoredPass();
  }, []);

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
    // Square only sends people back to ?checkout= after they've paid, so a
    // poll that times out THEN means the webhook is late, not that the money
    // isn't there. This used to clear the pending checkout after ~37s either
    // way — a slow webhook meant money taken and no pass, with no email to
    // fall back on. Now it's kept and asked about once per later visit until
    // it pays out or the server forgets it (404).
    const maxAttempts = fromUrl ? 15 : 1;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/supporter/checkout/${checkoutId}`);
        if (res.status === 404) {
          clearPendingCheckout();
          if (fromUrl) stripCheckoutParam();
          return;
        }
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

      if (attempts < maxAttempts) {
        setTimeout(poll, 2500);
      } else if (fromUrl) {
        setPendingCheckout(fromUrl);
        stripCheckoutParam();
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [isSupporter]);

  if (!isOpen) return null;

  async function handleStartCheckout(plan: "solo" | "guild" = selectedPlan) {
    setIsStartingCheckout(true);
    setRedeemStatus(null);
    try {
      const res = await fetch("/api/supporter/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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

  async function handleSelectWhisperModel(tier: WhisperModelTier) {
    selectLocalWhisperModel(tier);
    if (!localWhisperEnabled) {
      toggleLocalWhisper(true);
    }
    setWhisperPreloading(tier);
    setWhisperProgress(0);
    try {
      await preloadOfflineWhisper(tier, (pct) => {
        setWhisperProgress(pct);
      });
      setWhisperReadyTier(tier);
    } catch {
      // Model will lazy-load on next recording take if offline or blocked
    } finally {
      setWhisperPreloading(null);
      setWhisperProgress(null);
    }
  }

  return (
    <div
      class="fixed inset-0 flex items-center justify-center z-50 p-2.5 sm:p-4"
      style={{
        background: "rgba(24, 20, 17, 0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSupporterModal();
      }}
    >
      <div
        class="w-full max-w-xl bg-[var(--surface-card)] border-4 border-[var(--line-ink)] rounded-2xl shadow-[6px_6px_0px_var(--line-ink)] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div class="px-4 py-3.5 sm:px-6 sm:py-4 bg-gradient-to-r from-[var(--accent-rose-wash)] via-[var(--accent-rose-wash-soft)] to-[var(--surface-card)] border-b-3 border-[var(--line-ink)] flex items-center justify-between">
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
            class="w-11 h-11 rounded-lg border-2 border-[var(--line-ink)] bg-[var(--surface-white-warm)] text-[var(--soft-black)] font-black text-sm hover:bg-[var(--accent-strong)] hover:text-[var(--surface-white-warm)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center shadow-[2px_2px_0px_var(--line-ink)] cursor-pointer"
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
            class={`flex-1 min-h-[44px] py-2.5 text-xs sm:text-sm font-black border-r-2 border-[var(--line-ink)] transition-colors cursor-pointer ${
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
            class={`flex-1 min-h-[44px] py-2.5 text-xs sm:text-sm font-black border-r-2 border-[var(--line-ink)] transition-colors cursor-pointer ${
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
            class={`min-h-[44px] py-2.5 px-4 text-xs sm:text-sm font-black transition-colors cursor-pointer ${
              tab === "faq"
                ? "bg-[var(--surface-card)] text-[var(--soft-black)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--surface-cream-hover)]"
            }`}
          >
            {i18n.tabFaq}
          </button>
        </div>

        {/* Modal Body */}
        <div class="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
          {tab === "pass" && (
            <div class="space-y-5 sm:space-y-6">
              {/* Active Pass Banner */}
              {isSupporter && (
                <div class="p-4 bg-[var(--accent-rose-wash-soft)] border-3 border-[var(--line-ink)] rounded-xl shadow-[3px_3px_0px_var(--line-ink)] flex items-center justify-between gap-3">
                  <div>
                    <div class="font-black text-sm text-[var(--accent-ink)]">
                      {activeTier === "guild"
                        ? (spanish
                          ? "✓ Pase de Gremio y Laboratorio Activo"
                          : "✓ Guild, Lab & Practice Pass Active")
                        : i18n.activePassBanner}
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
                    class="min-h-[44px] px-3.5 py-2 bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg text-xs font-bold shadow-[2px_2px_0px_var(--line-ink)] hover:bg-[var(--surface-cream-hover)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                  >
                    {i18n.copyToken}
                  </button>
                </div>
              )}

              {/* Tier Selector: $49 Solo Pass vs $99 Guild, Lab & Practice Pass */}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlan("solo")}
                  class={`min-h-[44px] p-3.5 rounded-xl border-3 border-[var(--line-ink)] text-left transition-all cursor-pointer ${
                    selectedPlan === "solo"
                      ? "bg-[var(--accent-rose-wash-soft)] shadow-[3px_3px_0px_var(--line-ink)] -translate-y-0.5"
                      : "bg-[var(--surface-white-warm)] opacity-80 hover:opacity-100"
                  }`}
                >
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-mono font-black uppercase tracking-wider text-[var(--soft-black)]">
                      {spanish ? "Individual · 1 Año" : "Solo Pass · 1 Yr"}
                    </span>
                    <span class="text-sm">✨</span>
                  </div>
                  <div class="text-lg font-black text-[var(--soft-black)] mt-0.5">
                    $49 AUD
                  </div>
                  <div class="text-[11px] text-[var(--color-text-secondary)] font-bold">
                    {spanish
                      ? "1 persona · 60m/día nube + Whisper local"
                      : "1 seat · 60m/day cloud + local Whisper"}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan("guild")}
                  class={`min-h-[44px] p-3.5 rounded-xl border-3 border-[var(--line-ink)] text-left transition-all cursor-pointer ${
                    selectedPlan === "guild"
                      ? "bg-[var(--accent-rose-wash-soft)] shadow-[3px_3px_0px_var(--line-ink)] -translate-y-0.5"
                      : "bg-[var(--surface-white-warm)] opacity-80 hover:opacity-100"
                  }`}
                >
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-mono font-black uppercase tracking-wider text-[var(--soft-black)]">
                      {spanish
                        ? "Gremio / Lab · 5 Lugares"
                        : "Guild & Lab · 5 Seats"}
                    </span>
                    <span class="text-sm">🏰</span>
                  </div>
                  <div class="text-lg font-black text-[var(--soft-black)] mt-0.5">
                    $99 AUD
                  </div>
                  <div class="text-[11px] text-[var(--color-text-secondary)] font-bold">
                    {spanish
                      ? "Maratones 4h · D&D, labs y prácticas"
                      : "4h marathons · D&D, labs & practices"}
                  </div>
                </button>
              </div>

              {/* Price & Pitch */}
              <div class="p-5 bg-gradient-to-br from-[var(--accent-rose-wash-soft)] to-[var(--surface-card)] border-3 border-[var(--line-ink)] rounded-xl shadow-[4px_4px_0px_var(--line-ink)] relative">
                <div class="flex justify-between items-start">
                  <div>
                    <span class="text-xs font-black uppercase tracking-wider bg-[var(--accent-strong)] text-[var(--surface-white-warm)] px-2.5 py-0.5 rounded-md border-2 border-[var(--line-ink)]">
                      {selectedPlan === "guild"
                        ? (spanish
                          ? "Pase Grupal · Hasta 5 Lugares"
                          : "Guild, Lab & Practice · Up to 5 Seats")
                        : i18n.pass1Year}
                    </span>
                    <h3 class="text-2xl font-black text-[var(--soft-black)] mt-2">
                      {selectedPlan === "guild" ? "$99 AUD" : "$49 AUD"}{" "}
                      <span class="text-xs font-bold text-[var(--color-text-secondary)]">
                        / {i18n.supporterTerm}
                      </span>
                    </h3>
                  </div>
                  <div class="text-3xl">
                    {selectedPlan === "guild" ? "🏰" : "✨"}
                  </div>
                </div>

                <ul class="mt-4 space-y-2 text-xs sm:text-sm font-medium text-[var(--color-text)]">
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>
                      {selectedPlan === "guild"
                        ? (spanish
                          ? "Sesiones Maratónicas de 4 Horas"
                          : "4-Hour Marathon Sessions")
                        : i18n.featTakes}
                    </strong>{" "}
                    {selectedPlan === "guild"
                      ? (spanish
                        ? "(auto-guardado cada 15 min + 5 lugares)"
                        : "(rolling 15-min auto-appends + up to 5 seats)")
                      : i18n.featTakesDesc}
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>
                      {spanish
                        ? "Nube Rápida + Whisper Local Ilimitado"
                        : "High-Speed Cloud + Unlimited On-Device Whisper"}
                    </strong>
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>{i18n.featRooms}</strong> {i18n.featRoomsDesc}
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>{i18n.featDecks}</strong> {spanish
                      ? "(PDF, Presentación Slide-O-Matic y 8 formatos)"
                      : "(1-Click PDF, Slide-O-Matic Deck & 8 formats)"}
                  </li>
                  <li class="flex items-center gap-2">
                    <span class="text-[var(--accent-ink)] font-black">✓</span>
                    <strong>{i18n.featShare}</strong>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => handleStartCheckout(selectedPlan)}
                  disabled={isStartingCheckout}
                  class="w-full mt-5 py-3.5 px-6 bg-[var(--cta-plate)] hover:bg-[var(--cta-plate-hover)] text-[var(--soft-black)] font-black text-base border-3 border-[var(--line-ink)] rounded-xl shadow-[4px_4px_0px_var(--line-ink)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isStartingCheckout
                    ? i18n.ctaSquareBusy
                    : isSupporter
                    ? i18n.extendPass(
                      selectedPlan === "guild" ? "$99 AUD" : "$49 AUD",
                    )
                    : selectedPlan === "guild"
                    ? (spanish
                      ? "Desbloquear Pase de Gremio y Lab — $99 AUD"
                      : "Unlock Guild, Lab & Practice Pass — $99 AUD")
                    : i18n.ctaSquare}
                </button>
                <p class="text-[11px] text-center text-[var(--color-text-secondary)] mt-2 font-bold">
                  {i18n.squareNotice}
                </p>
              </div>

              {/* On-Device Whisper (Local Audio Privacy Mode) + Model Size Selector */}
              <div class="p-4 bg-[var(--surface-card)] border-3 border-[var(--line-ink)] rounded-xl shadow-[3px_3px_0px_var(--line-ink)] space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="font-black text-xs text-[var(--soft-black)] flex items-center gap-1.5">
                      <span>🔒</span>
                      <span>
                        {spanish
                          ? "Modo de Audio Local (On-Device Whisper)"
                          : "On-Device Whisper (Strict Local Audio Mode)"}
                      </span>
                    </div>
                    <p class="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                      {spanish
                        ? "Transcribe dentro del navegador (WebAssembly / WebGPU). El audio crudo no sube a servidores de transcripción."
                        : "Transcribes speech locally inside the browser (WebAssembly / WebGPU). Raw voice audio never uploads to cloud transcription servers."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLocalWhisper()}
                    class={`min-h-[44px] px-3.5 py-2 rounded-xl border-2 border-[var(--line-ink)] text-xs font-mono font-black shadow-[2px_2px_0px_var(--line-ink)] transition-all cursor-pointer shrink-0 ${
                      localWhisperEnabled
                        ? "bg-[var(--cta-plate)] text-[var(--soft-black)]"
                        : "bg-[var(--surface-white-warm)] text-[var(--color-text-secondary)]"
                    }`}
                    aria-pressed={localWhisperEnabled}
                  >
                    {localWhisperEnabled
                      ? (spanish ? "ACTIVO" : "ON")
                      : (spanish ? "APAGADO" : "OFF")}
                  </button>
                </div>

                {/* TalkType-style Model Tier Picker (Tiny ~75MB / Base ~140MB / Small HD Studio ~250MB) */}
                <div class="pt-2 border-t-2 border-[var(--line-ink)]/10 space-y-2">
                  <div class="flex items-center justify-between text-[11px] font-mono font-bold text-[var(--color-text-secondary)]">
                    <span>
                      {spanish
                        ? "Tamaño del modelo Whisper (guardado en caché del navegador):"
                        : "Whisper model size (cached in browser after first download):"}
                    </span>
                    {whisperPreloading && (
                      <span class="text-[var(--accent-ink)] font-black">
                        {spanish ? "Cargando" : "Loading"}{" "}
                        {whisperProgress !== null ? `${whisperProgress}%` : "…"}
                      </span>
                    )}
                    {!whisperPreloading && whisperReadyTier && (
                      <span class="text-[var(--accent-ink)] font-black">
                        ✓ {spanish ? "Listo en caché" : "Cached & ready"}
                      </span>
                    )}
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {WHISPER_MODEL_OPTIONS.map((opt) => {
                      const active = selectedWhisperModel === opt.tier;
                      return (
                        <button
                          key={opt.tier}
                          type="button"
                          onClick={() => handleSelectWhisperModel(opt.tier)}
                          class={`min-h-[44px] p-2.5 rounded-xl border-2 border-[var(--line-ink)] text-left transition-all cursor-pointer ${
                            active
                              ? "bg-[var(--accent-rose-wash-soft)] shadow-[2px_2px_0px_var(--line-ink)] -translate-y-0.5"
                              : "bg-[var(--surface-white-warm)] opacity-85 hover:opacity-100"
                          }`}
                          aria-pressed={active}
                        >
                          <div class="flex items-center justify-between gap-1">
                            <span class="text-[11px] font-mono font-black text-[var(--soft-black)]">
                              {spanish ? opt.badgeEs : opt.badgeEn}
                            </span>
                            <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--line-ink)]/30 text-[var(--soft-black)]">
                              {opt.sizeLabel}
                            </span>
                          </div>
                          <p class="text-[10px] text-[var(--color-text-secondary)] mt-1 leading-snug">
                            {spanish ? opt.descEs : opt.descEn}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                    placeholder={i18n.codePlaceholder}
                    class="flex-1 min-h-[44px] px-3 py-2 text-base sm:text-xs font-mono bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemCode}
                    disabled={isRedeeming || !pastedCode.trim()}
                    class="min-h-[44px] px-4 py-2 bg-[var(--soft-black)] text-[var(--surface-white-warm)] text-xs font-black rounded-lg border-2 border-[var(--line-ink)] hover:bg-[var(--accent-strong)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50"
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
                  {i18n.byokTitle}
                </h4>
                <p class="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  {i18n.byokDesc}
                </p>
              </div>

              <div class="space-y-2">
                <label class="block text-xs font-bold text-[var(--soft-black)]">
                  {i18n.byokLabel}
                </label>
                <input
                  type="password"
                  value={byoInput}
                  onInput={(e) =>
                    setByoInput((e.target as HTMLInputElement).value)}
                  placeholder="sk-or-v1-..."
                  class="w-full min-h-[44px] px-3 py-2 text-base sm:text-xs font-mono bg-[var(--surface-white-warm)] border-2 border-[var(--line-ink)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div class="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveByoKey}
                  disabled={isTestingByo}
                  class="flex-1 min-h-[44px] py-2.5 px-4 bg-[var(--soft-black)] hover:bg-[var(--accent-strong)] text-[var(--surface-white-warm)] font-black text-xs rounded-xl border-2 border-[var(--line-ink)] shadow-[3px_3px_0px_var(--line-ink)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTestingByo ? i18n.byokVerifying : i18n.byokSave}
                </button>
                {activeByoKey && (
                  <button
                    type="button"
                    onClick={() => {
                      removeByoKey();
                      setByoInput("");
                      setByoTestStatus(i18n.byokRemoved);
                    }}
                    class="min-h-[44px] py-2.5 px-4 bg-[var(--surface-white-warm)] hover:bg-[var(--surface-cream-hover)] text-[var(--color-text-secondary)] font-black text-xs rounded-xl border-2 border-[var(--line-ink)] shadow-[3px_3px_0px_var(--line-ink)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                  >
                    {i18n.byokClear}
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
                  🔒 <strong>Privacy:</strong> {i18n.byokPrivacy}
                </p>
              </div>
            </div>
          )}

          {tab === "faq" && (
            <div class="space-y-3 text-xs text-[var(--color-text)]">
              {isSpanish()
                ? (
                  <>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        ¿Es una suscripción recurrente?
                      </strong>
                      No. Es un pago único de $49 AUD por 365 días. Cero
                      tarjetas guardadas, cero cobros automáticos.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        ¿Pago desde fuera de Australia?
                      </strong>
                      Sin problema: el precio está en dólares australianos
                      (AUD), que suele quedar más accesible al convertir. El
                      banco aplica el tipo de cambio del día.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        ¿Cómo funciona en otro celular o computadora?
                      </strong>
                      El botón Copiar Pase (en la pestaña Pase) entrega el token
                      para pegarlo en el recuadro de desbloqueo de cualquier
                      otro dispositivo.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        ¿Qué incluye la mesa gratuita?
                      </strong>
                      Mapas locales ilimitados en el navegador, tomas de audio
                      diarias, los 8 formatos de exportación y conexión gratuita
                      para llave propia (BYOK). El Pase de Soporte amplía el
                      margen diario de audio y abre salas colaborativas en vivo.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        ¿Política de reembolso?
                      </strong>
                      30 días sin preguntas ni trabas en hello@promapper.app.
                    </div>
                  </>
                )
                : (
                  <>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        Is this a recurring subscription?
                      </strong>
                      No. It is a single $49 AUD flat payment for 365 days. No
                      cards stored, no auto-renewals.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        Paying from outside Australia?
                      </strong>
                      Fine — the price is in Australian dollars, which lands
                      lower than it reads almost everywhere else. Card issuers
                      handle the conversion at their own rate.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        How does a pass move to another laptop or phone?
                      </strong>
                      Copy the pass token under the Supporter tab and paste it
                      into the redeem box on any other browser or device.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        What is included on the free table?
                      </strong>
                      Unlimited local maps in the browser, daily audio takes,
                      all 8 Markdown export decks, and free BYOK key routing.
                      The Supporter Pass expands daily audio allowances and
                      unlocks full collaborative live rooms.
                    </div>
                    <div class="p-3 bg-[var(--surface-card)] border-2 border-[var(--line-ink)] rounded-lg">
                      <strong class="text-[var(--soft-black)] block mb-1">
                        Refund policy?
                      </strong>
                      30 days, no questions asked via hello@promapper.app.
                    </div>
                  </>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
