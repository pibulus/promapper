import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import { showToast } from "@utils/toast.ts";
import {
  DEMO_DUSTY,
  DEMO_EVIL_WIZARD,
  DEMO_SAILOR_MOON,
  DEMO_T2,
} from "../utils/demoPresets.ts";

export type VerticalKind =
  | "meetings"
  | "research"
  | "brainstorming"
  | "clients"
  | "care"
  | "schools";

export interface VerticalFaqItem {
  question: string;
  answer: string;
}

export interface VerticalPillar {
  emoji: string;
  title: string;
  body: string;
}

export interface VerticalCompareRow {
  feature: string;
  traditional: string;
  promapper: string;
}

export interface VerticalCopy {
  enPath: string;
  esPath: string;
  navBadge: string;
  kicker: string;
  h1: string;
  subtitle: string;
  ctaDemo: string;
  ctaDemoBusy: string;
  ctaStart: string;
  pillars: [VerticalPillar, VerticalPillar, VerticalPillar, VerticalPillar];
  exportBadge: string;
  exportTitle: string;
  exportSubtitle: string;
  exportIntro: string;
  exportSample: string;
  compareTitle: string;
  compareSubtitle: string;
  compareOtherHeader: string;
  compareOurHeader: string;
  compareRows: VerticalCompareRow[];
  faqTitle: string;
  faqs: [VerticalFaqItem, VerticalFaqItem, VerticalFaqItem];
  footerCta: string;
  footerNote: string;
}

export const VERTICAL_CONFIG: Record<
  VerticalKind,
  { en: VerticalCopy; es: VerticalCopy }
> = {
  meetings: {
    en: {
      enPath: "/for/meetings",
      esPath: "/es/juntas",
      navBadge: "Weekly Syncs • Accountability Boards • Live Rooms",
      kicker:
        "For Small Teams, Co-Founders, Accountability Partners & Weekly Check-Ins",
      h1: "Weekly Meeting Notes Where Action Items Tick Themselves Off.",
      subtitle:
        "Drop in a voice recording or meeting transcript — no calendar bot joining the call. ProMapper builds a speaker-attributed transcript, a force-directed topic map, and an accountability board that checks items off when a later meeting confirms the work happened.",
      ctaDemo: "Open Sample Project Sync Board",
      ctaDemoBusy: "Opening Sync Board...",
      ctaStart: "Start a Meeting Map",
      pillars: [
        {
          emoji: "✅",
          title: "Self-Checking Actions",
          body:
            "Tasks carry an assignee and timeframe. Mention in next week's check-in that a task is finished and the board ticks it off automatically with the reason attached.",
        },
        {
          emoji: "🔄",
          title: "The Append Loop",
          body:
            "Every weekly check-in folds into the same living project map instead of scattering across 40 separate meeting documents.",
        },
        {
          emoji: "🟢",
          title: "No Creepy Call Bots",
          body:
            "Works from browser audio or a dropped recording file. Or open a live ProMapper room link where the whole team edits the board together in real time.",
        },
        {
          emoji: "📋",
          title: "8 Markdown Export Decks",
          body:
            "Turn any mapped session into a clean Project Plan, Executive Summary, Action Checklist, or Slide Deck in one click.",
        },
      ],
      exportBadge: "Built-In Export Deck",
      exportTitle: "1-Click Project Plan & Self-Checked Action Log",
      exportSubtitle: "Clean Markdown for Slack, Linear, Notion, or GitHub",
      exportIntro:
        "Instead of re-typing action items after a call, the Plan export organizes owners, completed work, and open blockers into a ready-to-share Markdown brief:",
      exportSample: `# Weekly Studio Sync — Release & Timeline Check
**Participants**: Sarah, Miles, John
**Completed Since Last Take**:
  - [x] Verify backup power & crowd control gear (Checked off: confirmed on the morning call)
**Open Action Items**:
  - [ ] Clear central server vault before Friday window (@Sarah · this week)
  - [ ] Finalize transport route & handoff checklist (@Miles · Thursday)
**Connected Threads**: Vault Access ↔ Timeline Window ↔ Transport Logistics`,
      compareTitle: "ProMapper vs Call-Joining Meeting Bots & Static Docs",
      compareSubtitle:
        "Why small teams keep a living project map instead of a graveyard of transcripts",
      compareOtherHeader: "Call Bots / Static Docs",
      compareOurHeader: "ProMapper Workshop Table 📋",
      compareRows: [
        {
          feature: "Call Presence",
          traditional:
            "Uninvited recording bot joins the video call and announces itself",
          promapper:
            "Zero bots — record from the browser tab or drop an audio file afterwards",
        },
        {
          feature: "Week-Over-Week Memory",
          traditional:
            "Every meeting creates another isolated document nobody revisits",
          promapper:
            "Next week's take appends into the same map and updates existing threads",
        },
        {
          feature: "Action Item Follow-Up",
          traditional: "Manual checkbox chasing across old notes",
          promapper:
            "Items tick themselves off when a later take confirms completion",
        },
        {
          feature: "Topic Relationships",
          traditional: "Chronological wall of text",
          promapper:
            "Interactive force-directed topic graph with typed relationship edges",
        },
        {
          feature: "Accounts & Ownership",
          traditional: "Per-seat monthly subscriptions and cloud lock-in",
          promapper:
            "Local-first in browser, zero accounts required, optional BYOK key routing",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question: "How do action items check themselves off across meetings?",
          answer:
            "When a new recording or note is appended to an existing project map, ProMapper compares the new transcript against open action items. Any task confirmed as done is marked complete with a quote explaining why.",
        },
        {
          question:
            "Does ProMapper require a bot to join Zoom, Meet, or Teams calls?",
          answer:
            "No. ProMapper never joins calendar events or video calls as a bot. Record directly in the browser, open a shared live room link, or drop in an audio file or transcript after the conversation.",
        },
        {
          question: "How do teammates view or edit the same project map?",
          answer:
            "Click Share for a read-only link, or hit Go Live to open a real-time collaborative room where teammates edit topics, check off actions, and add takes together in the browser.",
        },
      ],
      footerCta: "Open Sample Project Sync Board 📋",
      footerNote:
        "Built for weekly studio check-ins, co-founder syncs, accountability boards, and community projects.",
    },
    es: {
      enPath: "/for/meetings",
      esPath: "/es/juntas",
      navBadge: "Juntas Semanales • Acuerdos • Salas en Vivo",
      kicker: "Para Equipos Pequeños, Socios, Mesas de Seguimiento y Proyectos",
      h1: "Minutas y Mapas de Juntas Donde los Pendientes se Palomean Solos.",
      subtitle:
        "Entra el audio de una junta o una transcripción sin meter bots incómodos a la videollamada. ProMapper arma la transcripción por hablante, el mapa de temas conectados y un tablero de seguimiento donde los acuerdos se palomean solos cuando en la siguiente junta se confirma que quedaron listos.",
      ctaDemo: "Ver Tablero de Ejemplo de Junta",
      ctaDemoBusy: "Abriendo Tablero...",
      ctaStart: "Mapear una Junta",
      pillars: [
        {
          emoji: "✅",
          title: "Acuerdos que se Palomean Solos",
          body:
            "Cada pendiente guarda responsable y fecha. Cuando en la siguiente toma se menciona que algo ya quedó, el tablero lo marca completado con la razón.",
        },
        {
          emoji: "🔄",
          title: "Memoria Continua",
          body:
            "La junta de la próxima semana se suma al mismo mapa vivo en lugar de perderse en decenas de documentos sueltos.",
        },
        {
          emoji: "🟢",
          title: "Sin Bots en la Videollamada",
          body:
            "Funciona grabando directo en el navegador o subiendo un archivo de audio. También abre salas en vivo para editar el tablero en equipo.",
        },
        {
          emoji: "📋",
          title: "8 Formatos de Exportación",
          body:
            "Convierte cualquier sesión en Plan de Proyecto, Minuta Ejecutiva, Lista de Tareas o Presentación en Markdown con un clic.",
        },
      ],
      exportBadge: "Formato de Exportación",
      exportTitle: "Plan de Proyecto y Bitácora de Acuerdos en 1 Clic",
      exportSubtitle: "Markdown limpio para Slack, Notion, Linear o GitHub",
      exportIntro:
        "En lugar de pasar horas redactando minutas, el formato Plan organiza responsables, avances completados y pendientes abiertos en un solo documento:",
      exportSample: `# Junta Semanal de Estudio — Avances y Entregas
**Participantes**: Sarah, Miles, John
**Completado desde la última toma**:
  - [x] Revisar respaldo eléctrico y equipo de campo (Palomeado: confirmado al inicio de la junta)
**Pendientes Abiertos**:
  - [ ] Cerrar bóveda del servidor antes del viernes (@Sarah · esta semana)
  - [ ] Confirmar ruta de entrega y lista de chequeo (@Miles · jueves)
**Hilos Conectados**: Acceso a Bóveda ↔ Ventana de Entrega ↔ Logística`,
      compareTitle: "ProMapper frente a Bots de Videollamada y Minutas Sueltas",
      compareSubtitle:
        "Por qué los equipos prefieren un mapa vivo en vez de archivos olvidados",
      compareOtherHeader: "Bots / Minutas Sueltas",
      compareOurHeader: "Mesa de Trabajo ProMapper 📋",
      compareRows: [
        {
          feature: "Privacidad en llamada",
          traditional: "Un bot externo entra sin permiso a grabar la llamada",
          promapper:
            "Cero bots: graba desde el navegador o sube el audio al terminar",
        },
        {
          feature: "Continuidad semanal",
          traditional:
            "Cada junta genera otro documento suelto que nadie vuelve a abrir",
          promapper:
            "La siguiente toma se suma al mismo mapa y actualiza los temas activos",
        },
        {
          feature: "Seguimiento de tareas",
          traditional: "Perseguir pendientes a mano entre notas viejas",
          promapper:
            "Los acuerdos se palomean solos cuando otra grabación confirma el avance",
        },
        {
          feature: "Relación entre temas",
          traditional: "Muro de texto cronológico difícil de escanear",
          promapper:
            "Grafo visual interactivo con conexiones claras entre temas",
        },
        {
          feature: "Cuentas y costos",
          traditional:
            "Suscripciones mensuales por usuario y bloqueo en la nube",
          promapper:
            "Local en el navegador, sin cuentas obligatorias y con opción de llave propia (BYOK)",
        },
      ],
      faqTitle: "Preguntas frecuentes sobre juntas y proyectos",
      faqs: [
        {
          question:
            "¿Cómo se palomean solos los pendientes entre una junta y otra?",
          answer:
            "Al sumar una nueva grabación o nota a un mapa existente, ProMapper compara lo dicho con los pendientes abiertos. Si se confirma que una tarea quedó lista, la marca como completada e incluye la cita exacta.",
        },
        {
          question: "¿Necesita meter un bot a Zoom, Google Meet o Teams?",
          answer:
            "No. ProMapper nunca mete bots a calendarios ni videollamadas. Graba directo desde el navegador, abre una sala colaborativa en vivo o sube el archivo de audio después de la plática.",
        },
        {
          question:
            "¿Cómo puede el resto del equipo ver o editar el mismo mapa?",
          answer:
            "El botón Compartir crea un enlace de lectura sin registro, y la opción Sala en Vivo abre un tablero colaborativo en tiempo real para editar temas y pendientes en equipo.",
        },
      ],
      footerCta: "Abrir Tablero de Ejemplo de Junta 📋",
      footerNote:
        "Ideal para juntas semanales de estudio, seguimiento de obra, equipos de diseño y proyectos independientes.",
    },
  },
  research: {
    en: {
      enPath: "/for/research",
      esPath: "/es/investigacion",
      navBadge: "Interviews • Case Files • PhD & Fieldwork",
      kicker: "For Journalists, PhD Researchers, UX Teams & Case Investigators",
      h1: "Map Tangled Interviews & Field Notes Into Connected Case Threads.",
      subtitle:
        "Drop in a multi-speaker interview, PhD supervision session, deposition, or oral history recording. ProMapper lays out who said what, maps how people, places, and claims connect across takes, and surfaces the unasked questions still hiding in the material.",
      ctaDemo: "Explore Sample Case Board: Dusty Gulch Hearing",
      ctaDemoBusy: "Opening Case Board...",
      ctaStart: "Map an Interview or Case",
      pillars: [
        {
          emoji: "🕸️",
          title: "Entity & Theme Graphs",
          body:
            "See witnesses, themes, dates, and disputed claims as connected nodes with typed edges. Drag two nodes together to merge aliases and keep the graph clean.",
        },
        {
          emoji: "🗣️",
          title: "Speaker-Attributed Quotes",
          body:
            "Every turn in the transcript stays color-coded by speaker so quotes, contradictions, and timelines remain verifiable at a glance.",
        },
        {
          emoji: "❓",
          title: "The Unasked Questions Deck",
          body:
            "One-click export that reads the whole interview map and pulls out the gaps, missing corroborations, and follow-up questions for the next sitting.",
        },
        {
          emoji: "🔒",
          title: "Local-First Source Privacy",
          body:
            "Maps live in browser storage on the local machine — never in a shared cloud database. Plug in a personal OpenRouter key (BYOK) for direct API routing.",
        },
      ],
      exportBadge: "Investigative Export Deck",
      exportTitle: "Research Brief & Unasked Questions Generator",
      exportSubtitle:
        "Structured Markdown for Obsidian, Zotero, or Case Binders",
      exportIntro:
        "Beyond standard summaries, ProMapper includes dedicated Research and Unasked Questions export decks designed for field notes and investigative threads:",
      exportSample: `# Field Inquiry — Dusty Gulch Town Hall Hearing
**Primary Voices**: Sheriff Buck, Gardener Mabel, Doc Holloway
**Core Threads**: Prize Pig Incident ↔ Vegetable Perimeter ↔ Medical Clearance
**Verified Findings**:
  - [x] Medical inspection & tetanus clearance completed (Confirmed by Doc Holloway)
**Unasked Follow-Up Questions**:
  - Who authorized Old Man Perkins to access the Henderson livestock pen prior to Tuesday?
  - Where is the written petition consumed during the garden dispute?`,
      compareTitle: "ProMapper vs Heavy QDA Software & Raw Transcripts",
      compareSubtitle:
        "Fast visual synthesis between raw audio and a finished investigative brief",
      compareOtherHeader: "Raw Transcripts / Heavy QDA",
      compareOurHeader: "ProMapper Research Table 🔍",
      compareRows: [
        {
          feature: "Setup Time",
          traditional:
            "Hours configuring codebooks, project files, and enterprise licenses",
          promapper:
            "Zero setup — drop an audio file or paste a transcript in the browser",
        },
        {
          feature: "Multi-Interview Synthesis",
          traditional:
            "Scrolling through 60-page text dumps looking for overlap",
          promapper:
            "Append follow-up interviews to the same map and watch themes cluster",
        },
        {
          feature: "Gap Discovery",
          traditional: "Manual margin notes between sittings",
          promapper:
            "Dedicated 'Unasked Questions' and 'Research Brief' Markdown exports",
        },
        {
          feature: "Node Curation",
          traditional: "Rigid taxonomy trees",
          promapper:
            "Drag-to-merge topic nodes, rename labels, and draw typed relationship edges",
        },
        {
          feature: "Source Confidentiality",
          traditional: "Forced cloud workspace accounts",
          promapper:
            "Local browser storage + JSON backup export + optional BYOK key routing",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question:
            "How does ProMapper handle multiple interviews on the same research topic?",
          answer:
            "Each new interview recording or transcript can be appended to the same board. ProMapper folds new speakers, themes, and follow-up items into the existing graph while remembering merged nodes.",
        },
        {
          question: "Where are interview transcripts and research maps stored?",
          answer:
            "Maps are stored locally in the browser's IndexedDB and localStorage. Nothing is saved to a central cloud database unless a share link or live room is explicitly created, and full JSON backups export anytime.",
        },
        {
          question: "What is the Unasked Questions export format?",
          answer:
            "It is one of ProMapper's 8 built-in Markdown export decks. It analyzes the transcript, summary, and topic graph to highlight blind spots, unverified claims, and concrete follow-up questions for the next interview.",
        },
      ],
      footerCta: "Explore Sample Case Board 🔍",
      footerNote:
        "Used for journalism, UX user research, oral histories, documentary prep, academic fieldwork, and case analysis.",
    },
    es: {
      enPath: "/for/research",
      esPath: "/es/investigacion",
      navBadge: "Entrevistas • Casos • Preguntas Pendientes",
      kicker: "Para Periodistas, Investigadores y Trabajo de Campo",
      h1:
        "Convierte Entrevistas y Trabajo de Campo en Mapas de Hilos Conectados.",
      subtitle:
        "Sube una entrevista con varias voces, un testimonio o notas de campo. ProMapper separa quién dijo qué, dibuja cómo se conectan personas, lugares y versiones, y revela las preguntas que faltaron por hacer.",
      ctaDemo: "Ver Caso de Ejemplo: Audiencia en Dusty Gulch",
      ctaDemoBusy: "Abriendo Caso...",
      ctaStart: "Mapear Entrevista o Caso",
      pillars: [
        {
          emoji: "🕸️",
          title: "Grafo de Personas y Temas",
          body:
            "Visualiza testigos, temas, fechas y versiones como nodos conectados. Arrastra un nodo sobre otro para fusionar alias y mantener limpio el mapa.",
        },
        {
          emoji: "🗣️",
          title: "Transcripción por Hablante",
          body:
            "Cada intervención conserva su color y atribución para contrastar citas, líneas de tiempo y declaraciones de un vistazo.",
        },
        {
          emoji: "❓",
          title: "Mazo de Preguntas No Hechas",
          body:
            "Un formato de exportación que revisa todo el mapa para detectar huecos, cabos sueltos y preguntas clave para la siguiente entrevista.",
        },
        {
          emoji: "🔒",
          title: "Privacidad Local para Fuentes",
          body:
            "Los mapas viven en el navegador del equipo local, sin cuentas en la nube. Permite conectar una llave propia de OpenRouter (BYOK).",
        },
      ],
      exportBadge: "Exportación de Investigación",
      exportTitle: "Reporte de Investigación y Preguntas Pendientes en 1 Clic",
      exportSubtitle: "Markdown listo para Obsidian, Zotero o carpetas de caso",
      exportIntro:
        "Además de resúmenes ejecutivos, ProMapper incluye formatos dedicados de Investigación y Preguntas No Hechas pensados para análisis de campo:",
      exportSample: `# Informe de Campo — Audiencia Vecinal de Dusty Gulch
**Voces Principales**: Sheriff Buck, Mabel (Jardinera), Doc Holloway
**Hilos Centrales**: Incidente del Cerdo Premiado ↔ Cerco de Hortalizas ↔ Alta Médica
**Hechos Verificados**:
  - [x] Revisión médica y vacuna antitetánica aplicada (Confirmado por Doc Holloway)
**Preguntas Pendientes para Seguimiento**:
  - ¿Quién autorizó a Perkins a abrir el corral antes del martes?
  - ¿Dónde quedó la petición escrita mencionada al inicio de la disputa?`,
      compareTitle:
        "ProMapper frente a Software Pesado y Transcripciones en Bruto",
      compareSubtitle:
        "Síntesis visual rápida entre el audio crudo y el informe final",
      compareOtherHeader: "Texto Crudo / Software Pesado",
      compareOurHeader: "Mesa de Investigación ProMapper 🔍",
      compareRows: [
        {
          feature: "Tiempo de arranque",
          traditional:
            "Horas configurando licencias, proyectos y categorías rígidas",
          promapper:
            "Cero configuración: entra el archivo de audio o texto directo en el navegador",
        },
        {
          feature: "Varias entrevistas",
          traditional: "Buscar coincidencias a mano entre decenas de páginas",
          promapper:
            "Suma nuevas entrevistas al mismo mapa y observa cómo se agrupan los temas",
        },
        {
          feature: "Detección de cabos sueltos",
          traditional: "Notas al margen hechas a prisa",
          promapper:
            "Exportación directa de 'Preguntas No Hechas' y 'Reporte de Investigación'",
        },
        {
          feature: "Curaduría del mapa",
          traditional: "Árboles estáticos difíciles de reorganizar",
          promapper:
            "Arrastra nodos para fusionarlos, renombra temas y traza conexiones con motivo",
        },
        {
          feature: "Resguardo de información",
          traditional: "Cuentas corporativas obligatorias en servidores ajenos",
          promapper:
            "Almacenamiento local en navegador + respaldo JSON + llave propia (BYOK)",
        },
      ],
      faqTitle: "Preguntas frecuentes sobre investigación y entrevistas",
      faqs: [
        {
          question:
            "¿Cómo se conectan varias entrevistas de una misma investigación?",
          answer:
            "Cada nueva grabación o transcripción se puede sumar al mismo tablero. ProMapper integra nuevos hablantes, temas y hallazgos respetando los nodos que ya fueron fusionados.",
        },
        {
          question: "¿Dónde se guardan las transcripciones y mapas de trabajo?",
          answer:
            "Todo se guarda localmente en el navegador (IndexedDB y localStorage). Nada sube a una base de datos central a menos que se genere un enlace para compartir, y se puede descargar un respaldo JSON completo en cualquier momento.",
        },
        {
          question:
            "¿Qué incluye el formato de exportación de Preguntas No Hechas?",
          answer:
            "Es uno de los 8 formatos Markdown integrados. Analiza la transcripción y el mapa de temas para señalar huecos en el relato, datos por corroborar y preguntas sugeridas para la siguiente sesión.",
        },
      ],
      footerCta: "Explorar Caso de Ejemplo 🔍",
      footerNote:
        "Hecho para periodismo, investigación cualitativa, diseño UX, historia oral, documentales y análisis de casos.",
    },
  },
  brainstorming: {
    en: {
      enPath: "/for/brainstorming",
      esPath: "/es/ideas",
      navBadge: "Voice Notes • ADHD & Spatial Minds • Rants to Plans",
      kicker:
        "For Solo Builders, Writers, ADHD Brains & Nonlinear Visual Thinkers",
      h1: "Turn 10-Minute Voice Rants Into Living Mind Maps & Plans.",
      subtitle:
        "Speak freely while pacing the room or paste a tangled page of notes. Built for nonlinear and spatial thinkers, ProMapper catches every thread, clusters ideas into an interactive emoji constellation, pulls out concrete next steps, and turns the whole ramble into a clean outline.",
      ctaDemo: "Explore Sample Brainstorm: Obsidian Spire Logistics",
      ctaDemoBusy: "Opening Brainstorm Map...",
      ctaStart: "Record a Voice Note",
      pillars: [
        {
          emoji: "🎙️",
          title: "Ramble-Friendly Recording",
          body:
            "No need to speak in bullet points. Jump between tangents, double back, and think out loud — the map untangles the structure afterwards.",
        },
        {
          emoji: "✨",
          title: "Visual Topic Constellations",
          body:
            "Watch scattered ideas snap into emoji nodes and relationship links. Drag related thoughts together to merge them into a single pillar.",
        },
        {
          emoji: "🧭",
          title: "Next Steps Extracted",
          body:
            "Half-formed intentions ('need to check the synth patch tomorrow') become clear action items with color-coded priority dots.",
        },
        {
          emoji: "📝",
          title: "From Rant to Finished Draft",
          body:
            "Export the board as a structured Project Plan, Slide Outline, Custom Prompt deliverable, or even a distilled Haiku.",
        },
      ],
      exportBadge: "Creative Export Deck",
      exportTitle: "Voice Ramble to Structured Outline in 1 Click",
      exportSubtitle: "Ready for Obsidian, Apple Notes, or Markdown editors",
      exportIntro:
        "A ten-minute voice walk turns into a structured, readable plan without losing the voice or texture of the original thought:",
      exportSample: `# Obsidian Spire Renovation & Blood Moon Prep
**Core Threads**: Spire Heating ↔ Trapdoor Budget ↔ Familiar Union Demands
**Resolved on This Walk**:
  - [x] Cancel lava moat contractor quote (Settled: switching to illusion ward)
**Next Actions**:
  - [ ] Order weather-stripping for the east belfry (@Malakor · before equinox)
  - [ ] Draft new scheduling rota for night-shift gargoyles (@Igor · Friday)
**Distilled Haiku**:
Cold stone drafts above / Gargoyles demand heated perches / Budget melts like wax`,
      compareTitle: "ProMapper vs Voice Memo Graveyards & Blank Canvases",
      compareSubtitle:
        "Why visual thinkers talk into a self-organizing table instead of staring at empty boxes",
      compareOtherHeader: "Voice Memos / Blank Canvas",
      compareOurHeader: "ProMapper Idea Table 🎙️",
      compareRows: [
        {
          feature: "Starting Friction",
          traditional:
            "Staring at a blank white canvas drawing boxes and arrows by hand",
          promapper:
            "Hit record and talk — the constellation draws itself from speech",
        },
        {
          feature: "Old Voice Notes",
          traditional:
            "Hundreds of untitled 'New Recording 47.m4a' files never played back",
          promapper:
            "Titled, summarized, searchable boards with visual topic maps",
        },
        {
          feature: " evolving Ideas",
          traditional:
            "Starting a brand-new note every time inspiration strikes",
          promapper:
            "Hit Add Take on the same board as the idea grows over days or weeks",
        },
        {
          feature: "Crash Resilience",
          traditional:
            "Browser tab closes mid-thought and the recording vanishes",
          promapper:
            "Chunk-by-chunk local take journal recovers interrupted recordings on reopen",
        },
        {
          feature: "Export Flexibility",
          traditional: "Locked inside a proprietary mind-map file format",
          promapper:
            "8 Markdown export decks (Plan, Summary, Research, Haiku, Custom)",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question:
            "How does ProMapper turn a messy voice note into a structured map?",
          answer:
            "Record directly in the browser or drop in an audio file from a phone. ProMapper transcribes the speech, extracts the core themes and how they relate into a force-directed graph, and pulls out concrete action items.",
        },
        {
          question:
            "What happens if the browser closes during a long voice note?",
          answer:
            "ProMapper journals audio chunks locally in IndexedDB as the recording runs. If a tab closes or a phone battery dies mid-take, reopening the app offers to recover and map the interrupted recording.",
        },
        {
          question:
            "Can new thoughts be added to the same brainstorm map later?",
          answer:
            "Yes. Open any saved board from History and record or paste a follow-up take. New ideas weave into the existing topic map and completed tasks check themselves off.",
        },
      ],
      footerCta: "Explore Sample Brainstorm Map 🎙️",
      footerNote:
        "Built for solo founders, fiction writers, filmmakers, synth tinkerers, and anyone who thinks best out loud.",
    },
    es: {
      enPath: "/for/brainstorming",
      esPath: "/es/ideas",
      navBadge: "Notas de Voz • Lluvia de Ideas • Mapas Mentales",
      kicker: "Para Creadores, Escritores y Personas que Piensan en Voz Alta",
      h1: "Convierte Notas de Voz y Rollos Largos en Mapas Mentales Vivos.",
      subtitle:
        "Habla libremente mientras caminas o pega una página de notas desordenadas. ProMapper atrapa cada hilo, agrupa las ideas en una constelación visual con emojis, saca los siguientes pasos y transforma el rollo en un plan claro.",
      ctaDemo: "Ver Mapa de Ejemplo: Logística de la Torre de Obsidiana",
      ctaDemoBusy: "Abriendo Mapa de Ideas...",
      ctaStart: "Grabar Nota de Voz",
      pillars: [
        {
          emoji: "🎙️",
          title: "Habla sin Guion",
          body:
            "Sin necesidad de hablar como robot. Salta de una idea a otra, regresa y piensa en voz alta: el tablero desenreda la estructura al terminar.",
        },
        {
          emoji: "✨",
          title: "Constelaciones Visuales",
          body:
            "Las ideas sueltas toman forma de nodos con emojis y conexiones claras. Arrastra dos ideas parecidas para fusionarlas en un solo eje.",
        },
        {
          emoji: "🧭",
          title: "Siguientes Pasos Claros",
          body:
            "Las intenciones al vuelo ('mañana hay que probar el sintetizador') se vuelven tareas concretas con puntos de color por prioridad.",
        },
        {
          emoji: "📝",
          title: "Del Audio al Borrador Final",
          body:
            "Exporta el tablero como Plan de Proyecto, Estructura de Presentación, Formato Personalizado o incluso un Haiku en un clic.",
        },
      ],
      exportBadge: "Exportación Creativa",
      exportTitle: "De Nota de Voz a Esquema Estructurado en 1 Clic",
      exportSubtitle:
        "Listo para Obsidian, Apple Notes o cualquier editor Markdown",
      exportIntro:
        "Una caminata de diez minutos hablando al micrófono se convierte en un plan legible sin perder la chispa de la idea original:",
      exportSample: `# Remodelación de la Torre de Obsidiana y Luna Roja
**Hilos Centrales**: Calefacción de la Torre ↔ Presupuesto de Trampas ↔ Sindicato de Gárgolas
**Resuelto en esta toma**:
  - [x] Cancelar cotización del foso de lava (Resuelto: se usará sello ilusorio)
**Siguientes Pasos**:
  - [ ] Pedir aislamiento para el campanario este (@Malakor · antes del equinoccio)
  - [ ] Armar rol de guardia nocturna para las gárgolas (@Igor · viernes)
**Haiku Destilado**:
Piedra fría arriba / Las gárgolas piden fuego / Cera en el papel`,
      compareTitle:
        "ProMapper frente al Cementerio de Notas de Voz y el Lienzo en Blanco",
      compareSubtitle:
        "Por qué quienes piensan mejor hablando prefieren una mesa que se acomoda sola",
      compareOtherHeader: "Notas de Voz / Lienzo Vacío",
      compareOurHeader: "Mesa de Ideas ProMapper 🎙️",
      compareRows: [
        {
          feature: "Fricción al empezar",
          traditional:
            "Quedarse viendo una pantalla en blanco dibujando cajitas y flechas a mano",
          promapper:
            "Toca grabar y suelta la idea: el mapa se traza solo a partir de la voz",
        },
        {
          feature: "Audios acumulados",
          traditional:
            "Cientos de archivos 'Grabación 47.m4a' que nadie vuelve a escuchar",
          promapper:
            "Tableros con título, resumen, buscador y mapa visual de temas",
        },
        {
          feature: "Ideas que evolucionan",
          traditional:
            "Empezar una nota nueva desde cero cada vez que surge algo",
          promapper:
            "Suma otra toma al mismo tablero conforme el proyecto crece",
        },
        {
          feature: "Recuperación ante fallos",
          traditional:
            "Si se cierra la pestaña a mitad de audio se pierde todo",
          promapper:
            "Bitácora local por fragmentos que recupera grabaciones interrumpidas al volver",
        },
        {
          feature: "Formatos de salida",
          traditional: "Encerrado en un archivo propietario de mapas mentales",
          promapper:
            "8 formatos de exportación en Markdown (Plan, Resumen, Investigación, Haiku)",
        },
      ],
      faqTitle: "Preguntas frecuentes sobre notas de voz y lluvia de ideas",
      faqs: [
        {
          question:
            "¿Cómo convierte ProMapper una nota de voz larga en un mapa ordenado?",
          answer:
            "Graba directo en el navegador o sube un audio desde el celular. ProMapper transcribe la voz, conecta los temas principales en un grafo interactivo y extrae los siguientes pasos.",
        },
        {
          question:
            "¿Qué pasa si se cierra el navegador a mitad de una grabación?",
          answer:
            "ProMapper guarda fragmentos del audio en la memoria local del navegador mientras corre la toma. Si la pestaña se cierra por accidente, al reabrir ofrece recuperar la toma y mapearla.",
        },
        {
          question: "¿Se pueden agregar más ideas al mismo mapa días después?",
          answer:
            "Sí. Abre cualquier mapa guardado en el Historial y graba o pega una nueva toma. Las ideas nuevas se tejen en el mapa existente y los pendientes cumplidos se palomean solos.",
        },
      ],
      footerCta: "Ver Mapa de Ideas de Ejemplo 🎙️",
      footerNote:
        "Ideal para mentes visuales y no lineales (TDAH), proyectos personales, guionistas, músicos y cualquiera que piense mejor en voz alta.",
    },
  },
  clients: {
    en: {
      enPath: "/for/clients",
      esPath: "/es/clientes",
      navBadge: "Client Sessions • Coaching • 1-Click PDF Recaps",
      kicker:
        "For Coaches, Consultants, Freelancers, Tutors & Client-Facing Pros",
      h1: "Client Session Notes Where Milestones Tick Themselves Off.",
      subtitle:
        "Record a coaching call, discovery session, or tutoring hour without a creepy calendar bot joining the room. ProMapper maps client goals into a living visual board, ticks off homework in the next session, and exports a 1-click PDF or presentation deck before the next call starts.",
      ctaDemo: "Open Sample Client Strategy Board",
      ctaDemoBusy: "Opening Client Board...",
      ctaStart: "Map a Client Session",
      pillars: [
        {
          emoji: "🤝",
          title: "One Living Board Per Client",
          body:
            "Every follow-up session appends into the same client map. Past breakthroughs, recurring roadblocks, and long-term milestones stay connected on one canvas.",
        },
        {
          emoji: "✅",
          title: "Homework Ticks Itself Off",
          body:
            "Commitments and client deliverables carry owners and timeframes. When the next session confirms completion, the board checks the item off with the exact quote.",
        },
        {
          emoji: "🖨️",
          title: "1-Click PDF & Slide Deck",
          body:
            "Open the Export Drawer to hand the client a styled printable PDF recap, a 6–9 slide presentation deck (Slide-O-Matic), or a read-only share link in seconds.",
        },
        {
          emoji: "🎨",
          title: "Live Room & Sketchboard",
          body:
            "Invite clients into a live collaborative room with built-in voice chat and flip the Topic Map card over to a shared Excalidraw whiteboard to sketch frameworks together.",
        },
      ],
      exportBadge: "Client Deliverable Deck",
      exportTitle: "1-Click Client Recap PDF, Plan & Presentation Deck",
      exportSubtitle: "Styled PDF, Slide-O-Matic HTML Deck, or clean Markdown",
      exportIntro:
        "Finish a 50-minute session and hand over a polished deliverable immediately — complete with completed milestones, next steps, and connected themes:",
      exportSample: `# Client Strategy Session #4 — Q3 Launch & Positioning
**Voices**: Coach Maya, Alex (Founder)
**Completed Since Session #3**:
  - [x] Interview 5 beta customers on onboarding friction (Checked off: completed Tuesday)
**Next Session Homework**:
  - [ ] Ship revised pricing page with 2-tier pass (@Alex · before Friday)
  - [ ] Draft 3 outreach templates for warm leads (@Maya · Wednesday)
**Connected Threads**: Pricing Clarity ↔ Beta Feedback ↔ Launch Window`,
      compareTitle: "ProMapper vs Uninvited Call Bots & Forgotten Google Docs",
      compareSubtitle:
        "Why independent consultants and coaches run client sessions on a living visual table",
      compareOtherHeader: "Call Bots / Static Docs",
      compareOurHeader: "ProMapper Client Table 🤝",
      compareRows: [
        {
          feature: "Client Trust",
          traditional:
            "A third-party recording bot barges into a sensitive coaching or consulting call",
          promapper:
            "Zero call bots — capture from the browser tab or use On-Device Whisper local audio",
        },
        {
          feature: "Session-to-Session Memory",
          traditional:
            "Digging through 12 separate Google Docs five minutes before the call",
          promapper:
            "Append every session into one continuous client map with cumulative history",
        },
        {
          feature: "Post-Session Deliverable",
          traditional: "30 minutes of unpaid admin typing up follow-up emails",
          promapper:
            "1-click Styled PDF, Slide-O-Matic presentation deck, or read-only client link",
        },
        {
          feature: "Visual Frameworks",
          traditional: "Switching between Zoom, Miro, and a notes app",
          promapper:
            "Flip the Topic Map card over to a shared Excalidraw sketchboard in the same room",
        },
        {
          feature: "Pricing & Privacy",
          traditional: "Expensive monthly SaaS subscriptions per seat",
          promapper:
            "Local-first storage, $49/yr Solo Pass or $99/yr Practice Pass, optional BYOK",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question:
            "How does ProMapper track client progress across multiple sessions?",
          answer:
            "Open the client's saved board and click Add Take for each new session. ProMapper weaves new topics into the existing map and automatically checks off homework items confirmed as complete during the conversation.",
        },
        {
          question:
            "Can a client receive a clean recap without creating an account?",
          answer:
            "Yes. Export a styled printable PDF, generate a standalone Slide-O-Matic presentation deck, or send a compressed read-only share link that opens in any browser with zero signups.",
        },
        {
          question:
            "Is there a private local audio mode for sensitive client sessions?",
          answer:
            "Yes. Supporter Passes and BYOK include an On-Device Whisper mode that transcribes audio directly inside the browser via WebAssembly so raw voice audio never leaves the machine.",
        },
      ],
      footerCta: "Open Sample Client Strategy Board 🤝",
      footerNote:
        "Built for executive coaches, ADHD & life coaches, freelance consultants, agencies, and private tutors.",
    },
    es: {
      enPath: "/for/clients",
      esPath: "/es/clientes",
      navBadge: "Clientes • Coaching • PDF y Presentaciones en 1 Clic",
      kicker: "Para Coaches, Consultores, Freelancers, Tutores y Asesorías",
      h1: "Notas de Sesiones con Clientes Donde los Avances se Palomean Solos.",
      subtitle:
        "Graba una sesión de coaching, consultoría o tutoría sin meter bots incómodos a la llamada. ProMapper convierte los objetivos del cliente en un mapa visual vivo, palomea las tareas cumplidas en la siguiente cita y exporta un PDF o presentación lista para entregar en segundos.",
      ctaDemo: "Ver Tablero de Ejemplo de Consultoría",
      ctaDemoBusy: "Abriendo Tablero...",
      ctaStart: "Mapear Sesión con Cliente",
      pillars: [
        {
          emoji: "🤝",
          title: "Un Mapa Vivo por Cliente",
          body:
            "Cada sesión de seguimiento se suma al mismo tablero del cliente. Los avances, bloqueos y metas de largo plazo permanecen conectados en un solo lienzo.",
        },
        {
          emoji: "✅",
          title: "Tareas que se Palomean Solas",
          body:
            "Los compromisos guardan responsable y fecha. Cuando en la siguiente sesión se confirma que algo quedó listo, el tablero lo marca completado con la cita exacta.",
        },
        {
          emoji: "🖨️",
          title: "PDF y Diapositivas en 1 Clic",
          body:
            "Abre el cajón de exportación para entregar un PDF con diseño, una presentación de 6 a 9 diapositivas (Slide-O-Matic) o un enlace de lectura sin registro.",
        },
        {
          emoji: "🎨",
          title: "Sala en Vivo y Pizarrón",
          body:
            "Invita al cliente a una sala colaborativa con voz integrada y voltea el mapa para dibujar esquemas juntos en el pizarrón Excalidraw compartido.",
        },
      ],
      exportBadge: "Entregable para Clientes",
      exportTitle: "Resumen en PDF, Plan de Acción y Presentación en 1 Clic",
      exportSubtitle:
        "PDF listo para imprimir, presentación Slide-O-Matic o Markdown",
      exportIntro:
        "Termina una sesión de 50 minutos y entrega un resumen impecable al instante con logros completados, siguientes pasos y temas conectados:",
      exportSample:
        `# Sesión de Estrategia #4 — Lanzamiento y Posicionamiento Q3
**Voces**: Coach Maya, Alex (Fundador)
**Completado desde la Sesión #3**:
  - [x] Entrevistar a 5 clientes beta sobre fricción de registro (Palomeado: completado el martes)
**Tareas para la Siguiente Sesión**:
  - [ ] Publicar nueva página de precios con 2 niveles (@Alex · antes del viernes)
  - [ ] Redactar 3 plantillas de contacto para prospectos (@Maya · miércoles)
**Hilos Conectados**: Claridad de Precios ↔ Feedback Beta ↔ Ventana de Lanzamiento`,
      compareTitle:
        "ProMapper frente a Bots de Videollamada y Documentos Sueltos",
      compareSubtitle:
        "Por qué consultores y coaches llevan el seguimiento de clientes en un tablero visual vivo",
      compareOtherHeader: "Bots / Docs Sueltos",
      compareOurHeader: "Mesa de Clientes ProMapper 🤝",
      compareRows: [
        {
          feature: "Confianza en sesión",
          traditional:
            "Un bot externo entra a grabar una plática privada de coaching o asesoría",
          promapper:
            "Cero bots: graba desde el navegador o usa transcripción local Whisper en el equipo",
        },
        {
          feature: "Memoria entre sesiones",
          traditional:
            "Buscar entre 12 documentos viejos cinco minutos antes de la cita",
          promapper:
            "Cada sesión se suma al mismo mapa del cliente con historial acumulado",
        },
        {
          feature: "Entregable al terminar",
          traditional: "Media hora redactando correos de resumen sin cobrar",
          promapper:
            "PDF con diseño, presentación Slide-O-Matic o enlace directo en un clic",
        },
        {
          feature: "Pizarrón visual",
          traditional: "Cambiar entre Zoom, Miro y un bloc de notas",
          promapper:
            "Voltea la tarjeta del mapa para usar el pizarrón Excalidraw en la misma sala",
        },
        {
          feature: "Costo y privacidad",
          traditional: "Suscripciones mensuales caras por usuario",
          promapper:
            "Almacenamiento local, Pase Individual ($49 AUD/año) o Pase de Práctica ($99 AUD/año)",
        },
      ],
      faqTitle: "Preguntas frecuentes sobre sesiones con clientes",
      faqs: [
        {
          question:
            "¿Cómo lleva ProMapper el seguimiento de un cliente a lo largo de varias citas?",
          answer:
            "Abre el tablero guardado del cliente y suma una nueva toma en cada sesión. ProMapper conecta los temas nuevos en el mismo mapa y palomea en automático las tareas que se confirman como cumplidas.",
        },
        {
          question:
            "¿Se puede compartir un resumen con el cliente sin que cree una cuenta?",
          answer:
            "Sí. Exporta un PDF listo para imprimir, genera una presentación de diapositivas Slide-O-Matic o envía un enlace de lectura que abre en cualquier celular o computadora sin registro.",
        },
        {
          question:
            "¿Existe un modo de audio privado en el dispositivo para consultas sensibles?",
          answer:
            "Sí. Los Pases de Soporte y el modo BYOK incluyen transcripción local con Whisper directamente en el navegador mediante WebAssembly para que el audio nunca salga del equipo.",
        },
      ],
      footerCta: "Abrir Tablero de Ejemplo de Clientes 🤝",
      footerNote:
        "Diseñado para coaches ejecutivos, consultores independientes, agencias, mentores y tutores.",
    },
  },
  care: {
    en: {
      enPath: "/for/care",
      esPath: "/es/consultas",
      navBadge: "Doctor Visits • Pediatrics • Family Care Maps",
      kicker:
        "For Parents at the Pediatrician, Specialist Visits, Therapy & Caregivers",
      h1: "Turn Fast Doctor & Pediatrician Visits Into Clear Family Care Maps.",
      subtitle:
        "Medical and specialist appointments move fast when holding a child or processing a diagnosis. Record or drop in visit notes — ProMapper extracts instructions, medication schedules, connected symptoms, and the unasked questions for the next appointment, ready to share with family as a link or printed PDF.",
      ctaDemo: "Explore Sample Care & Clearance Board",
      ctaDemoBusy: "Opening Care Board...",
      ctaStart: "Map a Care Visit",
      pillars: [
        {
          emoji: "🩺",
          title: "Dosages & Care Steps Extracted",
          body:
            "Instructions mentioned mid-conversation ('give 5ml every 8 hours until Friday, book bloodwork in two weeks') become clear action items with timeframes.",
        },
        {
          emoji: "❓",
          title: "Unasked Questions for Follow-Up",
          body:
            "The built-in Unasked Questions export scans the visit map and surfaces the follow-up questions to ask the pediatrician or specialist at the next check-up.",
        },
        {
          emoji: "👨‍👩‍👧",
          title: "1-Click Family Share & PDF",
          body:
            "Send a read-only care board link to a partner, co-parent, or grandparent, or print a clean 1-click PDF summary for the fridge or medical binder.",
        },
        {
          emoji: "🔒",
          title: "On-Device Whisper Privacy",
          body:
            "Keep sensitive family health conversations local in browser storage, with optional On-Device Whisper transcription so raw audio stays on the device.",
        },
      ],
      exportBadge: "Family Care Export Deck",
      exportTitle: "1-Click Care Plan PDF & Unasked Questions Checklist",
      exportSubtitle:
        "Printable PDF for the medical binder or instant link for family",
      exportIntro:
        "Instead of trying to remember everything the specialist said in a 15-minute slot, turn the visit into a clear, shareable care sheet:",
      exportSample: `# Pediatric & Care Follow-Up — Clearance & Next Steps
**Voices**: Doc Holloway, Parent / Caregiver
**Completed at Today's Visit**:
  - [x] Physical examination & tetanus booster clearance (Confirmed by Doc Holloway)
**Care Plan & Next Steps**:
  - [ ] Monitor temperature every 8 hours for 48h (@Family · this week)
  - [ ] Bring updated symptom log to 2-week follow-up (@Caregiver · next Tuesday)
**Questions for Next Visit**:
  - Should the dosage adjust if appetite returns before Friday?`,
      compareTitle:
        "ProMapper vs Scribbled Waiting-Room Notes & Memory Overload",
      compareSubtitle:
        "Built for parents, neurodivergent patients, speech/OT sessions, and family caregivers",
      compareOtherHeader: "Memory / Paper Scraps",
      compareOurHeader: "ProMapper Care Table 🩺",
      compareRows: [
        {
          feature: "During the Appointment",
          traditional:
            "Trying to comfort a child and scribble medical terms at the same time",
          promapper:
            "Stay present in the room while the board captures every step and timeline",
        },
        {
          feature: "Updating Family",
          traditional:
            "Retyping long text messages to partners and grandparents from memory",
          promapper:
            "1-click read-only share link or printable PDF care summary",
        },
        {
          feature: "Multi-Visit History",
          traditional:
            "Scattered notes across portals, paper folders, and phone memos",
          promapper:
            "Append each follow-up visit to the same care board so completed steps tick off",
        },
        {
          feature: "Preparing Next Visit",
          traditional: "Forgetting what to ask until walking out to the car",
          promapper:
            "Dedicated 'Unasked Questions' deck generates a checklist for the next visit",
        },
        {
          feature: "Health Data Privacy",
          traditional: "Cloud accounts that harvest personal profile data",
          promapper:
            "Local-first browser storage + On-Device Whisper local audio transcription",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question:
            "How does ProMapper help during a pediatrician or specialist visit?",
          answer:
            "Record the visit audio (with the clinician's permission) or record a quick voice debrief right after walking out. ProMapper turns the conversation into a clear care checklist, symptom map, and printable PDF.",
        },
        {
          question:
            "How can a care plan be shared with a partner or family member?",
          answer:
            "Click Share to send a read-only board link that opens on any phone without an account, or open the Export Drawer to save a clean, printable PDF.",
        },
        {
          question:
            "Can audio stay completely on the device for sensitive appointments?",
          answer:
            "Yes. Enabling On-Device Whisper mode runs speech-to-text locally inside the browser via WebAssembly so raw voice recordings never upload to a cloud transcription server.",
        },
      ],
      footerCta: "Explore Sample Care & Clearance Board 🩺",
      footerNote:
        "Designed for pediatric visits, specialist consultations, speech & occupational therapy homework, elder care coordination, and neurodivergent patient advocacy.",
    },
    es: {
      enPath: "/for/care",
      esPath: "/es/consultas",
      navBadge: "Pediatra • Consultas Médicas • Cuidado Familiar",
      kicker:
        "Para Visitas al Pediatra, Especialistas, Terapias y Cuidado Familiar",
      h1:
        "Convierte Consultas Médicas y Visitas al Pediatra en Mapas de Cuidado Claros.",
      subtitle:
        "Las consultas médicas pasan rápido cuando se tiene a un niño en brazos o se recibe mucha información de golpe. Graba o anota lo dicho en consulta: ProMapper extrae indicaciones, horarios, síntomas conectados y las preguntas pendientes para la siguiente cita en un PDF o enlace listo para la familia.",
      ctaDemo: "Ver Tablero de Ejemplo de Consulta",
      ctaDemoBusy: "Abriendo Tablero...",
      ctaStart: "Mapear una Consulta",
      pillars: [
        {
          emoji: "🩺",
          title: "Indicaciones y Horarios Claros",
          body:
            "Las instrucciones dichas al vuelo ('5 ml cada 8 horas hasta el viernes, agendar estudios en dos semanas') se convierten en pasos claros con fechas.",
        },
        {
          emoji: "❓",
          title: "Preguntas para la Siguiente Cita",
          body:
            "El formato de Preguntas No Hechas revisa el mapa de la consulta y sugiere qué preguntar al pediatra o especialista en la próxima revisión.",
        },
        {
          emoji: "👨‍👩‍👧",
          title: "PDF y Enlace para la Familia",
          body:
            "Envía un enlace de lectura a la pareja o abuelos sin que creen cuenta, o imprime un resumen en PDF en 1 clic para la carpeta médica.",
        },
        {
          emoji: "🔒",
          title: "Privacidad con Whisper Local",
          body:
            "Los mapas se guardan localmente en el navegador e incluyen modo Whisper en el dispositivo para transcribir sin subir el audio a servidores externos.",
        },
      ],
      exportBadge: "Hoja de Cuidado Familiar",
      exportTitle: "Plan de Cuidado en PDF y Lista de Preguntas en 1 Clic",
      exportSubtitle:
        "PDF imprimible para la carpeta médica o enlace directo para la familia",
      exportIntro:
        "En lugar de intentar recordar cada detalle de una consulta de 15 minutos, transforma la visita en una hoja de seguimiento clara y compartible:",
      exportSample:
        `# Seguimiento Pediátrico y Médico — Indicaciones y Próximos Pasos
**Voces**: Doc Holloway, Familia / Cuidador
**Completado en la Consulta**:
  - [x] Revisión general y refuerzo de vacuna aplicado (Confirmado por Doc Holloway)
**Plan de Cuidado en Casa**:
  - [ ] Registrar temperatura cada 8 horas durante 48h (@Familia · esta semana)
  - [ ] Llevar bitácora de síntomas a la revisión de 2 semanas (@Cuidador · próximo martes)
**Preguntas para la Siguiente Cita**:
  - ¿Se ajusta la dosis si mejora el apetito antes del viernes?`,
      compareTitle: "ProMapper frente a Recetas Sueltas y Notas a Prisa",
      compareSubtitle:
        "Pensado para madres, padres, pacientes neurodivergentes, terapias de lenguaje y cuidadores",
      compareOtherHeader: "Memoria / Notas Sueltas",
      compareOurHeader: "Mesa de Cuidado ProMapper 🩺",
      compareRows: [
        {
          feature: "Durante la consulta",
          traditional:
            "Intentar calmar a un niño y anotar términos médicos al mismo tiempo",
          promapper:
            "Atención plena en la consulta mientras el tablero organiza cada indicación",
        },
        {
          feature: "Avisar a la familia",
          traditional:
            "Escribir mensajes largos de memoria por WhatsApp al salir",
          promapper:
            "Enlace directo de lectura o resumen en PDF listo para compartir en 1 clic",
        },
        {
          feature: "Historial de citas",
          traditional: "Papeles y notas dispersas entre varias carpetas",
          promapper:
            "Suma cada consulta de seguimiento al mismo mapa y palomea los pasos cumplidos",
        },
        {
          feature: "Preparar la próxima cita",
          traditional: "Recordar las dudas cuando ya se salió del consultorio",
          promapper:
            "El mazo de 'Preguntas No Hechas' arma la lista de dudas para la siguiente visita",
        },
        {
          feature: "Privacidad familiar",
          traditional:
            "Aplicaciones en la nube que piden crear cuentas y perfiles",
          promapper:
            "Almacenamiento local en el navegador + transcripción Whisper en el dispositivo",
        },
      ],
      faqTitle:
        "Preguntas frecuentes sobre consultas médicas y cuidado familiar",
      faqs: [
        {
          question:
            "¿Cómo ayuda ProMapper en una visita al pediatra o especialista?",
          answer:
            "Permite grabar la consulta (con autorización médica) o grabar un resumen de voz al salir del consultorio. ProMapper convierte la plática en una lista clara de cuidados, mapa de síntomas y PDF imprimible.",
        },
        {
          question:
            "¿Cómo se comparte el plan de cuidado con la pareja o familia?",
          answer:
            "El botón Compartir crea un enlace de lectura que abre en cualquier celular sin cuenta, y el cajón de exportación genera un PDF limpio listo para imprimir.",
        },
        {
          question:
            "¿El audio puede procesarse de forma privada dentro del dispositivo?",
          answer:
            "Sí. Al activar el modo Whisper en el dispositivo, la voz se transcribe localmente dentro del navegador mediante WebAssembly sin subir el archivo de audio a la nube.",
        },
      ],
      footerCta: "Ver Tablero de Ejemplo de Consulta 🩺",
      footerNote:
        "Ideal para pediatría, consultas con especialistas, terapia de lenguaje y ocupacional, cuidado de adultos mayores y acompañamiento médico.",
    },
  },
  schools: {
    en: {
      enPath: "/for/schools",
      esPath: "/es/escuelas",
      navBadge: "Schools • IEP Conferences • Uni Research Labs",
      kicker:
        "For Teachers, IEP & Parent Conferences, Uni Research Labs & Study Groups",
      h1:
        "Turn Lectures, Lab Meetings & IEP Conferences Into Shared Visual Maps.",
      subtitle:
        "From 2-hour university seminars and PhD lab meetings to parent-teacher and IEP conferences: ProMapper maps every speaker, links concepts into an interactive visual graph, and exports a 6–9 slide presentation deck or printable PDF in one click.",
      ctaDemo: "Open Sample Study Group & Exam Board",
      ctaDemoBusy: "Opening Study Board...",
      ctaStart: "Map a Class or Lab Session",
      pillars: [
        {
          emoji: "🍎",
          title: "IEP & Parent Conferences",
          body:
            "Keep teachers, specialists, and parents aligned on accommodations and student goals. Follow-up meetings append to the same board and check off completed milestones.",
        },
        {
          emoji: "🔬",
          title: "Uni Research Labs & Seminars",
          body:
            "Rolling 15-minute marathon mode handles 2-to-4-hour seminars and lab group syncs, linking hypotheses, papers, and lab tasks across the whole semester.",
        },
        {
          emoji: "📽️",
          title: "1-Click Slide-O-Matic Deck",
          body:
            "Turn any lecture or group discussion into a self-contained 6–9 slide HTML presentation deck or printable PDF study guide right from the Export Drawer.",
        },
        {
          emoji: "🎨",
          title: "Multiplayer Study Rooms",
          body:
            "Open a live room for a study group or lab team with voice chat and flip the Topic Map over to a shared Excalidraw whiteboard for diagrams and formulas.",
        },
      ],
      exportBadge: "Academic & Classroom Export Deck",
      exportTitle: "1-Click Slide-O-Matic Presentation Deck & Study Guide PDF",
      exportSubtitle:
        "6–9 Slide HTML Presentation, Styled PDF, or Obsidian Markdown",
      exportIntro:
        "Turn a seminar discussion, study group, or IEP conference into a clean study guide or presentation deck immediately after class:",
      exportSample: `# English Mid-Term Prep & District Study Group
**Participants**: Ami, Usagi, Luna
**Completed Study Milestones**:
  - [x] Color-code 72 irregular verb flashcards (Completed by Ami)
**Open Action Items before 8:00 AM Exam**:
  - [ ] Memorize past participle of 'to freeze' (@Usagi · tonight)
  - [ ] Review reading comprehension chapters 4–6 (@Study Group · before 8 AM)
**Connected Concepts**: Irregular Verbs ↔ Exam Probability ↔ Study Schedule`,
      compareTitle: "ProMapper vs Raw Lecture Recordings & Static Slide Decks",
      compareSubtitle:
        "Why teachers, university labs, and neurodivergent students map classes visually",
      compareOtherHeader: "Raw Audio / Static Slides",
      compareOurHeader: "ProMapper Classroom & Lab Table 🍎",
      compareRows: [
        {
          feature: "Long Seminars & Labs",
          traditional:
            "2-hour audio files that nobody ever listens to a second time",
          promapper:
            "Rolling 15-min auto-appends build a visual concept map while the seminar runs",
        },
        {
          feature: "IEP & Parent Meetings",
          traditional:
            "Scattered paper notes where accommodations and action owners get lost",
          promapper:
            "Shared visual board where student support actions tick off at the next review",
        },
        {
          feature: "Presentation Prep",
          traditional: "Hours copying notes into PowerPoint or Google Slides",
          promapper:
            "1-click Slide-O-Matic 6–9 slide deck + printable PDF study guide",
        },
        {
          feature: "Group Collaboration",
          traditional: "One person stuck typing in a doc while others talk",
          promapper:
            "Live multiplayer room with voice chat + shared Excalidraw diagram board",
        },
        {
          feature: "Lab & Group Pricing",
          traditional: "Per-student or per-seat monthly software fees",
          promapper:
            "Free local boards, $49/yr Solo Pass, or $99/yr Lab & Classroom Pass (up to 5 seats)",
        },
      ],
      faqTitle: "Frequently Asked Questions",
      faqs: [
        {
          question:
            "How does ProMapper handle 2-to-3-hour university lectures or lab meetings?",
          answer:
            "With a Supporter Pass or BYOK key, ProMapper unlocks rolling 15-minute marathon auto-appends. Every 15 minutes of speech is mapped into the board in the background while the microphone keeps recording seamlessly.",
        },
        {
          question:
            "Can a board be exported as a slideshow for class or lab presentations?",
          answer:
            "Yes. The Export Drawer includes a 1-click Slide-O-Matic button that transforms the board's themes, summary, and action items into a 6–9 slide presentation deck, alongside a printable PDF export.",
        },
        {
          question:
            "Is there a multi-seat pass for university research groups or teaching teams?",
          answer:
            "Yes. The $99 AUD 1-Year Guild, Lab & Practice Pass covers up to 5 seats with marathon session support, live collaborative rooms, and unlimited On-Device Whisper transcription.",
        },
      ],
      footerCta: "Open Sample Study Group & Exam Board 🍎",
      footerNote:
        "Built for K-12 teachers, IEP coordinators, university research labs, PhD supervision, and student study groups.",
    },
    es: {
      enPath: "/for/schools",
      esPath: "/es/escuelas",
      navBadge: "Escuelas • Laboratorios • Grupos de Estudio",
      kicker:
        "Para Docentes, Juntas Escolares, Laboratorios Universitarios y Grupos de Estudio",
      h1:
        "Convierte Clases, Seminarios y Juntas Escolares en Mapas Visuales Compartidos.",
      subtitle:
        "Desde seminarios universitarios de 2 horas y reuniones de laboratorio hasta juntas con madres y padres de familia: ProMapper identifica a cada participante, conecta los conceptos en un grafo interactivo y exporta una presentación de diapositivas o guía en PDF con un clic.",
      ctaDemo: "Ver Tablero de Ejemplo de Grupo de Estudio",
      ctaDemoBusy: "Abriendo Tablero Escolar...",
      ctaStart: "Mapear Clase o Seminario",
      pillars: [
        {
          emoji: "🍎",
          title: "Juntas Escolares y Seguimiento",
          body:
            "Alinea a docentes, orientadores y familias en torno a acuerdos claros. Las juntas siguientes se suman al mismo mapa y palomean los avances logrados.",
        },
        {
          emoji: "🔬",
          title: "Laboratorios y Seminarios",
          body:
            "El modo maratón de auto-guardado cada 15 minutos permite cubrir seminarios de 2 a 4 horas conectando hipótesis, lecturas y tareas del semestre.",
        },
        {
          emoji: "📽️",
          title: "Presentación y PDF en 1 Clic",
          body:
            "Transforma cualquier clase o mesa de discusión en una presentación HTML de 6 a 9 diapositivas (Slide-O-Matic) o en una guía de estudio en PDF.",
        },
        {
          emoji: "🎨",
          title: "Salas de Estudio en Vivo",
          body:
            "Abre una sala colaborativa para el equipo de laboratorio o grupo de estudio con voz integrada y pizarrón Excalidraw al reverso del mapa.",
        },
      ],
      exportBadge: "Exportación Académica y Escolar",
      exportTitle: "Presentación de Diapositivas y Guía en PDF en 1 Clic",
      exportSubtitle:
        "Presentación Slide-O-Matic de 6–9 diapositivas, PDF o Markdown",
      exportIntro:
        "Convierte un seminario, grupo de estudio o junta escolar en una guía clara o presentación lista para proyectar al terminar la sesión:",
      exportSample: `# Preparación de Examen Parcial y Grupo de Estudio
**Participantes**: Ami, Usagi, Luna
**Avances Completados**:
  - [x] Preparar 72 tarjetas de verbos irregulares por colores (Completado por Ami)
**Pendientes antes del Examen (8:00 AM)**:
  - [ ] Repasar participios pendientes (@Usagi · esta noche)
  - [ ] Revisar capítulos 4 a 6 de comprensión (@Grupo · antes de las 8 AM)
**Conceptos Conectados**: Verbos Irregulares ↔ Probabilidad de Aprobar ↔ Rol de Estudio`,
      compareTitle:
        "ProMapper frente a Grabaciones Largas de Clase y Apuntes Sueltos",
      compareSubtitle:
        "Por qué docentes, laboratorios universitarios y estudiantes visuales mapean sus sesiones",
      compareOtherHeader: "Audio Crudo / Apuntes Sueltos",
      compareOurHeader: "Mesa Escolar y de Laboratorio ProMapper 🍎",
      compareRows: [
        {
          feature: "Seminarios largos",
          traditional:
            "Archivos de audio de 2 horas que nadie vuelve a escuchar completos",
          promapper:
            "Auto-guardado cada 15 min que arma el mapa conceptual mientras avanza la clase",
        },
        {
          feature: "Juntas escolares",
          traditional:
            "Minutas en papel donde se pierden los acuerdos y responsables",
          promapper:
            "Tablero compartido donde los acuerdos escolares se palomean en la siguiente revisión",
        },
        {
          feature: "Material de clase",
          traditional: "Horas pasando apuntes a mano a diapositivas",
          promapper:
            "Presentación Slide-O-Matic de 6 a 9 diapositivas y guía PDF en 1 clic",
        },
        {
          feature: "Trabajo en equipo",
          traditional: "Una sola persona escribiendo mientras el resto habla",
          promapper:
            "Sala multijugador en vivo con voz y pizarrón Excalidraw compartido",
        },
        {
          feature: "Planes para grupos",
          traditional: "Licencias mensuales caras por estudiante o docente",
          promapper:
            "Tableros locales gratuitos, Pase Individual ($49 AUD/año) o Pase de Laboratorio ($99 AUD/año para 5 lugares)",
        },
      ],
      faqTitle: "Preguntas frecuentes para escuelas y universidades",
      faqs: [
        {
          question:
            "¿Cómo funciona ProMapper en clases o seminarios de 2 a 3 horas?",
          answer:
            "Con un Pase de Soporte o llave propia (BYOK), se activa el modo maratón que procesa fragmentos cada 15 minutos en segundo plano sin interrumpir el micrófono.",
        },
        {
          question:
            "¿Se puede exportar un tablero como presentación de diapositivas?",
          answer:
            "Sí. El cajón de exportación incluye el botón Slide-O-Matic que genera una presentación de 6 a 9 diapositivas lista para proyectar, además de exportación directa a PDF.",
        },
        {
          question:
            "¿Existe un pase grupal para laboratorios de investigación o colegios?",
          answer:
            "Sí. El Pase de Gremio y Laboratorio de $99 AUD por 1 año cubre hasta 5 integrantes con sesiones maratónicas, salas en vivo y transcripción local ilimitada con Whisper.",
        },
      ],
      footerCta: "Abrir Tablero de Ejemplo Escolar 🍎",
      footerNote:
        "Hecho para docentes, orientadores escolares, laboratorios universitarios, seminarios de posgrado y grupos de estudio.",
    },
  },
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
    <div class="min-h-screen bg-[#fffef7] text-[#1e1714] font-sans px-4 py-8 sm:py-12 max-w-5xl mx-auto space-y-12">
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
      <section class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        {copy.pillars.map((pillar) => (
          <div
            key={pillar.title}
            class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 shadow-[4px_4px_0px_#1e1714] space-y-3"
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
      <section class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-5 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-4">
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
        class="bg-[#fbf1e4] border-3 border-[#1e1714] rounded-2xl p-6 sm:p-8 shadow-[4px_4px_0px_#1e1714] space-y-6"
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
