import { assertEquals } from "$std/assert/mod.ts";
import { planEviction } from "../storage/recordingsDB.ts";

const MB = 1024 * 1024;

function meta(id: string, bytes: number, day: number) {
  return { id, bytes, createdAt: `2026-07-${String(day).padStart(2, "0")}` };
}

Deno.test("under both caps evicts nothing", () => {
  const metas = [meta("a", 1 * MB, 1), meta("b", 2 * MB, 2)];
  assertEquals(planEviction(metas, { maxBytes: 10 * MB, maxCount: 10 }), []);
});

Deno.test("over count drops the oldest first", () => {
  const metas = [meta("new", 1, 3), meta("oldest", 1, 1), meta("mid", 1, 2)];
  assertEquals(
    planEviction(metas, { maxBytes: 100 * MB, maxCount: 2 }),
    ["oldest"],
  );
});

Deno.test("over bytes drops oldest until under budget", () => {
  const metas = [
    meta("a", 5 * MB, 1),
    meta("b", 5 * MB, 2),
    meta("c", 5 * MB, 3),
  ];
  // Budget 9MB: must drop a (10 left → still over? 10 > 9 → drop b too → 5 ok)
  assertEquals(
    planEviction(metas, { maxBytes: 9 * MB, maxCount: 10 }),
    ["a", "b"],
  );
});

Deno.test("both caps interact — keeps newest survivors", () => {
  const metas = [
    meta("d", 1 * MB, 4),
    meta("a", 8 * MB, 1),
    meta("c", 1 * MB, 3),
    meta("b", 8 * MB, 2),
  ];
  // maxCount 3 forces dropping a; bytes then 10MB ≤ 12MB budget → done.
  assertEquals(
    planEviction(metas, { maxBytes: 12 * MB, maxCount: 3 }),
    ["a"],
  );
});

Deno.test("empty input is a no-op", () => {
  assertEquals(planEviction([], { maxBytes: 1, maxCount: 0 }), []);
});
