import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import { showToast } from "@utils/toast.ts";
import {
  DEMO_DUSTY,
  DEMO_EVIL_WIZARD,
  DEMO_SAILOR_MOON,
  DEMO_T2,
} from "../utils/demoPresets.ts";

import {
  VERTICAL_CONFIG,
  type VerticalCompareRow,
  type VerticalCopy,
  type VerticalFaqItem,
  type VerticalKind,
  type VerticalPillar,
} from "../utils/verticalConfig.ts";

export {
  VERTICAL_CONFIG,
  type VerticalCompareRow,
  type VerticalCopy,
  type VerticalFaqItem,
  type VerticalKind,
  type VerticalPillar,
};

export interface VerticalStudioProps {
  kind: VerticalKind;
  lang?: "en" | "es";
}

export default function VerticalStudioIsland(
  { kind, lang = "en" }: VerticalStudioProps,
) {
  const isSeeding = useSignal(false);
  const isSpanish = lang === "es";
  const copy = VERTICAL_CONFIG[kind][lang];

  function handleLoadDemo() {
    isSeeding.value = true;
    const demo = kind === "meetings" || kind === "clients"
      ? DEMO_T2
      : kind === "research" || kind === "care"
      ? DEMO_DUSTY
      : kind === "schools"
      ? DEMO_SAILOR_MOON
      : DEMO_EVIL_WIZARD;

    if (saveConversation(demo)) {
      globalThis.location.href = `${
        isSpanish ? "/es" : "/"
      }?open=${demo.conversation.id}`;
    } else {
      isSeeding.value = false;
      showToast(
        isSpanish
          ? "Almacenamiento local lleno. Limpia tableros antiguos e intenta de nuevo."
          : "Browser storage is full. Clear older boards and try again.",
        "warning",
      );
    }
  }

  return (
    <div class="min-h-screen bg-[#fffef7] text-[#1e1714] font-sans px-3 sm:px-4 py-6 sm:py-12 max-w-5xl mx-auto space-y-10 sm:space-y-12">
      {/* Navigation Breadcrumb */}
      <nav class="flex items-center justify-between border-b-2 border-[#1e1714]/15 pb-4">
        <a
          href={isSpanish ? "/es" : "/"}
          class="inline-flex items-center min-h-[44px] gap-1.5 px-3.5 py-2 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-xl text-xs font-mono font-bold shadow-[2px_2px_0px_#1e1714] hover:-translate-y-0.5 transition-transform"
        >
          {isSpanish ? "← Volver a ProMapper" : "← Back to ProMapper"}
        </a>
        <div class="flex items-center gap-2">
          <a
            href={isSpanish ? copy.enPath : copy.esPath}
            hrefLang={isSpanish ? "en" : "es"}
            class="inline-flex items-center min-h-[44px] gap-1 px-3.5 py-2 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-xl text-xs font-mono font-bold shadow-[2px_2px_0px_#1e1714] hover:-translate-y-0.5 transition-transform"
            aria-label={isSpanish ? "Switch to English" : "Cambiar a Español"}
          >
            {isSpanish ? "🇬🇧 English" : "🇲🇽 Español"}
          </a>
          <span class="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-[#1e1714] text-[#fffef7] rounded-full text-xs font-mono font-bold tracking-wide uppercase">
            {copy.navBadge}
          </span>
        </div>
      </nav>

      {/* Hero Section */}
      <header class="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div class="inline-block px-3.5 py-1.5 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-full text-xs font-mono font-bold text-[#1e1714] shadow-[2px_2px_0px_#1e1714]">
          {copy.kicker}
        </div>
        <h1 class="text-3xl sm:text-5xl font-black tracking-tight text-[#1e1714] leading-tight">
          {copy.h1}
        </h1>
        <p class="text-base sm:text-xl font-medium text-[#1e1714]/80 leading-relaxed">
          {copy.subtitle}
        </p>

        {/* CTA Banner */}
        <div class="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={isSeeding.value}
            class="w-full sm:w-auto min-h-[44px] px-6 py-3.5 bg-[var(--spot-riso-pink,#ff6ac2)] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[5px_5px_0px_#1e1714] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{isSeeding.value ? "⏳" : "🗺️"}</span>
            <span>{isSeeding.value ? copy.ctaDemoBusy : copy.ctaDemo}</span>
          </button>
          <a
            href={isSpanish ? "/es" : "/"}
            class="w-full sm:w-auto min-h-[44px] px-6 py-3.5 bg-[#fbf1e4] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#1e1714] active:translate-y-0 transition-all flex items-center justify-center gap-2"
          >
            <span>🎙️</span>
            <span>{copy.ctaStart}</span>
          </a>
        </div>
      </header>

      {/* Value Pillars Grid */}
      <section class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 pt-4 sm:pt-6">
        {copy.pillars.map((pillar) => (
          <div
            key={pillar.title}
            class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#1e1714] space-y-2.5 sm:space-y-3"
          >
            <div class="text-3xl">{pillar.emoji}</div>
            <h2 class="text-lg font-black text-[#1e1714]">{pillar.title}</h2>
            <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
              {pillar.body}
            </p>
          </div>
        ))}
      </section>

      {/* Export Showcase */}
      <section class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-4 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#1e1714]/15 pb-3">
          <div>
            <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider mb-1">
              {copy.exportBadge}
            </span>
            <h2 class="text-xl sm:text-2xl font-black text-[#1e1714]">
              {copy.exportTitle}
            </h2>
          </div>
          <span class="text-xs font-mono font-bold text-[#1e1714]/70">
            {copy.exportSubtitle}
          </span>
        </div>
        <p class="text-xs sm:text-sm text-[#1e1714]/80">{copy.exportIntro}</p>
        <pre class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 text-xs font-mono text-[#1e1714] overflow-x-auto whitespace-pre-wrap break-words leading-relaxed shadow-[2px_2px_0px_#1e1714]">
          {copy.exportSample}
        </pre>
      </section>

      {/* Multiplayer Live Room + Excalidraw Sketchboard + Export to Anything Strip */}
      <section class="grid sm:grid-cols-3 gap-5">
        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Cajón de exportación" : "Export to Anything"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            🖨️ {isSpanish
              ? "PDF impreso, diapositivas y 8 formatos"
              : "1-Click PDF, Slide Deck & 8 Presets"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Genera un PDF con diseño editorial, una presentación HTML de 6 a 9 diapositivas (Slide-O-Matic), Plan, Preguntas No Hechas o un prompt a la medida."
              : "Generate a styled printable PDF, a 6–9 slide presentation deck (Slide-O-Matic), Project Plan, Unasked Questions, Done Report, or Custom Prompt deliverable."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Colaboración en vivo" : "Multiplayer Live Room"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            🎨 {isSpanish
              ? "Sala con voz y pizarrón Excalidraw"
              : "Live Voice Room & Sketchboard"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Abre una sala en vivo para editar nodos y acuerdos en equipo, hablar por voz integrada y voltear el mapa al pizarrón Excalidraw compartido."
              : "Open a live room link where collaborators edit nodes and action items together, talk over built-in WebRTC voice, and flip the map to a shared Excalidraw canvas."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Maratón + Privacidad" : "Marathon + Local Audio"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            🔒 {isSpanish
              ? "Auto-guardado 15 min y Whisper local"
              : "Rolling 15-Min Takes & Local Whisper"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Las sesiones largas se suman cada 15 minutos sin cortar el micrófono, con opción de transcripción Whisper en el dispositivo para máxima privacidad."
              : "Long sessions slice and append every 15 minutes without closing the mic, with optional On-Device Whisper transcription so raw audio stays inside the browser."}
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-4 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-xl sm:text-3xl font-black text-[#1e1714]">
            {copy.compareTitle}
          </h2>
          <p class="text-xs sm:text-sm text-[#1e1714]/70">
            {copy.compareSubtitle}
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[520px] text-xs sm:text-sm border-collapse">
            <thead>
              <tr class="border-b-2 border-[#1e1714] bg-[#fffef7]">
                <th class="text-left p-3 font-black text-[#1e1714]">
                  {isSpanish ? "Detalle" : "Feature"}
                </th>
                <th class="text-left p-3 font-black text-[#1e1714]/70">
                  {copy.compareOtherHeader}
                </th>
                <th class="text-left p-3 font-black text-[#1e1714] bg-[#fbf1e4]">
                  {copy.compareOurHeader}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#1e1714]/15">
              {copy.compareRows.map((row) => (
                <tr key={row.feature}>
                  <td class="p-3 font-bold">{row.feature}</td>
                  <td class="p-3 text-[#1e1714]/75">{row.traditional}</td>
                  <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                    {row.promapper}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Visible FAQ Section (100% parity with FAQPage JSON-LD) */}
      <section
        aria-labelledby="vertical-faq-heading"
        class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-4 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-5 sm:space-y-6"
      >
        <h2
          id="vertical-faq-heading"
          class="text-xl sm:text-2xl font-black text-[#1e1714]"
        >
          {copy.faqTitle}
        </h2>
        <div class="grid sm:grid-cols-3 gap-4">
          {copy.faqs.map((faq) => (
            <article
              key={faq.question}
              class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 shadow-[2px_2px_0px_#1e1714] space-y-2"
            >
              <h3 class="text-sm font-black text-[#1e1714]">{faq.question}</h3>
              <p class="text-xs text-[#1e1714]/80 leading-relaxed">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Sibling Workshop Tables Cross-Links */}
      <nav
        aria-label={isSpanish
          ? "Otras mesas de trabajo en ProMapper"
          : "Other ProMapper workshop tables"}
        class="bg-[#fbf1e4] border-2 border-[#1e1714] rounded-2xl p-4 shadow-[2px_2px_0px_#1e1714] flex flex-wrap items-center justify-center gap-3 text-xs font-mono font-bold"
      >
        <span class="uppercase tracking-wider text-[#1e1714]/60">
          {isSpanish ? "Otras mesas:" : "More tables:"}
        </span>
        {kind !== "meetings" && (
          <a
            href={isSpanish ? "/es/juntas" : "/for/meetings"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            📋 {isSpanish ? "Juntas y acuerdos" : "Weekly Meetings"}
          </a>
        )}
        {kind !== "clients" && (
          <a
            href={isSpanish ? "/es/clientes" : "/for/clients"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            🤝 {isSpanish ? "Clientes y asesorías" : "Client Sessions"}
          </a>
        )}
        {kind !== "care" && (
          <a
            href={isSpanish ? "/es/consultas" : "/for/care"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            🩺 {isSpanish ? "Consultas médicas" : "Doctor & Care Visits"}
          </a>
        )}
        {kind !== "schools" && (
          <a
            href={isSpanish ? "/es/escuelas" : "/for/schools"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            🍎{" "}
            {isSpanish ? "Escuelas y laboratorios" : "Schools & Research Labs"}
          </a>
        )}
        {kind !== "research" && (
          <a
            href={isSpanish ? "/es/investigacion" : "/for/research"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            🔍{" "}
            {isSpanish
              ? "Investigación y entrevistas"
              : "Research & Interviews"}
          </a>
        )}
        {kind !== "brainstorming" && (
          <a
            href={isSpanish ? "/es/ideas" : "/for/brainstorming"}
            class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
          >
            🎙️ {isSpanish ? "Notas de voz e ideas" : "Voice Notes & Ideas"}
          </a>
        )}
        <a
          href={isSpanish ? "/es/rol" : "/for/dnd"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🎲 {isSpanish ? "Partidas de rol y D&D" : "Tabletop & D&D"}
        </a>
      </nav>

      {/* Footer & CTA */}
      <footer class="text-center pt-8 border-t-2 border-[#1e1714]/15 space-y-4">
        <button
          type="button"
          onClick={handleLoadDemo}
          class="w-full sm:w-auto min-h-[44px] px-8 py-4 bg-[var(--spot-riso-pink,#ff6ac2)] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base sm:text-lg shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#1e1714] active:translate-y-0 transition-all cursor-pointer"
        >
          {copy.footerCta}
        </button>
        <p class="text-xs font-mono text-[#1e1714]/60">{copy.footerNote}</p>
      </footer>
    </div>
  );
}
