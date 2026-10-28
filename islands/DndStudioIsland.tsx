import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import type { ConversationData } from "@core/types/conversation-data.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";
import { showToast } from "@utils/toast.ts";

const DND_CID = "campaign-sunken-crypt";
const DND_NOW = "2026-09-11T06:00:00.000Z";

const DND_TRANSCRIPT =
  `GM: You kick open the ironwood door of the Black Raven Tavern. Rain is pouring down outside.
Valen (Rogue): I check the corners. Is Madame Vesper at her usual table near the hearth?
GM: She's there, but she's not alone. A hooded dwarf in silver chainmail is sliding a glowing runic tablet across the table.
Kaela (Wizard): That rune... I cast detect magic. Is it evocation or abjuration?
GM: It's ancient abjuration. It pulses with a faint azure glow, matching the seal on Morzan's sunken crypt in the marshlands.
Valen: We need that tablet before the Crimson Hand cultists find out.
Thorin (Paladin): I step forward and slam my warhammer onto the bench. 'Madame Vesper. We had an agreement.'
GM: Vesper smirks and tucks the tablet under her velvet cloak. 'The bounty on the Crypt just doubled, Paladin. The Cult of the Serpent offered 500 gold for the Morzan Seal.'
Kaela: I offer 600 gold from our dragon hoard split. And we deal with the cultists for you.
GM: Vesper raises an eyebrow. 'Deal. But you head into the marsh before dawn, or the deal is off.'`;

const DND_DEMO: ConversationData = {
  conversation: {
    id: DND_CID,
    title: "The Sunken Crypt of Morzan (Session 14)",
    source: "text",
    transcript: DND_TRANSCRIPT,
    created_at: DND_NOW,
  },
  transcript: {
    text: DND_TRANSCRIPT,
    speakers: ["GM", "Valen (Rogue)", "Kaela (Wizard)", "Thorin (Paladin)"],
  },
  nodes: [
    { id: "n1", label: "Madame Vesper", emoji: "🦹‍♀️", color: "#E8839C" },
    {
      id: "n2",
      label: "The Morzan Seal Tablet",
      emoji: "📜",
      color: "#F2A65A",
    },
    {
      id: "n3",
      label: "Sunken Crypt of Morzan",
      emoji: "🏰",
      color: "#7C6BAD",
    },
    { id: "n4", label: "Crimson Hand Cultists", emoji: "🗡️", color: "#C2555F" },
    {
      id: "n5",
      label: "The Black Raven Tavern",
      emoji: "🍺",
      color: "#D9A441",
    },
    { id: "n6", label: "500g Cult Bounty", emoji: "💰", color: "#5B9E8F" },
    { id: "n7", label: "Dragon Hoard Split", emoji: "🐉", color: "#4E8AB8" },
  ],
  edges: [
    { id: "e1", source_topic_id: "n1", target_topic_id: "n2", color: "" },
    { id: "e2", source_topic_id: "n2", target_topic_id: "n3", color: "" },
    { id: "e3", source_topic_id: "n2", target_topic_id: "n4", color: "" },
    { id: "e4", source_topic_id: "n1", target_topic_id: "n5", color: "" },
    { id: "e5", source_topic_id: "n4", target_topic_id: "n6", color: "" },
    { id: "e6", source_topic_id: "n1", target_topic_id: "n7", color: "" },
  ],
  actionItems: [
    {
      id: "a1",
      conversation_id: DND_CID,
      description:
        "Head into the marshlands before dawn to locate the Sunken Crypt",
      assignee: "The Party",
      due_date: "before dawn",
      status: "pending",
      created_at: DND_NOW,
      updated_at: DND_NOW,
    },
    {
      id: "a2",
      conversation_id: DND_CID,
      description:
        "Pay Madame Vesper 600g from dragon split for the Morzan Seal",
      assignee: "Kaela",
      due_date: "tonight",
      status: "completed",
      created_at: DND_NOW,
      updated_at: DND_NOW,
      ai_checked: true,
      checked_reason: "Kaela offered 600g and Vesper accepted the deal.",
    },
    {
      id: "a3",
      conversation_id: DND_CID,
      description: "Ambush Crimson Hand scouts tracking the tablet deal",
      assignee: "Valen",
      due_date: "tonight",
      status: "pending",
      created_at: DND_NOW,
      updated_at: DND_NOW,
    },
    {
      id: "a4",
      conversation_id: DND_CID,
      description: "Decipher ancient abjuration runes on the seal",
      assignee: "Kaela",
      due_date: "before marsh arrival",
      status: "pending",
      created_at: DND_NOW,
      updated_at: DND_NOW,
    },
  ],
  statusUpdates: [
    {
      id: "a2",
      description:
        "Pay Madame Vesper 600g from dragon split for the Morzan Seal",
      status: "completed",
      reason: "Kaela offered 600g and Vesper accepted the deal.",
    },
  ],
  summary:
    "The party confronted Madame Vesper at the Black Raven Tavern after catching her negotiating with a hooded dwarf over the Morzan Seal tablet. The Crimson Hand cult had offered 500 gold for the abjuration artifact to breach the Sunken Crypt of Morzan. Kaela outbid the cult with 600 gold from the dragon hoard split, securing the tablet under the condition that the party reaches the marshlands before dawn. Valen is preparing to intercept any cultist scouts tracking the deal.",
  notes:
    "Morzan's seal requires abjuration counter-spell to unlock. Cult of the Serpent is active in the marsh.",
};

export interface DndStudioProps {
  lang?: "en" | "es";
}

export default function DndStudioIsland({ lang = "en" }: DndStudioProps) {
  const isSeeding = useSignal(false);
  const quickRollResult = useSignal<number | null>(null);
  const isQuickRolling = useSignal(false);

  const isSpanish = lang === "es";

  function handleQuickRoll() {
    isQuickRolling.value = true;
    soundTick();
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 20) + 1;
      quickRollResult.value = roll;
      isQuickRolling.value = false;
      if (roll === 20) {
        soundBloom();
      }
    }, 220);
  }

  function handleLoadDemo() {
    isSeeding.value = true;
    try {
      // Ensure tabletop modules (dice tray + soundscapes) are pre-mounted for the demo
      const currentModules = JSON.parse(
        localStorage.getItem("promapper-modules") || "[]",
      );
      const updatedModules = Array.from(
        new Set([...currentModules, "dice", "sound"]),
      );
      localStorage.setItem("promapper-modules", JSON.stringify(updatedModules));
    } catch {
      // best-effort
    }

    if (saveConversation(DND_DEMO)) {
      // Opened by name — "/" never auto-restores, so a bare "/" landed on
      // the empty porch (same fix as DemoSeedIsland).
      globalThis.location.href = `${isSpanish ? "/es" : "/"}?open=${DND_CID}`;
    } else {
      showToast(
        isSpanish
          ? "No se pudo guardar la partida de ejemplo en el navegador."
          : "Storage full — could not save example campaign.",
        "warning",
      );
      isSeeding.value = false;
    }
  }

  return (
    <div class="min-h-screen bg-[#fffef7] text-[#1e1714] font-sans px-4 py-8 sm:py-12 max-w-5xl mx-auto space-y-12">
      {/* Navigation Breadcrumb */}
      <nav class="flex items-center justify-between border-b-2 border-[#1e1714]/15 pb-4">
        <a
          href={isSpanish ? "/es" : "/"}
          class="min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1.5 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-xl text-xs font-black shadow-[2px_2px_0px_#1e1714] hover:shadow-[3px_3px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          {isSpanish ? "← Volver a ProMapper" : "← Back to ProMapper"}
        </a>
        <div class="flex items-center gap-2">
          <a
            href={isSpanish ? "/for/dnd" : "/es/rol"}
            hrefLang={isSpanish ? "en" : "es"}
            class="min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-xl text-xs font-bold shadow-[2px_2px_0px_#1e1714] hover:shadow-[3px_3px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 transition-all"
            aria-label={isSpanish ? "Switch to English" : "Cambiar a Español"}
          >
            {isSpanish ? "🇬🇧 English" : "🇲🇽 Español"}
          </a>
          <span class="hidden sm:inline-flex items-center gap-1 px-3 py-1 bg-[#1e1714] text-[#fffef7] rounded-full text-xs font-mono font-bold tracking-wide uppercase">
            🎲{" "}
            {isSpanish ? "D&D y juegos de rol" : "D&D 5e • Pathfinder • TTRPGs"}
          </span>
        </div>
      </nav>

      {/* Hero Section */}
      <header class="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div class="inline-block px-3 py-1 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-full text-xs font-mono font-bold text-[#1e1714] shadow-[2px_2px_0px_#1e1714]">
          {isSpanish
            ? "Para DMs y directores de juego"
            : "For Dungeon Masters & Tabletop Campaign Creators"}
        </div>
        <h1 class="text-3xl sm:text-5xl font-black tracking-tight text-[#1e1714] leading-tight">
          {isSpanish
            ? "De sesiones caóticas de 4 horas a mapas vivos para la campaña."
            : "Turn 4-Hour Chaotic Sessions Into Living Campaign Lore Maps."}
        </h1>
        <p class="text-base sm:text-xl font-medium text-[#1e1714]/80 leading-relaxed">
          {isSpanish
            ? "Entra el audio de la partida o las notas sueltas. ProMapper saca PNJs, facciones, misiones activas y botín en un mapa interactivo con dados y sonido ambiental, listo para compartir en Discord."
            : "Drop in session audio or loose notes. ProMapper extracts NPCs, factions, active quest hooks, and party loot into an interactive lore map with built-in polyhedral dice and atmospheric soundscapes, ready to share on Discord."}
        </p>

        {/* CTA Banner */}
        <div class="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={isSeeding.value}
            class="w-full sm:w-auto px-6 py-3.5 bg-[var(--spot-riso-pink,#ff6ac2)] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[5px_5px_0px_#1e1714] active:shadow-[2px_2px_0px_#1e1714] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{isSeeding.value ? "⏳" : "🐉"}</span>
            <span>
              {isSeeding.value
                ? (isSpanish ? "Cargando Campaña..." : "Loading Campaign...")
                : (isSpanish
                  ? "Ver partida de ejemplo: La Cripta de Morzan"
                  : "Explore Interactive Campaign Demo Map")}
            </span>
          </button>
          <a
            href={isSpanish ? "/es" : "/"}
            class="w-full sm:w-auto px-6 py-3.5 bg-[#fbf1e4] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[5px_5px_0px_#1e1714] active:shadow-[2px_2px_0px_#1e1714] transition-all flex items-center justify-center gap-2"
          >
            <span>🎙️</span>
            <span>
              {isSpanish ? "Mapear nueva partida" : "Start a Session Map"}
            </span>
          </a>
        </div>

        {/* Quick d20 Tactile Roller Toy on the Landing Page */}
        <div class="pt-2 flex flex-col items-center justify-center gap-2">
          <div class="inline-flex items-center gap-3 p-2 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-2xl shadow-[3px_3px_0px_#1e1714] font-mono">
            <span class="text-xs font-bold uppercase tracking-wider text-[#1e1714]/70 pl-2">
              {isSpanish ? "Tira el dado:" : "Test a tactile roll:"}
            </span>
            <button
              type="button"
              onClick={handleQuickRoll}
              disabled={isQuickRolling.value}
              class={`min-h-[44px] px-4 py-2 bg-[#fffef7] border-2 border-[#1e1714] rounded-xl text-xs font-black text-[#1e1714] shadow-[2px_2px_0px_#1e1714] hover:shadow-[3px_3px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer transition-all flex items-center gap-1.5 ${
                isQuickRolling.value ? "animate-spin" : ""
              }`}
            >
              <span>🎲</span>
              <span>{isSpanish ? "Tira un d20" : "Roll d20"}</span>
            </button>
            {quickRollResult.value !== null && (
              <span
                class={`px-2.5 py-1 rounded-lg text-xs font-black border border-[#1e1714] transition-transform animate-bounce ${
                  quickRollResult.value === 20
                    ? "bg-[var(--spot-fluro-yellow,#FFE600)] text-[#1e1714] font-black shadow-[2px_2px_0px_#1e1714]"
                    : quickRollResult.value === 1
                    ? "bg-[#fbf1e4] text-[#1e1714] shadow-[2px_2px_0px_#1e1714]"
                    : "bg-[#fffef7] text-[#1e1714]"
                }`}
              >
                {quickRollResult.value === 20
                  ? "Nat 20! ✨"
                  : quickRollResult.value === 1
                  ? "Nat 1! 💥"
                  : `d20 = ${quickRollResult.value}`}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Value Pillars Grid (4 Tabletop Superpowers) */}
      <section class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">🦹‍♀️</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "PNJs y facciones al instante"
              : "NPCs & Factions Mapped"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Detecta personajes, tabernas, cultos y deidades durante la partida, conectándolos en nodos visuales con emojis."
              : "Discovers character names, tavern keepers, cultists, and deities mentioned during roleplay, clustering them into visual emoji nodes."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">⚔️</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "Misiones y botín al tiro"
              : "Quest Hooks & Party Loot"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Los acuerdos y pistas se vuelven tareas con responsables. Si alguien cumple un objetivo más tarde, se marca en automático."
              : "Plot hooks and deals turn into action items with party assignees. When a quest objective is completed in a later take, it ticks itself off."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">🎲</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "Dados poliédricos al toque"
              : "Tactile Polyhedral Dice"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Bandeja integrada con d4 hasta d100, modificadores, ventaja/desventaja y guardado directo a notas con un clic."
              : "Built-in rack tray with d4 through d100, count steppers, +/- modifiers, Advantage/Disadvantage, and 1-tap logging straight to session notes."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">🌲</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "Sonido ambiental sin descargas (0 KB)"
              : "0 KB Procedural Audio"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Audio ambiental sintetizado al momento en el navegador: chimenea de taberna, viento de cripta, tormentas y bosques arcanos."
              : "Real-time atmospheric Web Audio synthesis with 0 KB assets: tavern hearths, cavern winds, thunderstorm swells, and arcane woods."}
          </p>
        </div>
      </section>

      {/* Campaign Chronicle Showcase */}
      <section class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#1e1714]/15 pb-3">
          <div>
            <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider mb-1">
              {isSpanish ? "Nuevo formato" : "New Export Preset"}
            </span>
            <h2 class="text-xl sm:text-2xl font-black text-[#1e1714]">
              📜 {isSpanish
                ? "Crónica de campaña en 1 clic para Discord y Obsidian"
                : "1-Click Campaign Chronicle for Discord & Obsidian"}
            </h2>
          </div>
          <span class="text-xs font-mono font-bold text-[#1e1714]/70">
            {isSpanish
              ? "Exportación limpia en Markdown, PDF y diapositivas"
              : "Clean Markdown, Styled PDF & Slide Deck output"}
          </span>
        </div>
        <p class="text-xs sm:text-sm text-[#1e1714]/80">
          {isSpanish
            ? "Sin horas redactando resúmenes después de jugar. Este formato organiza personajes, lugares, misiones pendientes y botín en un solo archivo Markdown impecable:"
            : "No more hours writing post-session recaps. The Campaign Chronicle preset structures dramatis personae, locations, active quest hooks, and party loot in one clean Markdown file:"}
        </p>
        <pre class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 text-xs font-mono text-[#1e1714] overflow-x-auto whitespace-pre-wrap break-words leading-relaxed shadow-[2px_2px_0px_#1e1714]">
{`# The Sunken Crypt of Morzan (Session 14)
**Dramatis Personae**: Madame Vesper (Crime Broker), Kaela (Wizard), Valen (Rogue), Thorin (Paladin)
**Locations & Lore**: The Black Raven Tavern, Sunken Crypt of Morzan, Crimson Hand Cultists
**Active Quests**:
  - [ ] Head into the marshlands before dawn to locate the Sunken Crypt (The Party)
  - [x] Pay Madame Vesper 600g from dragon split for the Morzan Seal (Kaela)
**Party Loot & Artifacts**: The Morzan Seal Tablet (-600g gold split)
**The Story So Far**: The party confronted Madame Vesper and outbid the cultists before dawn...`}
        </pre>
      </section>

      {/* Multiplayer Party Room + Excalidraw Flip-Side + Export to Anything Strip */}
      <section class="grid sm:grid-cols-3 gap-5">
        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Maratón de 4 horas" : "4-Hour Marathon Mode"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            ⏱️ {isSpanish
              ? "Auto-guardado cada 15 min sin cortar el micrófono"
              : "Rolling 15-Min Auto-Appends"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Las partidas de 3 a 4 horas se dividen en bloques de 15 minutos en segundo plano. El mapa de lore y las misiones se actualizan en vivo mientras el micrófono sigue grabando."
              : "Long 3-to-4-hour tabletop sessions automatically slice and append every 15 minutes in the background. The lore graph and quest checklist update live while the mic stays open."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Sala multijugador" : "Multiplayer Party Room"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            🎨 {isSpanish
              ? "Sala en vivo con voz y pizarrón Excalidraw"
              : "Live Voice Room & Sketchboard"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Comparte el enlace de la sala para que todo el grupo edite nodos, marque misiones y voltee el mapa al pizarrón Excalidraw compartido para dibujar calabozos en tiempo real."
              : "Share one room link so the whole party edits lore nodes, checks off quests, and flips the Topic Map card over to a shared Excalidraw canvas to sketch dungeon maps in real time."}
          </p>
        </div>

        <div class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 shadow-[4px_4px_0px_#1e1714] space-y-2">
          <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-[#fffef7] text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
            {isSpanish ? "Cajón de exportación" : "Export to Anything"}
          </span>
          <h3 class="text-base font-black text-[#1e1714]">
            🖨️ {isSpanish
              ? "PDF impreso, presentación y 8 formatos"
              : "1-Click PDF, Slide Deck & 8 Presets"}
          </h3>
          <p class="text-xs text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Convierte cualquier sesión en un PDF con estilo, una presentación de 6 a 9 diapositivas (Slide-O-Matic), Crónica de Campaña o Preguntas No Hechas."
              : "Turn any session into a styled printable PDF, a 6–9 slide presentation deck (Slide-O-Matic), a Campaign Chronicle, or an Unasked Questions brief."}
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-4 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-xl sm:text-3xl font-black text-[#1e1714]">
            {isSpanish
              ? "ProMapper frente a tomar notas a mano a mitad de partida"
              : "ProMapper vs Manual Pen-and-Paper Note Taking"}
          </h2>
          <p class="text-xs sm:text-sm text-[#1e1714]/70">
            {isSpanish
              ? "Por qué los DMs prefieren mapeo visual en vez de libretas caóticas"
              : "Why Game Masters use live conversation mapping over messy notebooks"}
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
                  {isSpanish
                    ? "Notas a mano / Notion"
                    : "Manual Notes / Notion"}
                </th>
                <th class="text-left p-3 font-black text-[#1e1714] bg-[#fbf1e4]">
                  ProMapper TTRPG Studio 🎲
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#1e1714]/15">
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Durante la partida" : "During Live Play"}
                </td>
                <td class="p-3 text-[#1e1714]/75">
                  {isSpanish
                    ? "Escribir o teclear corta el ritmo de la narración"
                    : "Typing or scribbling breaks the storytelling flow"}
                </td>
                <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                  {isSpanish
                    ? "100% manos libres: el audio corre y la mesa sigue"
                    : "100% hands-free — the recording runs while the table plays"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish
                    ? "Conexiones de historia"
                    : "Lore Relationship Graph"}
                </td>
                <td class="p-3 text-[#1e1714]/75">
                  {isSpanish
                    ? "Páginas de texto plano difíciles de cruzar"
                    : "Wall of text notes, slow to cross-reference"}
                </td>
                <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                  {isSpanish
                    ? "Grafo visual interactivo para mover y conectar"
                    : "Interactive force-directed node graph to drag & merge"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Música y dados" : "Atmosphere & Dice"}
                </td>
                <td class="p-3 text-[#1e1714]/75">
                  {isSpanish
                    ? "Cinco pestañas abiertas (música, dados, notas, chat)"
                    : "5 open browser tabs (music, dice roller, notes, chat)"}
                </td>
                <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                  {isSpanish
                    ? "Todo en el mismo tablero: sonido ambiental, bandeja de dados y mapa de lore"
                    : "All-in-one board — procedural ambient soundscapes, tactile dice tray & lore graph"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Compartir con el grupo" : "Party Sharing"}
                </td>
                <td class="p-3 text-[#1e1714]/75">
                  {isSpanish
                    ? "Documentos pesados que pocos abren"
                    : "Long documents the party rarely opens"}
                </td>
                <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                  {isSpanish
                    ? "Enlace directo sin registro: abre en el cel de cualquiera"
                    : "Compressed URL share link with interactive map + 0 signups"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Almacenamiento" : "Campaign Storage"}
                </td>
                <td class="p-3 text-[#1e1714]/75">
                  {isSpanish
                    ? "Cuentas obligatorias en la nube"
                    : "Locked behind mandatory cloud accounts"}
                </td>
                <td class="p-3 font-bold text-[#1e1714] bg-[#fffef7]/80">
                  {isSpanish
                    ? "Local en el navegador, con opción de llave propia (BYOK)"
                    : "100% local-first in browser with optional BYOK key routing"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Visible FAQ Section (100% parity with FAQPage JSON-LD) */}
      <section
        aria-labelledby="dnd-faq-heading"
        class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-6"
      >
        <h2
          id="dnd-faq-heading"
          class="text-xl sm:text-2xl font-black text-[#1e1714]"
        >
          {isSpanish
            ? "Preguntas frecuentes sobre campañas de rol"
            : "Frequently Asked Questions"}
        </h2>
        <div class="grid sm:grid-cols-3 gap-4">
          <article class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 shadow-[2px_2px_0px_#1e1714] space-y-2">
            <h3 class="text-sm font-black text-[#1e1714]">
              {isSpanish
                ? "¿Cómo mapea ProMapper las sesiones de rol?"
                : "How does ProMapper map a D&D or TTRPG session?"}
            </h3>
            <p class="text-xs text-[#1e1714]/80 leading-relaxed">
              {isSpanish
                ? "Entra el audio de la sesión o las notas escritas. ProMapper extrae PNJs, facciones, misiones activas y botín en un mapa interactivo donde las misiones se palomean solas conforme avanza la campaña."
                : "Drop in session audio or written notes. ProMapper extracts NPCs, factions, active quest objectives, and party loot into an interactive force-directed lore graph where quests tick themselves off as later sessions unfold."}
            </p>
          </article>
          <article class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 shadow-[2px_2px_0px_#1e1714] space-y-2">
            <h3 class="text-sm font-black text-[#1e1714]">
              {isSpanish
                ? "¿Cómo se comparte el tablero con el grupo de juego?"
                : "How does campaign sharing work for the rest of the party?"}
            </h3>
            <p class="text-xs text-[#1e1714]/80 leading-relaxed">
              {isSpanish
                ? "El botón Compartir genera un enlace directo con el mapa completo. El grupo explora las conexiones de historia, misiones y resumen desde cualquier celular o computadora sin crear cuentas."
                : "Click Share to generate a compressed link or permanent board URL. Players explore the interactive lore graph, quest log, and session summary on any phone or laptop with zero account signups."}
            </p>
          </article>
          <article class="bg-[#fffef7] border-2 border-[#1e1714] rounded-xl p-4 shadow-[2px_2px_0px_#1e1714] space-y-2">
            <h3 class="text-sm font-black text-[#1e1714]">
              {isSpanish
                ? "¿Se pueden exportar crónicas a Discord u Obsidian?"
                : "Does it export session recaps to Discord and Obsidian?"}
            </h3>
            <p class="text-xs text-[#1e1714]/80 leading-relaxed">
              {isSpanish
                ? "Sí. El formato Crónica de Campaña arma resúmenes limpios en Markdown con personajes, lugares, misiones y botín listos para pegar en Discord o en una bóveda de Obsidian."
                : "Yes. The Campaign Chronicle export preset builds clean Markdown recaps with dramatis personae, locations, active quests, and party loot ready to paste straight into a Discord channel or Obsidian vault."}
            </p>
          </article>
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
        <a
          href={isSpanish ? "/es/juntas" : "/for/meetings"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          📋 {isSpanish ? "Juntas y acuerdos" : "Weekly Meetings"}
        </a>
        <a
          href={isSpanish ? "/es/clientes" : "/for/clients"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🤝 {isSpanish ? "Clientes y asesorías" : "Client Sessions"}
        </a>
        <a
          href={isSpanish ? "/es/consultas" : "/for/care"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🩺 {isSpanish ? "Consultas médicas" : "Doctor & Care Visits"}
        </a>
        <a
          href={isSpanish ? "/es/escuelas" : "/for/schools"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🍎 {isSpanish ? "Escuelas y laboratorios" : "Schools & Research Labs"}
        </a>
        <a
          href={isSpanish ? "/es/investigacion" : "/for/research"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🔍{" "}
          {isSpanish ? "Investigación y entrevistas" : "Research & Interviews"}
        </a>
        <a
          href={isSpanish ? "/es/ideas" : "/for/brainstorming"}
          class="inline-flex items-center min-h-[44px] px-3.5 py-2 bg-[#fffef7] border border-[#1e1714] rounded-xl hover:-translate-y-0.5 transition-transform"
        >
          🎙️ {isSpanish ? "Notas de voz e ideas" : "Voice Notes & Ideas"}
        </a>
      </nav>

      {/* Footer & CTA */}
      <footer class="text-center pt-8 border-t-2 border-[#1e1714]/15 space-y-4">
        <button
          type="button"
          onClick={handleLoadDemo}
          class="w-full sm:w-auto min-h-[44px] px-8 py-4 bg-[var(--spot-riso-pink,#ff6ac2)] text-[#1e1714] border-3 border-[#1e1714] rounded-2xl font-black text-base sm:text-lg shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#1e1714] active:translate-y-0 transition-all cursor-pointer"
        >
          {isSpanish
            ? "Abre el tablero de campaña con dados y sonido 🎲"
            : "Open Campaign Board with Dice & Soundscapes 🎲"}
        </button>
        <p class="text-xs font-mono text-[#1e1714]/60">
          {isSpanish
            ? "Compatible con D&D 5e, Pathfinder 2e, Call of Cthulhu, Cyberpunk y cualquier juego de rol."
            : "Works seamlessly with D&D 5e, Pathfinder 2e, Call of Cthulhu, Cyberpunk RED, and any homebrew TTRPG."}
        </p>
      </footer>
    </div>
  );
}
