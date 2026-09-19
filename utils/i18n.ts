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
  },
  es: {
    // Hero & Landing
    heroLines: ["Mira lo que estás", "diciendo en verdad"],
    heroDesc: "Suelta una idea, una junta, una escena o un caso entero.",
    heroCaption:
      "Un mapa de proyecto amigable al que puedes seguir sumándole, compartirlo y convertirlo en documentos.",
    dropPrompt:
      "Platícalo, captúralo en vivo o suelta lo que tengas a la mano.",
    badgeRecord: "grabar",
    badgePaste: "pegar",
    badgeUpload: "subir",
    addFile: "archivo",
    exampleLink: "o abre un ejemplo ya armado",
    lastUpload: "Último:",

    // Primary action button states
    btnStartRecording: "Iniciar grabación",
    btnStopAndMap: "Detener y mapear",
    btnMapIt: "Mapear",
    btnMapAudio: "Mapear audio",
    btnTryAgain: "Intentar de nuevo",
    btnCancel: "Cancelar",

    // Live Streaming
    listeningLive: "Escuchando en vivo…",
    listening: "Escuchando…",
    livePill: "⚡ texto en vivo",
    livePrompt:
      "Habla con libertad — tus palabras aparecerán aquí en vivo.",
    timeWarning: "casi llegamos a diez minutos — ve cerrando pronto.",

    // Toasts & Feedback
    micError:
      "No se pudo acceder al micrófono. Por favor permite el acceso e inténtalo de nuevo.",
    cancelledToast: "Grabación cancelada",
    noSpeechWarning:
      "No captamos nada — no se detectó voz clara. Revisa tu micrófono e inténtalo de nuevo.",
    noAudioWarning: "No captamos nada — no se grabó audio.",
    mappedSuccess: (items: number, topics: number) =>
      `¡Mapeado! Se encontraron ${items} tareas y ${topics} temas`,
    processFailed: "No se pudo procesar — inténtalo de nuevo.",

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
    supporterTitle: "Soporte ProMapper",
    supporterSubtitle: "Sin cuentas · Sin rastreo · Artesanía pura",
    tabPass: "💜 Pase de Soporte ($49 AUD)",
    tabByok: "🔑 Trae Tu Propia Llave (BYOK)",
    tabFaq: "❓ Preguntas",
    pass1Year: "Pase de 1 Año",
    supporterPrice: "$49 AUD",
    supporterTerm: "por año · sin renovación automática",
    supporterPitch:
      "Desbloquea límites de audio ampliados, salas en vivo colaborativas y mantiene a ProMapper independiente y sin anuncios.",
    ctaSquare: "Apoyar ProMapper — $49 AUD",
    ctaSquareBusy: "Abriendo Square Checkout...",
    haveCode: "¿Tienes un código o token de pase?",
    redeemBtn: "Canjear",
    activePassBanner: "✓ Pase de Soporte Activo",
    copyToken: "Copiar Token",
    lifetimePass: "Pase vitalicio activo",
    validUntil: (dateStr: string) => `Válido hasta el ${dateStr}`,
  },
} as const;

export function t(locale?: Locale) {
  const loc = locale || getLocale();
  return TRANSLATIONS[loc] || TRANSLATIONS.en;
}
