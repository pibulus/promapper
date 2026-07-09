/**
 * paragraphizeSummary — wall-of-text summaries regroup into short paragraphs;
 * anything the AI already structured passes through byte-identical.
 */

import { assert } from "./_assert.ts";
import { paragraphizeSummary } from "../../utils/summaryFormat.ts";

Deno.test("one long paragraph regroups into 2-sentence beats", () => {
  const wall = "The town held an emergency meeting. Mabel admitted to " +
    "biting the pig. The pig had previously bitten Old Man Perkins. The " +
    "situation escalated when Mabel also bit Mrs. Patterson for suggesting " +
    "insufficient remorse. Sheriff Buck laid down a three-point plan. " +
    "Perkins remains committed to his pig-riding ambitions.";
  const out = paragraphizeSummary(wall);
  const paras = out.split("\n\n");
  assert(paras.length >= 2, `expected paragraphs, got ${paras.length}`);
  assert(out.replaceAll("\n\n", " ") === wall, "text content changed");
});

Deno.test("already-structured summaries pass through untouched", () => {
  const structured = "First point here.\n\nSecond paragraph here.";
  assert(paragraphizeSummary(structured) === structured);
  const bullets = "- did the thing\n- did the other thing";
  assert(paragraphizeSummary(bullets) === bullets);
  const heading = "# Recap\nSome text under it.";
  assert(paragraphizeSummary(heading) === heading);
});

Deno.test("short summaries stay as they are", () => {
  const short = "The goats escaped. Dennis is on it. Fence needs wire.";
  assert(paragraphizeSummary(short) === short);
  assert(paragraphizeSummary("") === "");
});

Deno.test("honorific dots don't split sentences", () => {
  const wall = "Mabel bit Mrs. Patterson at the meeting hall. Dr. Holloway " +
    "checked the wounds afterwards. The sheriff took notes. Everyone went " +
    "home. The pig remains at large. Nobody pressed charges.";
  const out = paragraphizeSummary(wall);
  for (const para of out.split("\n\n")) {
    assert(
      !/\b(Mrs|Dr)\.$/.test(para),
      `paragraph broke mid-name: "${para}"`,
    );
  }
  assert(out.includes("Mrs. Patterson"), "Mrs. Patterson got split");
  assert(out.includes("Dr. Holloway"), "Dr. Holloway got split");
});

Deno.test("no stranded one-liner tail paragraph", () => {
  const five = "Sentence one is here. Sentence two is here. Sentence " +
    "three is here. Sentence four is here. Tail.";
  const out = paragraphizeSummary(five);
  const paras = out.split("\n\n");
  assert(
    paras[paras.length - 1].length >= 60 || paras.length === 1 ||
      paras[paras.length - 1].split(/[.!?]/).filter((s) => s.trim()).length >
        1,
    `stranded tail: "${paras[paras.length - 1]}"`,
  );
});
