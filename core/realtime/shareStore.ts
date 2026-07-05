import type { ConversationData } from "../types/conversation-data.ts";
import {
  createShareRoomMetadata,
  generateShareRoomId,
  isShareRoomExpired,
  sanitizeShareConversation,
  SHARE_ROOM_LIMITS,
  type ShareRoomRecord,
} from "./shareProtocol.ts";

export interface ShareStore {
  create(
    data: ConversationData,
    options?: { ttlMs?: number },
  ): Promise<ShareRoomRecord>;
  get(shareId: string): Promise<ShareRoomRecord | null>;
}

const memoryRecords = new Map<string, ShareRoomRecord>();

/** Supabase REST calls sit on user-facing request paths — never hang them. */
const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

export class MemoryShareStore implements ShareStore {
  async create(
    data: ConversationData,
    options: { ttlMs?: number } = {},
  ): Promise<ShareRoomRecord> {
    const sanitized = sanitizeShareConversation(data);
    if (!sanitized) {
      throw new Error("Invalid conversation share payload.");
    }

    const shareId = generateShareRoomId();
    const metadata = createShareRoomMetadata(
      shareId,
      sanitized,
      options.ttlMs ?? SHARE_ROOM_LIMITS.DEFAULT_TTL_MS,
    );
    const record = { data: sanitized, metadata };

    memoryRecords.set(shareId, record);
    return record;
  }

  async get(shareId: string): Promise<ShareRoomRecord | null> {
    const record = memoryRecords.get(shareId);
    if (!record) return null;

    if (isShareRoomExpired(record.metadata)) {
      memoryRecords.delete(shareId);
      return null;
    }

    return record;
  }
}

export class SupabaseShareStore implements ShareStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly apiKey: string,
  ) {}

  async create(
    data: ConversationData,
    options: { ttlMs?: number } = {},
  ): Promise<ShareRoomRecord> {
    const sanitized = sanitizeShareConversation(data);
    if (!sanitized) {
      throw new Error("Invalid conversation share payload.");
    }

    const shareId = generateShareRoomId();
    const metadata = createShareRoomMetadata(
      shareId,
      sanitized,
      options.ttlMs ?? SHARE_ROOM_LIMITS.DEFAULT_TTL_MS,
    );

    const response = await fetch(this.restUrl("conversation_shares"), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: shareId,
        title: metadata.title ?? null,
        data: sanitized,
        expires_at: metadata.expiresAt,
      }),
      signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        this.getSupabaseError(payload) || "Could not create share.",
      );
    }

    return this.rowToRecord(Array.isArray(payload) ? payload[0] : payload);
  }

  async get(shareId: string): Promise<ShareRoomRecord | null> {
    const params = new URLSearchParams({
      id: `eq.${shareId}`,
      expires_at: `gt.${new Date().toISOString()}`,
      select: "id,title,data,created_at,updated_at,expires_at",
      limit: "1",
    });

    const response = await fetch(
      `${this.restUrl("conversation_shares")}?${params}`,
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS),
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        this.getSupabaseError(payload) || "Could not load share.",
      );
    }

    if (!Array.isArray(payload) || !payload[0]) return null;
    return this.rowToRecord(payload[0]);
  }

  private restUrl(table: string): string {
    return `${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}`;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      ...(this.apiKey.split(".").length === 3
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {}),
    };
  }

  private rowToRecord(row: unknown): ShareRoomRecord {
    if (!row || typeof row !== "object") {
      throw new Error("Invalid share row.");
    }
    const record = row as Record<string, unknown>;
    const data = sanitizeShareConversation(record.data);
    if (!data) {
      throw new Error("Stored share payload is invalid.");
    }

    const createdAt = typeof record.created_at === "string"
      ? record.created_at
      : new Date().toISOString();
    const updatedAt = typeof record.updated_at === "string"
      ? record.updated_at
      : createdAt;
    const expiresAt = typeof record.expires_at === "string"
      ? record.expires_at
      : new Date(Date.now() + SHARE_ROOM_LIMITS.DEFAULT_TTL_MS).toISOString();

    return {
      data,
      metadata: {
        shareId: String(record.id),
        title: typeof record.title === "string" ? record.title : undefined,
        createdAt,
        updatedAt,
        expiresAt,
      },
    };
  }

  private getSupabaseError(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    return typeof record.message === "string" ? record.message : null;
  }
}

export function getShareStore(): ShareStore {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim();

  if (supabaseUrl && supabaseKey) {
    return new SupabaseShareStore(supabaseUrl, supabaseKey);
  }

  return new MemoryShareStore();
}
