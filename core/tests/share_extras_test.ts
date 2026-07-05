import { assertEquals } from "$std/assert/mod.ts";
import {
  sanitizeShareConversation,
  sanitizeShareFilter,
  sanitizeShareLive,
} from "../realtime/shareProtocol.ts";

Deno.test("sanitizeShareLive accepts a well-formed roomId only", () => {
  assertEquals(sanitizeShareLive({ roomId: "room-abc_123" }), {
    roomId: "room-abc_123",
  });
  assertEquals(sanitizeShareLive({ roomId: "x" }), undefined); // too short
  assertEquals(sanitizeShareLive({ roomId: "bad/../id" }), undefined);
  assertEquals(sanitizeShareLive({ roomId: 42 }), undefined);
  assertEquals(sanitizeShareLive("nope"), undefined);
});

Deno.test("sanitizeShareFilter trims, caps, and strips control chars", () => {
  assertEquals(sanitizeShareFilter({ assignee: "  Mabel " }), {
    assignee: "Mabel",
  });
  assertEquals(sanitizeShareFilter({ assignee: "" }), undefined);
  assertEquals(sanitizeShareFilter({}), undefined);
  const long = "x".repeat(500);
  assertEquals(
    sanitizeShareFilter({ assignee: long })?.assignee.length,
    120,
  );
});

Deno.test("sanitizeShareConversation carries live+filter through", () => {
  const payload = sanitizeShareConversation({
    conversation: { id: "c1", source: "audio", transcript: "hello world" },
    transcript: { text: "hello world", speakers: [] },
    live: { roomId: "pig-summit-42" },
    filter: { assignee: "Old Man Perkins" },
  });
  assertEquals(payload?.live, { roomId: "pig-summit-42" });
  assertEquals(payload?.filter, { assignee: "Old Man Perkins" });
});

Deno.test("sanitizeShareConversation drops malformed extras", () => {
  const payload = sanitizeShareConversation({
    conversation: { id: "c1", source: "audio", transcript: "hello" },
    transcript: { text: "hello", speakers: [] },
    live: { roomId: "<script>" },
    filter: { assignee: {} },
  });
  assertEquals(payload?.live, undefined);
  assertEquals(payload?.filter, undefined);
});
