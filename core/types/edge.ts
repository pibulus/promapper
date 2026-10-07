/**
 * Edge Types (topic relationships)
 */

/**
 * What a relationship means, read source → target. The extraction prompt
 * always asked the model to think in exactly these terms, then kept only a
 * colour; this keeps the answer. Keys are stored, phrases are shown.
 * workers/collab can't import, so it restates the keys — a parity test in
 * core/tests/party_sanitizer_test.ts holds the two together.
 */
export const EDGE_KINDS = {
  depends_on: "depends on",
  leads_to: "leads to",
  contrasts: "contrasts with",
  way_to: "is a way to",
  risks: "puts at risk",
  supports: "is evidence for",
} as const;

export type EdgeKind = keyof typeof EDGE_KINDS;

export function normalizeEdgeKind(value: unknown): EdgeKind | undefined {
  return typeof value === "string" && Object.hasOwn(EDGE_KINDS, value)
    ? value as EdgeKind
    : undefined;
}

/** `{...withEdgeKind(raw.kind)}` adds `kind` only when it's a real one. */
export function withEdgeKind(value: unknown): { kind?: EdgeKind } {
  const kind = normalizeEdgeKind(value);
  return kind ? { kind } : {};
}

/** "depends on" for a typed edge, the neutral fallback for an untyped one. */
export function edgePhrase(kind: unknown, fallback = "connects to"): string {
  const known = normalizeEdgeKind(kind);
  return known ? EDGE_KINDS[known] : fallback;
}

export interface Edge {
  id: string;
  conversation_id: string;
  source_topic_id: string;
  target_topic_id: string;
  color: string; // Hex color like "#999999"
  kind?: EdgeKind;
  created_at: string;
}

export interface EdgeInput {
  source_topic_id: string;
  target_topic_id: string;
  color: string;
  kind?: EdgeKind;
}
