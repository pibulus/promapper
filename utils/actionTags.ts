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

// ── Legacy tag-tint storage ───────────────────────────────────────────
//
// #tag chips used to hash into SPEAKER_PALETTE and let a tap re-roll the hue,
// persisting the choice per conversation. Sept 15 collapsed tags to ONE theme
// colour, so nothing writes these keys any more — but real browsers still
// HOLD them, so the sweep below stays until it has had time to drain. Once
// that is rolled out, sweepOrphanTints and TINTS_PREFIX can both go.
const TINTS_PREFIX = "promapper-tag-tints:";

/**
 * Drop tint prefs whose conversation is gone. One key per conversation lives
 * outside the conversations map, so a deleted conversation left its colours
 * behind forever — invisible, unswept, and spending the same 5MB quota
 * autosave needs. Runs at load like its siblings (sweepOrphans for takes,
 * sweepOrphanSnapshots for exports) rather than on delete, so undo stays whole.
 *
 * Refuses an EMPTY live set for the same reason they do: a corrupt
 * conversations store reads as {} and would otherwise take every tint with it.
 */
export function sweepOrphanTints(liveConversationIds: Set<string>): number {
  if (typeof localStorage === "undefined") return 0;
  if (liveConversationIds.size === 0) return 0;
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(TINTS_PREFIX)) continue;
    if (!liveConversationIds.has(key.slice(TINTS_PREFIX.length))) {
      doomed.push(key);
    }
  }
  for (const key of doomed) localStorage.removeItem(key);
  return doomed.length;
}
