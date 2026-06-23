/**
 * Round-trip test for the share-URL compression pipeline (audit #6 Part B,
 * Rank 4). encodeShareDataForUrl does
 * btoa(encodeURIComponent(JSON.stringify(createShareableData(data)))) and
 * loadUrlSharedConversation reverses it. This is the "send to anyone" feature —
 * if decode silently fails or normalizeSharedData produces a malformed shape,
 * the viewer sees a blank/broken page and the sharer looks bad.
 *
 * Asserts the round-trip PRESERVES the user-visible payload (title, nodes,
 * edges, action items, transcript), and that decode is robust against garbage.
 */

import { assertEquals, assertExists } from "./_assert.ts";
import {
  decompressData,
  encodeShareDataForUrl,
  loadUrlSharedConversation,
} from "../storage/shareService.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function realisticConversation(): ConversationData {
  return {
    conversation: {
      id: "c1",
      title: "Spider Goats vs the Post Office",
      source: "text",
      transcript: "Nan: the goats have learned to read the postcodes",
    },
    transcript: {
      text: "Nan: the goats have learned to read the postcodes",
      speakers: ["Nan"],
    },
    nodes: [
      { id: "goats", label: "spider goats", emoji: "🐐", color: "#E8839C" },
      { id: "post", label: "post office", emoji: "📮", color: "#5DBEAA" },
    ],
    edges: [{
      id: "e1",
      source_topic_id: "goats",
      target_topic_id: "post",
      color: "#8A8F98",
    }],
    actionItems: [{
      id: "a1",
      conversation_id: "c1",
      description: "teach the goats about certified mail",
      assignee: "Nan",
      due_date: null,
      status: "pending",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    }],
    statusUpdates: [],
    summary: "goats, postcodes, certified mail",
  };
}

Deno.test("share URL round-trip preserves the user-visible payload", () => {
  const original = realisticConversation();
  const encoded = encodeShareDataForUrl(original);
  const loaded = loadUrlSharedConversation(encoded);

  assertExists(loaded);
  assertEquals(loaded.conversation.title, "Spider Goats vs the Post Office");
  assertEquals(loaded.nodes.length, 2);
  assertEquals(loaded.nodes.map((n) => n.id).sort(), ["goats", "post"]);
  assertEquals(loaded.edges.length, 1);
  assertEquals(loaded.edges[0].source_topic_id, "goats");
  assertEquals(loaded.actionItems.length, 1);
  assertEquals(
    loaded.actionItems[0].description,
    "teach the goats about certified mail",
  );
  assertEquals(
    loaded.transcript.text,
    "Nan: the goats have learned to read the postcodes",
  );
});

Deno.test("share URL round-trip survives an empty topic map", () => {
  const original = realisticConversation();
  original.nodes = [];
  original.edges = [];
  const loaded = loadUrlSharedConversation(encodeShareDataForUrl(original));
  assertExists(loaded);
  assertEquals(loaded.nodes.length, 0);
  assertEquals(loaded.edges.length, 0);
  // The conversation itself still survives the round-trip.
  assertEquals(loaded.conversation.title, "Spider Goats vs the Post Office");
});

Deno.test("decompressData returns null on garbage instead of throwing", () => {
  // A truncated/corrupt share link must fail soft (viewer sees "not found",
  // not a thrown error / white screen).
  assertEquals(decompressData("@@@not-valid-base64@@@"), null);
  assertEquals(loadUrlSharedConversation("totally bogus"), null);
});
