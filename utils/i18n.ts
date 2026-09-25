/**
 * ProMapper i18n & Translation Dictionary
 *
 * Lightweight, 80/20 localization for English and Mexican Spanish.
 * Follows the same pattern as QRBuddy (utils/i18n.ts) and TalkType ($lib/i18n.js).
 */

export type Locale = "en" | "es";

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    if (window.location.pathname.startsWith("/es")) return "es";
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("es")) return "es";
  }
  return "en";
}

export function isSpanish(): boolean {
  return getLocale() === "es";
}

export const TRANSLATIONS = {
  en: {
    // Hero & Landing
    heroLines: ["See what you're", "really saying"],
    heroDesc: "Drop in a thought, a meeting, a scene, or a whole court case.",
    heroCaption:
      "A friendly project map you can keep adding to, share around, and turn into documents.",
    dropPrompt: "Talk it out, catch it live, or drop in what you've got.",
    badgeRecord: "record",
    badgePaste: "paste",
    badgeUpload: "upload",
    addFile: "file",
    exampleLink: "or open one someone already made",
    lastUpload: "Last:",

    // Primary action button states
    btnStartRecording: "Start recording",
    btnStopAndMap: "Stop & Map",
    btnMapIt: "Map it",
    btnMapAudio: "Map audio",
    btnTryAgain: "Try that again",
    btnCancel: "Cancel",

    // Live Streaming
    listeningLive: "Listening live…",
    listening: "Listening…",
    livePill: "⚡ live text",
    livePrompt: "Speak freely — your words will stream in here live.",
    timeWarning: "coming up on ten minutes — wrap it up soon.",

    // Toasts & Feedback
    micError:
      "Could not access microphone. Please grant permission and try again.",
    recoveredFirstTake:
      "A recording from last time never made it into a map — it's still here. “Try that again” maps it.",
    recoveredAddedTake: (title: string) =>
      title
        ? `A take for “${title}” got cut short last time — it's waiting in that map.`
        : "A take got cut short last time — it's waiting in its map.",
    recoveredLetGo: "Let it go",
    recoveredTakeName: "Recovered take",
    micBlocked: (app: string | null) =>
      app
        ? `${app}'s built-in browser keeps the mic locked — its ••• menu opens this page in Safari or Chrome.`
        : "This browser can't reach a microphone — Safari or Chrome can.",
    cancelledToast: "Recording cancelled",
    noSpeechWarning:
      "Didn't catch that — no clear speech detected. Check your mic and give it another go.",
    noAudioWarning: "Didn't catch that — no audio recorded.",
    mappedSuccess: (items: number, topics: number) =>
      `Mapped! Found ${items} action items, ${topics} topics`,
    processFailed: "That didn't go through — give it another go.",

    // Header & Footer Chrome
    switchLang: "🇲🇽 Español",
    switchLangUrl: "/es",
    madeBy: "Made by Pablo • Melbourne • Anti-scale software with personality.",
    history: "History",
    voice: "Voice",
    settings: "Settings",

    // Supporter Modal
    supporterBadge: "Supporter Pass ✨",
    supporterTitle: "ProMapper Supporter",
    supporterSubtitle: "Zero accounts · Zero tracking · High craft",
    tabPass: "💜 Supporter Pass ($49 AUD)",
    tabByok: "🔑 Bring Your Own Key",
    tabFaq: "❓ FAQ",
    pass1Year: "1-Year Pass",
    supporterPrice: "$49 AUD",
    supporterTerm: "per year · no auto-renew",
    supporterPitch:
      "Unlocks extended audio limits, collaborative live rooms, and keeps ProMapper independent & ad-free.",
    ctaSquare: "Support ProMapper — $49 AUD",
    ctaSquareBusy: "Opening Square Checkout...",
    haveCode: "Have a supporter pass token or code?",
    redeemBtn: "Redeem",
    activePassBanner: "✓ Supporter Pass Active",
    copyToken: "Copy Token",
    lifetimePass: "Lifetime pass active",
    validUntil: (dateStr: string) => `Valid until ${dateStr}`,
    extendPass: (price: string) => `Extend Supporter Pass (${price})`,
    featTakes: "Unlimited Audio Takes",
    featTakesDesc: "(no daily recording cap)",
    featRooms: "Live Collab Rooms",
    featRoomsDesc: "(PartyKit multiplayer + WebRTC voice relay)",
    featDecks: "All 8 Export Decks",
    featDecksDesc: "(Plan, Research, Haiku, Unasked, Custom)",
    featAsk: "Ask Panel Deep Queries",
    featAskDesc: "(unlimited conversational Q&A)",
    featShare: "Permanent Cloud Share Links",
    squareNotice:
      "Card payment via Square · Zero subscriptions · No auto-renew",
    codePlaceholder: "Paste pass token or master code",
    byokTitle: "Bring Your Own OpenRouter Key",
    byokDesc:
      "If you already have an OpenRouter or Gemini key, plug it here. ProMapper will route all transcription and analysis calls directly through your key.",
    byokLabel: "OpenRouter API Key:",
    byokSave: "Save Key",
    byokClear: "Clear",
    byokVerifying: "Verifying...",
    byokRemoved: "Key removed.",
    byokPrivacy:
      "Your key stays in your browser cookie (`pm_byok`). It is never stored in any database or logged on our servers.",
    pdfWarning: "PDFs can't come in yet — audio or text files for now.",
    unsupportedFile:
      "That file type isn't supported yet — audio or text files for now.",
    noSpeechInFile:
      "Didn't catch that — no clear speech detected in the audio file. Give another file a go.",
  },
  es: {
    // Hero & Landing
    heroLines: ["Dale forma a", "lo que dices"],
    heroDesc: "Pega un texto, graba una junta o suelta una idea.",
    heroCaption:
      "Un mapa claro para tus proyectos: agrégale ideas, compártelo y saca tus documentos sin rollos.",
    dropPrompt: "Platícalo, grábalo o pega tu texto aquí.",
    badgeRecord: "grabar",
    badgePaste: "pegar",
    badgeUpload: "subir",
    addFile: "archivo",
    exampleLink: "o abre un ejemplo ya armado",
    lastUpload: "Último:",

    // Primary action button states
    btnStartRecording: "Empieza a grabar",
    btnStopAndMap: "Para y mapea",
    btnMapIt: "Mapea",
    btnMapAudio: "Mapea el audio",
    btnTryAgain: "Inténtalo otra vez",
    btnCancel: "Cancelar",

    // Live Streaming
    listeningLive: "Escuchando en vivo…",
    listening: "Escuchando…",
    livePill: "⚡ en vivo",
    livePrompt: "Habla directo, el texto sale aquí en tiempo real.",
    timeWarning: "Cerca de los 10 minutos — ve cerrando la idea.",

    // Toasts & Feedback
    micError:
      "No se conectó el mic. Dale permiso en tu navegador e inténtalo otra vez.",
    recoveredFirstTake:
      "Una grabación de la última vez no llegó a un mapa — sigue aquí. «Inténtalo otra vez» la mapea.",
    recoveredAddedTake: (title: string) =>
      title
        ? `Una toma de “${title}” se cortó la última vez — te espera en ese mapa.`
        : "Una toma se cortó la última vez — te espera en su mapa.",
    recoveredLetGo: "Déjala ir",
    recoveredTakeName: "Toma recuperada",
    micBlocked: (app: string | null) =>
      app
        ? `El navegador de ${app} bloquea el mic — desde su menú ••• abre esta página en Safari o Chrome.`
        : "Este navegador no tiene acceso al mic — Safari o Chrome sí.",
    cancelledToast: "Grabación cancelada.",
    noSpeechWarning:
      "No se escuchó nada claro. Checa tu mic e inténtalo otra vez.",
    noAudioWarning: "No se grabó audio. Inténtalo otra vez.",
    mappedSuccess: (items: number, topics: number) =>
      `¡Listo el mapa! ${items} tareas y ${topics} temas`,
    processFailed: "Hubo un error al procesar, inténtalo otra vez.",

    // Header & Footer Chrome
    switchLang: "🇦🇺 English",
    switchLangUrl: "/",
    madeBy:
      "Hecho por Pablo • Mexicano-Australiano • Software anti-escala con personalidad.",
    history: "Historial",
    voice: "Voz",
    settings: "Ajustes",

    // Supporter Modal
    supporterBadge: "Pase de Soporte ✨",
    supporterTitle: "Apoya a ProMapper",
    supporterSubtitle: "Sin cuentas obligatorias · Cero rastreo · Hecho a mano",
    tabPass: "💜 Pase de Soporte ($49 AUD)",
    tabByok: "🔑 Pon tu propia API key (BYOK)",
    tabFaq: "❓ Preguntas",
    pass1Year: "Pase de 1 Año",
    supporterPrice: "$49 AUD",
    supporterTerm: "un solo pago al año · sin cobros automáticos",
    supporterPitch:
      "Desbloquea grabaciones más largas, salas en vivo para colaborar en equipo, y ayuda a mantener ProMapper independiente y sin anuncios.",
    ctaSquare: "Apoya a ProMapper — $49 AUD",
    ctaSquareBusy: "Abriendo Square...",
    haveCode: "¿Tienes un código o pase?",
    redeemBtn: "Desbloquear",
    activePassBanner: "✓ Pase de Soporte Activo",
    copyToken: "Copiar pase",
    lifetimePass: "Pase vitalicio activo",
    validUntil: (dateStr: string) => `Válido hasta el ${dateStr}`,
    extendPass: (price: string) => `Extender pase de soporte (${price})`,
    featTakes: "Tomas de audio ilimitadas",
    featTakesDesc: "(sin límite diario de grabación)",
    featRooms: "Salas en vivo colaborativas",
    featRoomsDesc: "(salas en equipo + voz en vivo)",
    featDecks: "Los 8 formatos de exportación",
    featDecksDesc: "(Plan, Investigación, Haiku, Preguntas, Personalizado)",
    featAsk: "Consultas ilimitadas al panel de preguntas",
    featAskDesc: "(pregúntale lo que quieras a tus notas)",
    featShare: "Enlaces permanentes para compartir",
    squareNotice:
      "Pago con tarjeta vía Square · Cero suscripciones · Sin cobros automáticos",
    codePlaceholder: "Pega tu pase o código aquí",
    byokTitle: "Pon tu propia API key de OpenRouter",
    byokDesc:
      "Si ya tienes una llave de OpenRouter o Gemini, conéctala aquí. ProMapper procesará la transcripción y el análisis directo con tu cuenta.",
    byokLabel: "API Key de OpenRouter:",
    byokSave: "Guardar llave",
    byokClear: "Quitar",
    byokVerifying: "Verificando...",
    byokRemoved: "Llave eliminada.",
    byokPrivacy:
      "Tu llave se queda en tu navegador (`pm_byok`). Nunca se guarda en bases de datos ni se registra en servidores.",
    pdfWarning: "Por ahora no entran PDFs — solo audio o archivos de texto.",
    unsupportedFile:
      "Ese formato no es compatible — por ahora solo audio o texto.",
    noSpeechInFile:
      "No se escuchó nada claro en el archivo. Intenta con otro audio.",
  },
} as const;

export function t(locale?: Locale) {
  const loc = locale || getLocale();
  return TRANSLATIONS[loc] || TRANSLATIONS.en;
}
