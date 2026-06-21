import { assertEquals } from "./_assert.ts";
import {
  mergeAppendActionItems,
  normalizeDescription,
} from "../orchestration/append-merge.ts";
import type { ActionItem } from "../types/index.ts";

const timestamp = "2026-06-10T00:00:00.000Z";

function item(
  id: string,
  description: string,
  status: "pending" | "completed" = "pending",
): ActionItem {
  return {
    id,
    conversation_id: "conversation-1",
    description,
    assignee: null,
    due_date: null,
    status,
    created_at: "2026-06-09T00:00:00.000Z",
    updated_at: "2026-06-09T00:00:00.000Z",
  };
}

Deno.test("mergeAppendActionItems applies status updates to existing items", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap")],
    [item("new-1", "Book the venue")],
    [{
      id: "existing-1",
      status: "completed",
      reason: "The new recording says the recap was sent.",
    }],
    timestamp,
  );

  assertEquals(merged.length, 2);
  assertEquals(merged[0].status, "completed");
  assertEquals(merged[0].ai_checked, true);
  assertEquals(
    merged[0].checked_reason,
    "The new recording says the recap was sent.",
  );
  assertEquals(merged[0].updated_at, timestamp);
  assertEquals(merged[1].description, "Book the venue");
});

Deno.test("mergeAppendActionItems can reopen an existing completed item", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Publish the post", "completed")],
    [],
    [{
      id: "existing-1",
      status: "pending",
      reason: "The recording clarified it is not published yet.",
    }],
    timestamp,
  );

  assertEquals(merged.length, 1);
  assertEquals(merged[0].status, "pending");
  assertEquals(merged[0].ai_checked, true);
});

Deno.test("mergeAppendActionItems skips duplicate extracted items", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap")],
    [
      item("new-1", " send the recap "),
      item("new-2", "Confirm launch date"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.map((actionItem) => actionItem.description), [
    "Send the recap",
    "Confirm launch date",
  ]);
});

Deno.test("mergeAppendActionItems skips semantic duplicates (punctuation + filler)", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Send the recap email")],
    [
      item("new-1", "send recap email."),
      item("new-2", "Please send the recap email!"),
      item("new-3", "Book the venue"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.map((actionItem) => actionItem.description), [
    "Send the recap email",
    "Book the venue",
  ]);
});

Deno.test("mergeAppendActionItems dedupes within the extracted batch", () => {
  const merged = mergeAppendActionItems(
    [],
    [
      item("new-1", "Confirm the launch date"),
      item("new-2", "confirm launch date"),
    ],
    [],
    timestamp,
  );

  assertEquals(merged.length, 1);
  assertEquals(merged[0].description, "Confirm the launch date");
});

Deno.test("mergeAppendActionItems keeps distinct tasks that share words", () => {
  const merged = mergeAppendActionItems(
    [item("existing-1", "Email the client")],
    [item("new-1", "Email the designer")],
    [],
    timestamp,
  );

  assertEquals(merged.length, 2);
});

Deno.test("normalizeDescription collapses noise but preserves meaning", () => {
  assertEquals(
    normalizeDescription("Please send the recap email!"),
    normalizeDescription("send recap email"),
  );
  assertEquals(normalizeDescription("Book the venue."), "book venue");
  // Distinct tasks must not collapse together
  if (
    normalizeDescription("Email the client") ===
      normalizeDescription("Email the designer")
  ) {
    throw new Error("distinct descriptions normalized to the same key");
  }
});
