import type { ConversationData } from "../types/conversation-data.ts";
import { isRecord } from "../ai/helpers.ts";

export const SHARE_ROOM_PREFIX = "cm_";

export const SHARE_ROOM_LIMITS = {
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
  DEFAULT_TTL_MS: 30 * 24 * 60 * 60 * 1000,
};

export interface ShareRoomMetadata {
  shareId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  title?: string;
}

export interface ShareRoomRecord {
  data: ConversationData;
  metadata: ShareRoomMetadata;
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

function sanitizeTranscript(input: unknown, fallbackText: string) {
  const record = isRecord(input) ? input : {};
  const text = normalizeLongText(
    record.text ?? fallbackText,
    SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH,
  );
  const speakers = Array.isArray(record.speakers)
    ? record.speakers
      .map((speaker) =>
        normalizeString(speaker, SHARE_ROOM_LIMITS.MAX_SPEAKER_LENGTH)
      )
      .filter(Boolean)
      .slice(0, SHARE_ROOM_LIMITS.MAX_SPEAKERS)
    : [];

  return {
    text,
    speakers: Array.from(new Set(speakers)),
  };
}

function sanitizePosition(
  input: unknown,
): { x: number; y: number } | undefined {
  if (!isRecord(input)) return undefined;
  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const clamp = (n: number) => Math.max(-10000, Math.min(10000, n));
  return { x: clamp(x), y: clamp(y) };
}

function sanitizeNode(input: unknown) {
  if (!isRecord(input)) return null;
  const id = normalizeString(input.id, 128);
  const label = normalizeString(
    input.label,
    SHARE_ROOM_LIMITS.MAX_NODE_LABEL_LENGTH,
  );
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
    emoji: normalizeString(input.emoji, SHARE_ROOM_LIMITS.MAX_EMOJI_LENGTH) ||
      "*",
    color: normalizeString(input.color, SHARE_ROOM_LIMITS.MAX_COLOR_LENGTH) ||
      "#e8839c",
  };
  // Preserve dragged layout positions across share/live round-trips.
  // (Keep in sync with party/conversationProtocol.ts sanitizeNode.)
  const position = sanitizePosition(input.position);
  if (position) node.position = position;
  return node;
}

function sanitizeEdge(input: unknown) {
  if (!isRecord(input)) return null;
  const source = normalizeString(input.source_topic_id, 128);
  const target = normalizeString(input.target_topic_id, 128);
  if (!source || !target) return null;

  return {
    id: normalizeOptionalString(input.id, 128),
    source_topic_id: source,
    target_topic_id: target,
    color: normalizeString(input.color, SHARE_ROOM_LIMITS.MAX_COLOR_LENGTH) ||
      "#e8839c",
  };
}

function sanitizeActionItem(input: unknown, conversationId: string) {
  if (!isRecord(input)) return null;
  const id = normalizeString(input.id, 128);
  const description = normalizeLongText(
    input.description,
    SHARE_ROOM_LIMITS.MAX_ACTION_DESCRIPTION_LENGTH,
  );
  if (!id || !description) return null;

  const now = new Date().toISOString();
  const status: "completed" | "pending" = input.status === "completed"
    ? "completed"
    : "pending";

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
    conversation_id: normalizeString(input.conversation_id, 128) ||
      conversationId,
    description,
    assignee: normalizeOptionalString(
      input.assignee,
      SHARE_ROOM_LIMITS.MAX_ASSIGNEE_LENGTH,
    ) ?? null,
    due_date: normalizeOptionalString(input.due_date, 40) ?? null,
    status,
    created_at: normalizeTimestamp(input.created_at, now),
    updated_at: normalizeTimestamp(input.updated_at, now),
  };

  // Preserve the AI self-checkoff annotations in shared conversations — the same
  // headline-feature reasoning as the PartyKit sanitizer. Without these, a shared
  // map loses which items the AI marked done and why.
  if (input.ai_checked === true) item.ai_checked = true;
  const reason = normalizeOptionalString(
    input.checked_reason,
    SHARE_ROOM_LIMITS.MAX_ACTION_DESCRIPTION_LENGTH,
  );
  if (reason) item.checked_reason = reason;

  return item;
}

export function generateShareRoomId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (!randomId) {
    throw new Error("Secure random IDs are not available.");
  }
  return `${SHARE_ROOM_PREFIX}${randomId}`;
}

export function sanitizeShareConversation(
  input: unknown,
): ConversationData | null {
  if (!isRecord(input)) return null;

  const conversationInput = isRecord(input.conversation)
    ? input.conversation
    : {};
  const conversationId = normalizeString(
    conversationInput.id,
    128,
  ) || `shared_${Date.now()}`;
  const conversationTranscript = normalizeLongText(
    conversationInput.transcript,
    SHARE_ROOM_LIMITS.MAX_TRANSCRIPT_LENGTH,
  );
  const transcript = sanitizeTranscript(
    input.transcript,
    conversationTranscript,
  );
  const transcriptText = transcript.text || conversationTranscript;

  if (!transcriptText) return null;

  return {
    conversation: {
      id: conversationId,
      title: normalizeOptionalString(
        conversationInput.title ?? input.title,
        SHARE_ROOM_LIMITS.MAX_TITLE_LENGTH,
      ),
      source: normalizeString(
        conversationInput.source,
        SHARE_ROOM_LIMITS.MAX_SOURCE_LENGTH,
      ) || "shared",
      transcript: transcriptText,
      created_at: normalizeTimestamp(
        conversationInput.created_at ?? input.timestamp,
      ),
    },
    transcript: {
      ...transcript,
      text: transcriptText,
    },
    nodes: Array.isArray(input.nodes)
      ? input.nodes
        .slice(0, SHARE_ROOM_LIMITS.MAX_NODES)
        .map(sanitizeNode)
        .filter((node): node is NonNullable<ReturnType<typeof sanitizeNode>> =>
          Boolean(node)
        )
      : [],
    edges: Array.isArray(input.edges)
      ? input.edges
        .slice(0, SHARE_ROOM_LIMITS.MAX_EDGES)
        .map(sanitizeEdge)
        .filter((edge): edge is NonNullable<ReturnType<typeof sanitizeEdge>> =>
          Boolean(edge)
        )
      : [],
    actionItems: Array.isArray(input.actionItems)
      ? input.actionItems
        .slice(0, SHARE_ROOM_LIMITS.MAX_ACTION_ITEMS)
        .map((item) => sanitizeActionItem(item, conversationId))
        .filter((
          item,
        ): item is NonNullable<ReturnType<typeof sanitizeActionItem>> =>
          Boolean(item)
        )
      : [],
    statusUpdates: Array.isArray(input.statusUpdates)
      ? input.statusUpdates.slice(0, SHARE_ROOM_LIMITS.MAX_STATUS_UPDATES)
      : [],
    summary: normalizeOptionalString(
      input.summary,
      SHARE_ROOM_LIMITS.MAX_SUMMARY_LENGTH,
    ),
  };
}

export function createShareRoomMetadata(
  shareId: string,
  data: ConversationData,
  ttlMs = SHARE_ROOM_LIMITS.DEFAULT_TTL_MS,
  now = new Date(),
): ShareRoomMetadata {
  const timestamp = now.toISOString();
  return {
    shareId,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    title: data.conversation.title,
  };
}

export function isShareRoomExpired(
  metadata: Pick<ShareRoomMetadata, "expiresAt">,
  now = Date.now(),
): boolean {
  const expiresAt = Date.parse(metadata.expiresAt);
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}
