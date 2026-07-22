/**
 * The @/# token system for action items (July 23 redesign).
 *
 * An action item is a SENTENCE, not a form: "@mabel fix the fence #garden".
 * @word names the person (extracted into the assignee field on entry),
 * #word is a colored tag that stays inline in the description and renders
 * as a chip. Parsing is render-time — the description string remains the
 * single source of truth, so shares, live sync, and AI extraction all just
 * see text.
 *
 * Tag colors ride the spritzy speaker rainbow (hash-anchored, theme-proof).
 * Tapping a tag chip re-rolls its color: a per-conversation bump map in
 * localStorage nudges the hash — local-only by design (a viewer's palette
 * preference, not shared state).
 */

import { SPEAKER_PALETTE } from "@core/theme/speakerColors.ts";

export interface TextToken {
  kind: "text" | "person" | "tag";
  /** For person/tag: the word without its sigil. For text: the run itself. */
  value: string;
  /** The exact slice of the source string. */
  raw: string;
}

const TOKEN_RE = /([@#])([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

/** Split a description into text runs and @/# tokens, in order. */
export function tokenizeActionText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({
        kind: "text",
        value: text.slice(last, index),
        raw: text.slice(last, index),
      });
    }
    tokens.push({
      kind: match[1] === "@" ? "person" : "tag",
      value: match[2],
      raw: match[0],
    });
    last = index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({
      kind: "text",
      value: text.slice(last),
      raw: text.slice(last),
    });
  }
  return tokens;
}

/** Unique lowercased #tags in a description. */
export function tagsIn(text: string): string[] {
  return [
    ...new Set(
      tokenizeActionText(text)
        .filter((t) => t.kind === "tag")
        .map((t) => t.value.toLowerCase()),
    ),
  ];
}

/**
 * Turn quick-add text into an item: the FIRST @word becomes the assignee
 * (and leaves the sentence — the who is a field, rendered as a chip);
 * #tags stay inline. Whitespace is tidied after the pull-out.
 */
export function parseQuickAdd(
  text: string,
): { description: string; assignee: string | null } {
  let assignee: string | null = null;
  const description = text
    .replace(TOKEN_RE, (raw, sigil, word) => {
      if (sigil === "@" && assignee === null) {
        assignee = word;
        return "";
      }
      return raw;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { description, assignee };
}

// ── Tag colors ────────────────────────────────────────────────────────

function tagHash(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return h;
}

const TINTS_KEY = (conversationId: string) =>
  `promapper-tag-tints:${conversationId}`;

function loadBumps(conversationId: string): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(
      localStorage.getItem(TINTS_KEY(conversationId)) ?? "{}",
    );
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** A tag's stable color — same everywhere in a conversation. */
export function tagColor(tag: string, conversationId: string): string {
  const key = tag.toLowerCase();
  const bump = loadBumps(conversationId)[key] ?? 0;
  return SPEAKER_PALETTE[(tagHash(key) + bump) % SPEAKER_PALETTE.length];
}

/** Advance a tag to its next palette color (viewer-local preference). */
export function bumpTagColor(tag: string, conversationId: string): void {
  if (typeof localStorage === "undefined") return;
  const key = tag.toLowerCase();
  const bumps = loadBumps(conversationId);
  bumps[key] = ((bumps[key] ?? 0) + 1) % SPEAKER_PALETTE.length;
  try {
    localStorage.setItem(TINTS_KEY(conversationId), JSON.stringify(bumps));
  } catch {
    // Storage full/blocked — the re-roll just won't persist.
  }
}
