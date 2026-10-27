import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import { showToast } from "@utils/toast.ts";
import { DEMO_DUSTY, DEMO_EVIL_WIZARD, DEMO_T2 } from "../utils/demoPresets.ts";

export type VerticalKind = "meetings" | "research" | "brainstorming";

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
      navBadge: "Weekly Syncs • Action Tracking • Live Rooms",
      kicker: "For Small Teams, Studios & Weekly Project Check-Ins",
      h1: "Weekly Meeting Notes Where Action Items Tick Themselves Off.",
      subtitle:
        "Drop in a voice recording or meeting transcript — no calendar bot joining the call. ProMapper builds a speaker-attributed transcript, a force-directed topic map, and an action list that checks items off when a later meeting confirms the work happened.",
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
        "Built for weekly studio check-ins, engineering syncs, production standups, and community projects.",
    },
    es: {
      enPath: "/for/meetings",
      esPath: "/es/juntas",
      navBadge: "Juntas Semanales • Acuerdos • Salas en Vivo",
      kicker: "Para Equipos Pequeños, Estudios y Seguimiento de Proyectos",
      h1: "Minutas y Mapas de Juntas Donde los Pendientes se Palomean Solos.",
      subtitle:
        "Entra el audio de una junta o una transcripción sin meter bots incómodos a la videollamada. ProMapper arma la transcripción por hablante, el mapa de temas conectados y una lista de acuerdos que se palomean solos cuando en la siguiente junta se confirma que quedaron listos.",
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
      navBadge: "Interviews • Case Files • Unasked Questions",
      kicker: "For Journalists, Qualitative Researchers & Field Investigators",
      h1: "Map Tangled Interviews & Field Notes Into Connected Case Threads.",
      subtitle:
        "Drop in a multi-speaker interview, deposition, or oral history recording. ProMapper lays out who said what, maps how people, places, and claims connect across takes, and surfaces the unasked questions still hiding in the material.",
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
      navBadge: "Voice Notes • Rants to Plans • Story Worlds",
      kicker: "For Solo Builders, Writers & Visual Thinkers",
      h1: "Turn 10-Minute Voice Rants Into Living Mind Maps & Plans.",
      subtitle:
        "Speak freely while pacing the room or paste a tangled page of notes. ProMapper catches every thread, clusters ideas into an interactive emoji constellation, pulls out concrete next steps, and turns the whole ramble into a clean outline.",
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
        "Ideal para proyectos personales, guionistas, músicos, diseñadores y cualquiera que piense mejor en voz alta.",
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
    const demo = kind === "meetings"
      ? DEMO_T2
      : kind === "research"
      ? DEMO_DUSTY
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
