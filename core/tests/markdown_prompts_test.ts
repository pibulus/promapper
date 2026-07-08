/**
 * Export format registry guards: the mismatch sentinel clause must reference
 * REAL format labels (the old inline refusals drifted — "Technical format"
 * never existed), and the suggestion ranker must read conversation shape.
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  buildExportPrompt,
  FORMAT_MISMATCH_PREFIX,
  markdownPrompts,
  suggestFormatIds,
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

Deno.test("suggestions: tasks + multiple voices reads like a meeting", () => {
  const ids = suggestFormatIds({
    actionItemCount: 5,
    topicCount: 4,
    transcriptLength: 4000,
    speakerCount: 3,
  });
  assertEquals(ids[0], "meeting-minutes");
  assert(ids.includes("action-plan"));
});

Deno.test("suggestions: one voice, no tasks reads like a journal", () => {
  const ids = suggestFormatIds({
    actionItemCount: 0,
    topicCount: 3,
    transcriptLength: 2000,
    speakerCount: 1,
  });
  assertEquals(ids[0], "journal-entry");
});

Deno.test("suggestions: something tiny is best distilled", () => {
  const ids = suggestFormatIds({
    actionItemCount: 0,
    topicCount: 1,
    transcriptLength: 200,
    speakerCount: 1,
  });
  assertEquals(ids[0], "summary-report");
  assert(ids.includes("haiku"));
});

Deno.test("suggestions: never more than three, always at least one", () => {
  const ids = suggestFormatIds({
    actionItemCount: 10,
    topicCount: 10,
    transcriptLength: 100,
    speakerCount: 5,
  });
  assert(ids.length >= 1 && ids.length <= 3);
  assertEquals(new Set(ids).size, ids.length);
});
