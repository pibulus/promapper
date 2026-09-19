import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import type { ConversationData } from "@core/types/conversation-data.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";

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
      globalThis.location.href = isSpanish ? "/es" : "/";
    } else {
      alert(
        isSpanish
          ? "No se pudo guardar la partida de ejemplo en tu navegador."
          : "Failed to save example campaign to local storage.",
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
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-[#1e1714] rounded-xl text-xs font-black shadow-[2px_2px_0px_#1e1714] hover:-translate-y-0.5 transition-transform"
        >
          {isSpanish ? "← Volver a ProMapper" : "← Back to ProMapper"}
        </a>
        <div class="flex items-center gap-2">
          <a
            href={isSpanish ? "/for/dnd" : "/es/rol"}
            class="inline-flex items-center gap-1 px-2.5 py-1 bg-white border-2 border-[#1e1714] rounded-xl text-xs font-bold shadow-[2px_2px_0px_#1e1714] hover:-translate-y-0.5 transition-transform"
            aria-label={isSpanish ? "Switch to English" : "Cambiar a Español"}
          >
            {isSpanish ? "🇬🇧 English" : "🇲🇽 Español"}
          </a>
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-[#1e1714] text-white rounded-full text-xs font-black tracking-wide uppercase">
            🎲{" "}
            {isSpanish ? "D&D y juegos de rol" : "D&D 5e • Pathfinder • TTRPGs"}
          </span>
        </div>
      </nav>

      {/* Hero Section */}
      <header class="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div class="inline-block px-3 py-1 bg-amber-100 border-2 border-[#1e1714] rounded-full text-xs font-black text-amber-900 shadow-[2px_2px_0px_#1e1714]">
          {isSpanish
            ? "Para DMs y directores de juego"
            : "For Dungeon Masters & Tabletop Campaign Creators"}
        </div>
        <h1 class="text-3xl sm:text-5xl font-black tracking-tight text-[#1e1714] leading-tight">
          {isSpanish
            ? "De sesiones caóticas de 4 horas a mapas vivos para tu campaña."
            : "Turn 4-Hour Chaotic Sessions Into Living Campaign Lore Maps."}
        </h1>
        <p class="text-base sm:text-xl font-medium text-[#1e1714]/80 leading-relaxed">
          {isSpanish
            ? "Graba el audio de tu partida o pega notas sueltas. ProMapper saca PNJs, facciones, misiones y botín en un mapa interactivo con dados y sonido ambiental, listo para compartir con tus jugadores en Discord."
            : "Record your session audio or paste loose notes. ProMapper automatically extracts NPCs, factions, active quest hooks, and party loot into an interactive lore map with built-in polyhedral dice and atmospheric soundscapes, ready to share with your party on Discord."}
        </p>

        {/* CTA Banner */}
        <div class="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={isSeeding.value}
            class="w-full sm:w-auto px-6 py-3.5 bg-[#FF69B4] text-black border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[5px_5px_0px_#1e1714] transition-all cursor-pointer flex items-center justify-center gap-2"
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
            class="w-full sm:w-auto px-6 py-3.5 bg-white text-black border-3 border-[#1e1714] rounded-2xl font-black text-base shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
          >
            <span>🎙️</span>
            <span>{isSpanish ? "Mapea tu partida" : "Map My Own Session"}</span>
          </a>
        </div>

        {/* Quick d20 Tactile Roller Toy on the Landing Page */}
        <div class="pt-2 flex flex-col items-center justify-center gap-2">
          <div class="inline-flex items-center gap-3 p-2 bg-[#fbf1e4] border-2 border-[#1e1714] rounded-2xl shadow-[3px_3px_0px_#1e1714]">
            <span class="text-xs font-black uppercase tracking-wider text-[#1e1714]/70 pl-2">
              {isSpanish ? "Tira el dado:" : "Test a tactile roll:"}
            </span>
            <button
              type="button"
              onClick={handleQuickRoll}
              disabled={isQuickRolling.value}
              class={`px-3 py-1.5 bg-white border-2 border-[#1e1714] rounded-xl text-xs font-black text-[#1e1714] shadow-[2px_2px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer transition-transform flex items-center gap-1.5 ${
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
                    ? "bg-amber-300 text-amber-950 font-black shadow-[2px_2px_0px_#1e1714]"
                    : quickRollResult.value === 1
                    ? "bg-rose-200 text-rose-950 shadow-[2px_2px_0px_#1e1714]"
                    : "bg-white text-[#1e1714]"
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
        <div class="bg-white border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
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

        <div class="bg-white border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">⚔️</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "Misiones y botín al tiro"
              : "Quest Hooks & Party Loot"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Los acuerdos y pistas se vuelven tareas con responsables. Si alguien cumple un objetivo más tarde, se marca en automático."
              : "Plot hooks and deals turn into action items with party assignees. If a player completes a quest objective later, it auto-ticks itself."}
          </p>
        </div>

        <div class="bg-white border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
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

        <div class="bg-white border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3">
          <div class="text-3xl">🌲</div>
          <h3 class="text-lg font-black text-[#1e1714]">
            {isSpanish
              ? "Sonido ambiental sin descargas (0 KB)"
              : "0 KB Procedural Audio"}
          </h3>
          <p class="text-xs sm:text-sm text-[#1e1714]/80 leading-relaxed">
            {isSpanish
              ? "Audio ambiental sintetizado al momento en tu navegador: chimenea de taberna, viento de cripta, tormentas y bosques arcanos."
              : "Real-time atmospheric Web Audio synthesis with 0 KB assets: tavern hearths, cavern winds, thunderstorm swells, and arcane woods."}
          </p>
        </div>
      </section>

      {/* Campaign Chronicle Showcase */}
      <section class="bg-amber-50/70 border-3 border-[#1e1714] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#1e1714]/15 pb-3">
          <div>
            <span class="inline-block px-2.5 py-0.5 bg-[#1e1714] text-white text-[10px] font-black uppercase rounded-full tracking-wider mb-1">
              {isSpanish ? "Nuevo formato" : "New Export Preset"}
            </span>
            <h2 class="text-xl sm:text-2xl font-black text-[#1e1714]">
              📜 {isSpanish
                ? "Crónica de campaña en 1 clic para Discord y Obsidian"
                : "1-Click Campaign Chronicle for Discord & Obsidian"}
            </h2>
          </div>
          <span class="text-xs font-bold text-[#1e1714]/70">
            {isSpanish
              ? "Exportación limpia en Markdown"
              : "Clean Markdown output"}
          </span>
        </div>
        <p class="text-xs sm:text-sm text-[#1e1714]/80">
          {isSpanish
            ? "Olvídate de pasar horas redactando resúmenes. Este preset organiza personajes, lugares, misiones pendientes y botín en un solo archivo Markdown impecable:"
            : "Never spend an hour writing post-session recaps again. The Campaign Chronicle preset structures your dramatis personae, locations, active quest hooks, and party loot in one clean Markdown file:"}
        </p>
        <pre class="bg-white border-2 border-[#1e1714] rounded-xl p-4 text-xs font-mono text-[#1e1714] overflow-x-auto leading-relaxed shadow-[2px_2px_0px_#1e1714]">
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

      {/* Comparison Table */}
      <section class="bg-white border-3 border-[#1e1714] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-xl sm:text-3xl font-black text-[#1e1714]">
            {isSpanish
              ? "ProMapper contra tomar notas a mano a mitad de partida"
              : "ProMapper vs Manual Pen-and-Paper Note Taking"}
          </h2>
          <p class="text-xs sm:text-sm text-[#1e1714]/70">
            {isSpanish
              ? "Por qué los DMs prefieren mapeo visual en vez de libretas caóticas"
              : "Why Game Masters use live conversation mapping over messy notebooks"}
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs sm:text-sm border-collapse">
            <thead>
              <tr class="border-b-2 border-[#1e1714] bg-amber-50">
                <th class="text-left p-3 font-black text-[#1e1714]">
                  {isSpanish ? "Detalle" : "Feature"}
                </th>
                <th class="text-left p-3 font-black text-gray-500">
                  {isSpanish
                    ? "Notas a mano / Notion"
                    : "Manual Notes / Notion"}
                </th>
                <th class="text-left p-3 font-black text-emerald-800 bg-emerald-50">
                  ProMapper TTRPG Studio 🎲
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#1e1714]/15">
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Durante la partida" : "During Live Play"}
                </td>
                <td class="p-3 text-gray-600">
                  {isSpanish
                    ? "Escribir o teclear corta el ritmo de la narración"
                    : "Typing or scribbling breaks the storytelling flow"}
                </td>
                <td class="p-3 font-bold text-emerald-900 bg-emerald-50/50">
                  {isSpanish
                    ? "100% manos libres: graba el audio y rolea a gusto"
                    : "100% hands-free — record the audio and just roleplay"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish
                    ? "Conexiones de historia"
                    : "Lore Relationship Graph"}
                </td>
                <td class="p-3 text-gray-600">
                  {isSpanish
                    ? "Páginas de texto plano imposibles de cruzar"
                    : "Wall of text notes, impossible to cross-reference"}
                </td>
                <td class="p-3 font-bold text-emerald-900 bg-emerald-50/50">
                  {isSpanish
                    ? "Grafo visual interactivo para mover y conectar"
                    : "Interactive force-directed node graph you can drag & merge"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Música y dados" : "Atmosphere & Dice"}
                </td>
                <td class="p-3 text-gray-600">
                  {isSpanish
                    ? "Cinco pestañas abiertas (Spotify con anuncios, Roll20, bots, Notion)"
                    : "5 open browser tabs (Spotify ads, Roll20, Discord bot, Notion)"}
                </td>
                <td class="p-3 font-bold text-emerald-900 bg-emerald-50/50">
                  {isSpanish
                    ? "Todo en el mismo tablero: sonido ambiental, bandeja de dados y mapa de lore"
                    : "All-in-one board — procedural ambient soundscapes, tactile dice tray & lore graph"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Compartir con el grupo" : "Party Sharing"}
                </td>
                <td class="p-3 text-gray-600">
                  {isSpanish
                    ? "Documentos pesados que nadie lee"
                    : "Clunky shared documents nobody reads"}
                </td>
                <td class="p-3 font-bold text-emerald-900 bg-emerald-50/50">
                  {isSpanish
                    ? "Enlace directo sin registro: se abre en el cel de cualquiera"
                    : "Compressed URL share link with interactive map + 0 signups"}
                </td>
              </tr>
              <tr>
                <td class="p-3 font-bold">
                  {isSpanish ? "Privacidad de tu campaña" : "Homebrew Privacy"}
                </td>
                <td class="p-3 text-gray-600">
                  {isSpanish
                    ? "Guardado en servidores ajenos para entrenar modelos de IA"
                    : "Scanned by cloud providers to train AI models"}
                </td>
                <td class="p-3 font-bold text-emerald-900 bg-emerald-50/50">
                  {isSpanish
                    ? "Se queda en tu navegador, sin guardar nada en la nube"
                    : "100% local-first in browser with BYOK private keys"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer & CTA */}
      <footer class="text-center pt-8 border-t-2 border-[#1e1714]/15 space-y-4">
        <button
          type="button"
          onClick={handleLoadDemo}
          class="px-8 py-4 bg-[#FF69B4] text-black border-3 border-[#1e1714] rounded-2xl font-black text-lg shadow-[4px_4px_0px_#1e1714] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          {isSpanish
            ? "Abre el tablero de campaña con dados y sonido 🎲"
            : "Open Campaign Board with Dice & Soundscapes 🎲"}
        </button>
        <p class="text-xs text-[#1e1714]/60">
          {isSpanish
            ? "Compatible con D&D 5e, Pathfinder 2e, Call of Cthulhu, Cyberpunk y cualquier juego de rol."
            : "Works seamlessly with D&D 5e, Pathfinder 2e, Call of Cthulhu, Cyberpunk RED, and any homebrew TTRPG."}
        </p>
      </footer>
    </div>
  );
}
