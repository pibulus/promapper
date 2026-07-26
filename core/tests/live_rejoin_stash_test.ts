/**
 * Rejoining a re-shared live room must not delete the copy you left with.
 *
 * `Go Live` mints a brand new room id every time and nothing remembers the old
 * one, so the second share of the same map is a DIFFERENT room carrying the
 * SAME conversation id. A guest who left the first meeting with a copy, edited
 * it for a week and then opened the new link had all of it replaced under that
 * id — silently, and their notes/whiteboard too, because the join path nulls
 * the signal first so applyRemoteConversation has no `mine` to preserve from.
 *
 * These pin the guard: the local copy survives when it has diverged, and no
 * clutter copy is minted when it hasn't (reloading mid-meeting is the common
 * case and must stay silent).
 */

import { assert, assertEquals } from "./_assert.ts";
import type { ConversationData } from "../types/conversation-data.ts";

// Real key/value surface — the guard reads and writes the conversations store.
// defineProperty, not assignment: Deno's `localStorage` is a getter-only global.
function installLocalStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
  return map;
}
installLocalStorage();

const { stashDivergedLocalCopy } = await import("../../signals/liveSync.ts");
const { getConversationList, saveConversation } = await import(
  "../../core/storage/localStorage.ts"
);

function map(title: string, items: string[], notes?: string): ConversationData {
  return {
    conversation: { id: "c1", title, source: "audio", transcript: "" },
    transcript: { text: "", speakers: [] },
    nodes: [{ id: "n1", label: "tape machine", emoji: "📼", color: "#E8839C" }],
    edges: [],
    actionItems: items.map((description, i) => ({
      id: `a${i}`,
      conversation_id: "c1",
      description,
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    })),
    statusUpdates: [],
    ...(notes ? { notes } : {}),
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("a diverged local copy is kept when the room's version lands", () => {
  localStorage.clear();
  // A week of solo work after the first meeting ended.
  saveConversation(
    map("Tape machine", ["fix the kick pedal", "call Nan"], "my notes"),
  );

  // The host re-shared: a new room, same conversation id, their version.
  const stashed = stashDivergedLocalCopy(
    map("Tape machine", ["fix the kick pedal"]),
  );

  assert(stashed !== null, "the guard let the room overwrite a diverged copy");
  assertEquals(stashed?.ok, true);
  assertEquals(stashed?.title, "Tape machine (your copy)");

  const list = getConversationList();
  assertEquals(list.length, 2);
  const copy = list.find((c) => c.conversation.title?.includes("your copy"));
  assert(copy !== undefined, "no copy was filed");
  // Everything of theirs came along, including what the room never carries.
  assertEquals(copy?.actionItems.length, 2);
  assertEquals((copy as unknown as { notes?: string }).notes, "my notes");
  // ...under a NEW id, so the room's version still has the original to land on.
  assert(copy?.id !== "c1");
  assertEquals(copy?.conversation.id, copy?.id);
  assert(list.some((c) => c.id === "c1"));
});

Deno.test("reloading into the same room mints no copy", () => {
  localStorage.clear();
  const same = map("Tape machine", ["fix the kick pedal"]);
  saveConversation(same);

  // Same substance, but re-normalized the way a room round-trip does it.
  const fromRoom = map("Tape machine", ["fix the kick pedal"]);
  fromRoom.conversation.created_at = new Date().toISOString();
  fromRoom.nodes[0].position = { x: 12, y: 40 };

  assertEquals(stashDivergedLocalCopy(fromRoom), null);
  assertEquals(getConversationList().length, 1);
});

Deno.test("a first-time join has nothing to keep", () => {
  localStorage.clear();
  assertEquals(stashDivergedLocalCopy(map("Someone else's map", ["a"])), null);
  assertEquals(getConversationList().length, 0);
});
