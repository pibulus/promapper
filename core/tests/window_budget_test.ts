import { assert, assertEquals } from "./_assert.ts";
import {
  type BudgetEntry,
  consumeWindowBudget,
} from "../../services/windowBudget.ts";

const DAY = 86_400_000;
const T0 = 1_000_000_000_000;

Deno.test("counted budget allows up to the limit, blocks past it", () => {
  const map = new Map<string, BudgetEntry>();
  assert(consumeWindowBudget(map, "ip", 1, 3, DAY, T0));
  assert(consumeWindowBudget(map, "ip", 1, 3, DAY, T0 + 1));
  assert(consumeWindowBudget(map, "ip", 1, 3, DAY, T0 + 2));
  assertEquals(consumeWindowBudget(map, "ip", 1, 3, DAY, T0 + 3), false);
});

Deno.test("metered budget (bytes) blocks the request that blows the cap", () => {
  const map = new Map<string, BudgetEntry>();
  assert(consumeWindowBudget(map, "ip", 600, 1000, DAY, T0));
  assertEquals(consumeWindowBudget(map, "ip", 600, 1000, DAY, T0 + 1), false);
});

Deno.test("budget resets after the window elapses", () => {
  const map = new Map<string, BudgetEntry>();
  assert(consumeWindowBudget(map, "ip", 3, 3, DAY, T0));
  assertEquals(consumeWindowBudget(map, "ip", 1, 3, DAY, T0 + 1), false);
  // A day later the stale entry sweeps and the key starts fresh.
  assert(consumeWindowBudget(map, "ip", 1, 3, DAY, T0 + DAY + 1));
});

Deno.test("keys are independent and stale strangers get swept", () => {
  const map = new Map<string, BudgetEntry>();
  assert(consumeWindowBudget(map, "a", 3, 3, DAY, T0));
  assert(consumeWindowBudget(map, "b", 1, 3, DAY, T0));
  assertEquals(consumeWindowBudget(map, "a", 1, 3, DAY, T0 + 1), false);
  // b is unaffected by a's exhaustion.
  assert(consumeWindowBudget(map, "b", 1, 3, DAY, T0 + 2));
  // After the window, a's stale entry is gone from the map entirely.
  assert(consumeWindowBudget(map, "c", 1, 3, DAY, T0 + DAY + 1));
  assertEquals(map.has("a"), false);
});
