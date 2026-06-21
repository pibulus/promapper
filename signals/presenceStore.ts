/**
 * Presence Store
 *
 * Who else is in the live room: their avatar name, optional alias, and a
 * deterministic per-user color. Driven by the partyService; read by the
 * collaborators UI.
 */

import { signal } from "@preact/signals";

export interface RemoteUser {
  id: string;
  avatar: string;
  alias?: string;
  joinedAt: number;
}

/** Everyone currently in the room (including self, as the server sees us). */
export const remoteUsers = signal<RemoteUser[]>([]);

/** Ids of users currently typing (for typing indicators). */
export const typingUserIds = signal<Set<string>>(new Set());

/** Display name for a user: their chosen alias, else the avatar name. */
export function remoteUserName(user: RemoteUser): string {
  return user.alias?.trim() || user.avatar || "Guest";
}

// Warm, on-brand palette (no neon) for per-user identity dots.
const USER_COLORS = [
  "#E8839C",
  "#5DBEAA",
  "#9B7EC7",
  "#D4A01A",
  "#C4607A",
  "#5B8DEF",
  "#52A37F",
  "#C47C48",
];

/** Stable color for a user id (same id → same color across clients). */
export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ===================================================================
// LOCAL IDENTITY (this client's name)
// ===================================================================

const ADJECTIVES = [
  "Happy",
  "Calm",
  "Swift",
  "Cosmic",
  "Mellow",
  "Brave",
  "Sunny",
  "Lucky",
];
const ANIMALS = [
  "Dolphin",
  "Otter",
  "Fox",
  "Koala",
  "Badger",
  "Heron",
  "Lynx",
  "Wombat",
];

const IDENTITY_KEY = "promapper-live-identity";

/** A friendly auto-name like "MellowOtter", persisted per browser session. */
export function getLocalIdentity(): string {
  if (typeof localStorage === "undefined") return "Guest";
  const saved = localStorage.getItem(IDENTITY_KEY);
  if (saved) return saved;
  // Deterministic-ish without Math.random ban worries on client: time-seeded.
  const seed = Date.now();
  const name = `${ADJECTIVES[seed % ADJECTIVES.length]}${
    ANIMALS[Math.floor(seed / 7) % ANIMALS.length]
  }`;
  localStorage.setItem(IDENTITY_KEY, name);
  return name;
}

export function setLocalIdentity(name: string): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = name.trim().slice(0, 64);
  if (trimmed) localStorage.setItem(IDENTITY_KEY, trimmed);
}
