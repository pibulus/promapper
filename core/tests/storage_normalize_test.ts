/**
 * Tests for normalizeStored — the load-path guard that backfills arrays a
 * record might be missing (old schema, hand-edited backup), so downstream
 * .nodes.map() / .edges.filter() / .actionItems.map() can't throw.
 */

import { assertEquals } from "./_assert.ts";
import {
  normalizeStored,
  type StoredConversation,
} from "../storage/localStorage.ts";

function bareRecord(): StoredConversation {
  // A deliberately under-specified record, the kind a permissive import or an
  // older app version could produce: only the bookkeeping fields are present.
  return {
    id: "c1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    // Everything ConversationData would normally carry is missing.
  } as unknown as StoredConversation;
}

Deno.test("normalizeStored backfills missing arrays so load can't crash", () => {
  const out = normalizeStored(bareRecord());
  assertEquals(out.nodes, []);
  assertEquals(out.edges, []);
  assertEquals(out.actionItems, []);
  assertEquals(out.statusUpdates, []);
  assertEquals(out.transcript, { text: "", speakers: [] });
  assertEquals(out.conversation.id, "c1");
});

Deno.test("normalizeStored leaves a complete record untouched in shape", () => {
  const full: StoredConversation = {
    id: "c2",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    starred: true,
    conversation: {
      id: "c2",
      title: "the moth situation",
      source: "text",
      transcript: "Nan: there is a moth in the lamp again.",
    },
    transcript: {
      text: "Nan: there is a moth in the lamp again.",
      speakers: ["Nan"],
    },
    nodes: [{
      id: "moth",
      label: "moth",
      emoji: "\u{1F9A0}",
      color: "#FF69B4",
    }],
    edges: [],
    actionItems: [],
    statusUpdates: [],
    summary: "A moth. In the lamp. Again.",
  };
  const out = normalizeStored(full);
  assertEquals(out.nodes.length, 1);
  assertEquals(out.starred, true);
  assertEquals(out.conversation.title, "the moth situation");
  assertEquals(out.summary, "A moth. In the lamp. Again.");
});
