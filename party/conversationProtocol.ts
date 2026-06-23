/**
 * Conversation live-collab protocol — message types, room metadata, and
 * sanitizers for the PartyKit worker.
 *
 * RELATIVE IMPORTS ONLY. The PartyKit esbuild bundler does NOT honor Deno
 * import-maps (@core/ etc.), so this file is self-contained: the sanitizers
 * here mirror core/realtime/shareProtocol.ts but are duplicated on purpose so
 * the worker bundles cleanly. Keep the two roughly in sync.
 *
 * Access model: the room id IS the secret (no passwords). Lifetime: 24h after
 * last activity.
 */

const ROOM_PREFIX = "cm_";

export const LIVE_MESSAGE_TYPES = Object.freeze({
  INIT: "init", // full snapshot to a newly-connected client
  PRESENCE: "presence", // who's in the room
  CONVERSATION_UPDATE: "conversation_update", // a client mutated the conversation
  CHAT: "chat", // in-session chat message
  TYPING_START: "typing_start",
  TYPING_STOP: "typing_stop",
  RENAME: "rename", // a peer changed their display name
});

export const LIVE_CLOSE_CODES = Object.freeze({
  ROOM_EXPIRED: 4005,
});

// 24h after last activity (free-tier behavior; no supporter tier here).
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export const LIMITS = Object.freeze({
  MAX_TRANSCRIPT_LENGTH: 160_000,
  MAX_SUMMARY_LENGTH: 24_000,
  MAX_TITLE_LENGTH: 140,
  MAX_SOURCE_LENGTH: 40,
  MAX_SPEAKERS: 40,
  MAX_SPEAKER_LENGTH: 80,
  MAX_NODES: 300,
  MAX_NODE_LABEL_LENGTH: 120,
  MAX_EMOJI_LENGTH: 16,
  MAX_COLOR_LENGTH: 40,
  MAX_EDGES: 800,
  MAX_ACTION_ITEMS: 300,
  MAX_ACTION_DESCRIPTION_LENGTH: 500,
  MAX_ASSIGNEE_LENGTH: 120,
  MAX_STATUS_UPDATES: 300,
  MAX_AVATAR_LENGTH: 48,
  MAX_ALIAS_LENGTH: 64,
  MAX_CHAT_LENGTH: 800,
  MAX_ID_LENGTH: 128,
});

// ===================================================================
// PRIMITIVES
// ===================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/\s+/g, " ")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function normalizeLongText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 10 || code === 9 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  const normalized = normalizeString(value, maxLength);
  return normalized || undefined;
}

function normalizeTimestamp(
  value: unknown,
  fallback = new Date().toISOString(),
): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

// ===================================================================
// ROOM ID + METADATA
// ===================================================================

export interface RoomMetadata {
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export function generateRoomId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (!randomId) throw new Error("Secure random IDs are not available.");
  return `${ROOM_PREFIX}${randomId}`;
}

export function createRoomMetadata(input: Partial<RoomMetadata> = {})
  : RoomMetadata {
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(input.createdAt, now);
  const lastActiveAt = normalizeTimestamp(input.lastActiveAt, now);
  const updatedAt = normalizeTimestamp(input.updatedAt, lastActiveAt);
  const fallbackExpiry = new Date(
    new Date(lastActiveAt).getTime() + ROOM_TTL_MS,
  ).toISOString();
  return {
    createdAt,
    updatedAt,
    lastActiveAt,
    expiresAt: normalizeTimestamp(input.expiresAt, fallbackExpiry),
  };
}

export function touchRoomMetadata(input: Partial<RoomMetadata> = {})
  : RoomMetadata {
  const now = new Date().toISOString();
  return createRoomMetadata({
    ...input,
    updatedAt: now,
    lastActiveAt: now,
    expiresAt: new Date(Date.now() + ROOM_TTL_MS).toISOString(),
  });
}

export function isRoomExpired(
  metadata: Pick<RoomMetadata, "expiresAt"> | null,
  now = Date.now(),
): boolean {
  if (!metadata?.expiresAt) return false;
  const expiresAt = Date.parse(metadata.expiresAt);
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}

// ===================================================================
// PRESENCE / AVATAR / CHAT
// ===================================================================

export function sanitizeAvatar(value: unknown): string {
  return normalizeString(value, LIMITS.MAX_AVATAR_LENGTH) || "Guest";
}

export function sanitizeAlias(value: unknown): string | undefined {
  return normalizeOptionalString(value, LIMITS.MAX_ALIAS_LENGTH);
}

export function sanitizeChatText(value: unknown): string {
  return normalizeLongText(value, LIMITS.MAX_CHAT_LENGTH);
}

// ===================================================================
// CONVERSATION DATA (mirrors core/realtime/shareProtocol.ts)
// ===================================================================

function sanitizeTranscript(input: unknown, fallbackText: string) {
  const record = isRecord(input) ? input : {};
  const text = normalizeLongText(
    record.text ?? fallbackText,
    LIMITS.MAX_TRANSCRIPT_LENGTH,
  );
  const speakers = Array.isArray(record.speakers)
    ? record.speakers
      .map((s) => normalizeString(s, LIMITS.MAX_SPEAKER_LENGTH))
      .filter(Boolean)
      .slice(0, LIMITS.MAX_SPEAKERS)
    : [];
  return { text, speakers: Array.from(new Set(speakers)) };
}

function sanitizePosition(input: unknown): { x: number; y: number } | undefined {
  if (!isRecord(input)) return undefined;
  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  // Clamp to a sane canvas range so a bad value can't fling a node off-screen.
  const clamp = (n: number) => Math.max(-10000, Math.min(10000, n));
  return { x: clamp(x), y: clamp(y) };
}

function sanitizeNode(input: unknown) {
  if (!isRecord(input)) return null;
  const id = normalizeString(input.id, LIMITS.MAX_ID_LENGTH);
  const label = normalizeString(input.label, LIMITS.MAX_NODE_LABEL_LENGTH);
  if (!id || !label) return null;
  const node: {
    id: string;
    label: string;
    emoji: string;
    color: string;
    position?: { x: number; y: number };
  } = {
    id,
    label,
    emoji: normalizeString(input.emoji, LIMITS.MAX_EMOJI_LENGTH) || "*",
    color: normalizeString(input.color, LIMITS.MAX_COLOR_LENGTH) || "#e8839c",
  };
  // Preserve dragged layout positions so collaborators see each other's layout
  // and appends don't re-scramble the graph. (Keep in sync with
  // core/realtime/shareProtocol.ts sanitizeNode.)
  const position = sanitizePosition(input.position);
  if (position) node.position = position;
  return node;
}

function sanitizeEdge(input: unknown) {
  if (!isRecord(input)) return null;
  const source = normalizeString(input.source_topic_id, LIMITS.MAX_ID_LENGTH);
  const target = normalizeString(input.target_topic_id, LIMITS.MAX_ID_LENGTH);
  if (!source || !target) return null;
  return {
    id: normalizeOptionalString(input.id, LIMITS.MAX_ID_LENGTH),
    source_topic_id: source,
    target_topic_id: target,
    color: normalizeString(input.color, LIMITS.MAX_COLOR_LENGTH) || "#e8839c",
  };
}

function sanitizeActionItem(input: unknown, conversationId: string) {
  if (!isRecord(input)) return null;
  const id = normalizeString(input.id, LIMITS.MAX_ID_LENGTH);
  const description = normalizeLongText(
    input.description,
    LIMITS.MAX_ACTION_DESCRIPTION_LENGTH,
  );
  if (!id || !description) return null;
  const now = new Date().toISOString();
  const item: {
    id: string;
    conversation_id: string;
    description: string;
    assignee: string | null;
    due_date: string | null;
    status: "completed" | "pending";
    created_at: string;
    updated_at: string;
    ai_checked?: boolean;
    checked_reason?: string;
  } = {
    id,
    conversation_id: normalizeString(input.conversation_id, LIMITS.MAX_ID_LENGTH) ||
      conversationId,
    description,
    assignee: normalizeOptionalString(input.assignee, LIMITS.MAX_ASSIGNEE_LENGTH) ??
      null,
    due_date: normalizeOptionalString(input.due_date, 40) ?? null,
    status: input.status === "completed" ? "completed" : "pending",
    created_at: normalizeTimestamp(input.created_at, now),
    updated_at: normalizeTimestamp(input.updated_at, now),
  };

  // Preserve the AI self-checkoff annotations through the broadcast — these are
  // the app's headline feature. Without them, only the client that made the
  // append API call sees which items the AI checked off and why; every other
  // peer in the live room loses that attribution.
  if (input.ai_checked === true) item.ai_checked = true;
  const reason = normalizeOptionalString(
    input.checked_reason,
    LIMITS.MAX_ACTION_DESCRIPTION_LENGTH,
  );
  if (reason) item.checked_reason = reason;

  return item;
}

/** Validated conversation snapshot, or null if there's no usable transcript. */
export function sanitizeConversationData(input: unknown) {
  if (!isRecord(input)) return null;
  const conv = isRecord(input.conversation) ? input.conversation : {};
  const conversationId = normalizeString(conv.id, LIMITS.MAX_ID_LENGTH) ||
    `live_${Date.now()}`;
  const convTranscript = normalizeLongText(
    conv.transcript,
    LIMITS.MAX_TRANSCRIPT_LENGTH,
  );
  const transcript = sanitizeTranscript(input.transcript, convTranscript);
  const transcriptText = transcript.text || convTranscript;
  if (!transcriptText) return null;

  return {
    conversation: {
      id: conversationId,
      title: normalizeOptionalString(
        conv.title ?? input.title,
        LIMITS.MAX_TITLE_LENGTH,
      ),
      source: normalizeString(conv.source, LIMITS.MAX_SOURCE_LENGTH) || "live",
      transcript: transcriptText,
      created_at: normalizeTimestamp(conv.created_at ?? input.timestamp),
    },
    transcript: { ...transcript, text: transcriptText },
    nodes: Array.isArray(input.nodes)
      ? input.nodes.slice(0, LIMITS.MAX_NODES).map(sanitizeNode).filter(Boolean)
      : [],
    edges: Array.isArray(input.edges)
      ? input.edges.slice(0, LIMITS.MAX_EDGES).map(sanitizeEdge).filter(Boolean)
      : [],
    actionItems: Array.isArray(input.actionItems)
      ? input.actionItems
        .slice(0, LIMITS.MAX_ACTION_ITEMS)
        .map((item) => sanitizeActionItem(item, conversationId))
        .filter(Boolean)
      : [],
    statusUpdates: Array.isArray(input.statusUpdates)
      ? input.statusUpdates.slice(0, LIMITS.MAX_STATUS_UPDATES)
      : [],
    summary: normalizeOptionalString(input.summary, LIMITS.MAX_SUMMARY_LENGTH),
  };
}

// ===================================================================
// MESSAGES
// ===================================================================

export interface LiveMessage {
  type: string;
  data?: unknown;
}

/** Validate an inbound client message into a known type, or null. */
export function normalizeLiveMessage(input: unknown): LiveMessage | null {
  if (!isRecord(input)) return null;
  const type = normalizeString(input.type, 40);
  const known = Object.values(LIVE_MESSAGE_TYPES) as string[];
  if (!known.includes(type)) return null;
  return { type, data: input.data };
}
