/**
 * Export format registry guards: the mismatch sentinel clause must reference
 * REAL format labels (the old inline refusals drifted — "Technical format"
 * never existed), and the suggestion ranker must read conversation shape.
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  buildExportPrompt,
  EXPORT_SLOTS,
  FORMAT_MISMATCH_PREFIX,
  markdownPrompts,
  pickExportFormats,
} from "../../utils/markdownPrompts.ts";

Deno.test("every suggestInstead id resolves to a real format", () => {
  const ids = new Set(markdownPrompts.map((p) => p.id));
  for (const p of markdownPrompts) {
    for (const alt of p.suggestInstead ?? []) {
      assert(ids.has(alt), `${p.id} suggests unknown format "${alt}"`);
    }
  }
});

Deno.test("formats with alternatives get the sentinel clause; others don't", () => {
  for (const p of markdownPrompts) {
    const built = buildExportPrompt(p);
    const hasClause = built.includes(FORMAT_MISMATCH_PREFIX);
    assertEquals(
      hasClause,
      (p.suggestInstead ?? []).length > 0,
      `${p.id} sentinel clause mismatch`,
    );
    // Real labels only — derived from the registry, so check one resolves.
    if (hasClause) {
      const firstAlt = markdownPrompts.find((x) =>
        x.id === p.suggestInstead![0]
      );
      assert(built.includes(firstAlt!.label));
    }
  }
});

Deno.test("every format has an icon and a description for the picker", () => {
  for (const p of markdownPrompts) {
    assert(p.icon.startsWith("fa-"), `${p.id} icon`);
    assert(p.description.length > 0, `${p.id} description`);
  }
});

Deno.test("picker: a meeting with finished work leads with Meeting + What got done", () => {
  const picked = pickExportFormats({
    actionItemCount: 5,
    completedActionCount: 2,
    topicCount: 4,
    transcriptLength: 4000,
    speakerCount: 3,
  }).map((p) => p.id);
  assertEquals(picked[0], "meeting-minutes");
  assert(picked.includes("done-report"));
  assert(picked.includes("action-plan"));
  assert(!picked.includes("journal-entry"), "no journal for a room of voices");
});

Deno.test("picker: one voice, no tasks reads like a journal; meeting stays home", () => {
  const picked = pickExportFormats({
    actionItemCount: 0,
    completedActionCount: 0,
    topicCount: 3,
    transcriptLength: 2000,
    speakerCount: 1,
  }).map((p) => p.id);
  assertEquals(picked[0], "journal-entry");
  assert(!picked.includes("meeting-minutes"));
  assert(
    !picked.includes("done-report"),
    "nothing finished, nothing to report",
  );
});

Deno.test("picker: something tiny is best distilled", () => {
  const picked = pickExportFormats({
    actionItemCount: 0,
    completedActionCount: 0,
    topicCount: 1,
    transcriptLength: 200,
    speakerCount: 1,
  }).map((p) => p.id);
  assertEquals(picked[0], "summary-report");
  assert(picked.includes("haiku"));
});

Deno.test("picker: always exactly six, unique, real formats", () => {
  const picked = pickExportFormats({
    actionItemCount: 10,
    completedActionCount: 4,
    topicCount: 10,
    transcriptLength: 100,
    speakerCount: 5,
  });
  assertEquals(picked.length, EXPORT_SLOTS);
  assertEquals(new Set(picked.map((p) => p.id)).size, EXPORT_SLOTS);
  const ids = new Set(markdownPrompts.map((p) => p.id));
  for (const p of picked) assert(ids.has(p.id));
});
