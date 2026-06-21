import { assertEquals, assertStringIncludes } from "./_assert.ts";
import { buildExportContext } from "../export/exportContext.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function data(): ConversationData {
  return {
    conversation: {
      id: "c1",
      title: "Launch Sync",
      source: "text",
      transcript: "Mae: lock the budget",
    },
    transcript: { text: "Mae: lock the budget", speakers: ["Mae"] },
    summary: "Team aligned on budget + timeline.",
    nodes: [
      { id: "budget", label: "Budget", emoji: "💰", color: "#5B8DEF" },
      { id: "timeline", label: "Timeline", emoji: "📅", color: "#52A37F" },
    ],
    edges: [
      {
        id: "e1",
        source_topic_id: "budget",
        target_topic_id: "timeline",
        color: "#888",
      },
    ],
    actionItems: [
      {
        id: "a1",
        conversation_id: "c1",
        description: "Lock the budget",
        assignee: "Mae",
        due_date: "2026-07-01",
        status: "pending",
        created_at: "x",
        updated_at: "x",
      },
      {
        id: "a2",
        conversation_id: "c1",
        description: "Sign supplier",
        assignee: "Jon",
        due_date: null,
        status: "completed",
        created_at: "x",
        updated_at: "x",
      },
    ],
    statusUpdates: [],
  };
}

Deno.test("buildExportContext includes title, summary, actions, topics, transcript", () => {
  const ctx = buildExportContext(data(), "");
  assertStringIncludes(ctx, "PROJECT TITLE:\nLaunch Sync");
  assertStringIncludes(ctx, "CURRENT SUMMARY:\nTeam aligned");
  assertStringIncludes(ctx, "OPEN ACTION ITEMS:");
  assertStringIncludes(ctx, "Lock the budget (assignee: Mae; due: 2026-07-01)");
  assertStringIncludes(ctx, "COMPLETED ACTION ITEMS:");
  assertStringIncludes(ctx, "TOPICS:");
  assertStringIncludes(ctx, "💰 Budget");
  assertStringIncludes(ctx, "TOPIC CONNECTIONS:\n- Budget -> Timeline");
  assertStringIncludes(ctx, "TRANSCRIPT:\nMae: lock the budget");
});

Deno.test("buildExportContext falls back to plain text when no conversation", () => {
  assertEquals(
    buildExportContext(null, "just the raw text"),
    "just the raw text",
  );
  assertEquals(buildExportContext(undefined, "raw"), "raw");
});

Deno.test("buildExportContext omits empty sections", () => {
  const bare: ConversationData = {
    conversation: { id: "c", source: "text", transcript: "hello" },
    transcript: { text: "hello", speakers: [] },
    nodes: [],
    edges: [],
    actionItems: [],
    statusUpdates: [],
  };
  const ctx = buildExportContext(bare, "");
  assertEquals(ctx.includes("ACTION ITEMS"), false);
  assertEquals(ctx.includes("TOPICS:"), false);
  assertStringIncludes(ctx, "TRANSCRIPT:\nhello");
});

Deno.test("buildExportContext surfaces the AI self-checkoff reason", () => {
  const d = data();
  (d.actionItems[1] as { checked_reason?: string }).checked_reason =
    "Jon confirmed it's signed";
  const ctx = buildExportContext(d, "");
  assertStringIncludes(ctx, "reason: Jon confirmed it's signed");
});
