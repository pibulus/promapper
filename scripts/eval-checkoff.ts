/**
 * Self-checkoff eval — evidence for the OPENROUTER_STATUS_MODEL knob.
 *
 * Runs a fixture set of weird-human utterances against the REAL API and
 * scores which action-item status flips each model gets right. The metric
 * that matters is FALSE POSITIVES: a wrong checkoff hides real work in the
 * done drawer; a missed one costs the user a tap.
 *
 *   deno task eval:checkoff             # A/B: flash-lite vs haiku
 *   deno task eval:checkoff <model-id>  # just one model
 *
 * Costs ~1-2¢ per full run. Needs OPENROUTER_API_KEY (loaded via --env-file).
 */

import { createOpenRouterService } from "@core/ai/openrouter.ts";
import type { ActionItem } from "@core/types/index.ts";

const now = new Date().toISOString();
const item = (
  id: string,
  description: string,
  status: "pending" | "completed",
): ActionItem => ({
  id,
  conversation_id: "eval",
  description,
  assignee: null,
  due_date: null,
  status,
  created_at: now,
  updated_at: now,
});

// The standing Dusty Gulch task list. `posters` starts completed so reopen
// cases have something to reopen.
const ITEMS: ActionItem[] = [
  item(
    "fence",
    "Sheriff Buck to mend the west fence before the goats find the gap",
    "pending",
  ),
  item("pie", "Mabel to bake an apology pie for the Hendersons", "pending"),
  item("roof", "Old Man Perkins to patch the chapel roof", "pending"),
  item(
    "posters",
    "Doc Holloway to take down the old bite-warning posters",
    "completed",
  ),
  item(
    "letters",
    "Someone to answer the spider-mail piling up at the post office",
    "pending",
  ),
];

interface EvalCase {
  name: string;
  utterance: string;
  /** id → expected new status. Empty object = expect NO flips. */
  expect: Record<string, "completed" | "pending">;
}

const CASES: EvalCase[] = [
  {
    name: "clear completion, first person",
    utterance:
      "Buck here — mended that west fence this morning, the goats can sulk about it.",
    expect: { fence: "completed" },
  },
  {
    name: "clear completion, reported",
    utterance:
      "Mabel dropped the apology pie at the Hendersons' place yesterday. They cried a little.",
    expect: { pie: "completed" },
  },
  {
    name: "planning trap",
    utterance: "I'll get to the chapel roof next week if the weather holds.",
    expect: {},
  },
  {
    name: "discussion trap",
    utterance:
      "We spent half the meeting arguing about the west fence again. Strong opinions on posts.",
    expect: {},
  },
  {
    name: "started-but-not-done trap",
    utterance:
      "Perkins has started on the chapel roof — three shingles in and very proud.",
    expect: {},
  },
  {
    name: "promise trap",
    utterance:
      "Mabel swears the apology pie is happening this weekend, cross her heart.",
    expect: {},
  },
  {
    name: "negation trap",
    utterance:
      "Nobody has touched the spider-mail. It's becoming a whole thing at the post office.",
    expect: {},
  },
  {
    name: "sarcasm trap",
    utterance:
      "Oh sure, the west fence fixed itself overnight. Magic fence. Incredible.",
    expect: {},
  },
  {
    name: "clear reopen",
    utterance:
      "Turns out those bite-warning posters are still up behind the feed store — Doc missed a spot.",
    expect: { posters: "pending" },
  },
  {
    name: "reopen trap (reminiscing)",
    utterance:
      "Remember when Doc took those posters down? Good times. Simpler times.",
    expect: {},
  },
  {
    name: "two completions in one breath",
    utterance:
      "Big day: the fence is mended and the pie got delivered. Dusty Gulch heals.",
    expect: { fence: "completed", pie: "completed" },
  },
  {
    name: "unrelated chatter",
    utterance:
      "The swamp radio picked up someone reciting soup recipes at midnight again.",
    expect: {},
  },
  {
    name: "completion of a NON-listed task",
    utterance: "Finished my crossword in eleven minutes. Personal best.",
    expect: {},
  },
  {
    name: "conditional trap",
    utterance:
      "If Buck fixes the fence tomorrow, we can finally stop worrying about the goats.",
    expect: {},
  },
];

interface ModelResult {
  model: string;
  pass: number;
  falsePositives: number;
  falseNegatives: number;
  failures: string[];
}

async function evalModel(model: string): Promise<ModelResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.error(
      "OPENROUTER_API_KEY missing — run via `deno task eval:checkoff`.",
    );
    Deno.exit(1);
  }
  const service = createOpenRouterService({
    apiKey,
    model,
    statusModel: model,
  });

  const result: ModelResult = {
    model,
    pass: 0,
    falsePositives: 0,
    falseNegatives: 0,
    failures: [],
  };

  const outcomes = await Promise.all(CASES.map(async (c) => {
    const updates = await service.checkActionItemStatus(c.utterance, ITEMS);
    const got: Record<string, string> = {};
    for (const u of updates) got[u.id] = u.status;
    return { c, got };
  }));

  for (const { c, got } of outcomes) {
    let fp = 0;
    let fn = 0;
    for (const [id, status] of Object.entries(got)) {
      if (c.expect[id] !== status) fp++;
    }
    for (const [id, status] of Object.entries(c.expect)) {
      if (got[id] !== status) fn++;
    }
    if (fp === 0 && fn === 0) {
      result.pass++;
    } else {
      result.falsePositives += fp;
      result.falseNegatives += fn;
      result.failures.push(
        `  ✗ ${c.name}\n      expected ${JSON.stringify(c.expect)} got ${
          JSON.stringify(got)
        }`,
      );
    }
  }
  return result;
}

const requested = Deno.args[0];
const models = requested
  ? [requested]
  : ["google/gemini-3.1-flash-lite", "~anthropic/claude-haiku-latest"];

console.log(
  `Checkoff eval — ${CASES.length} cases, ${ITEMS.length} standing items\n`,
);

for (const model of models) {
  const r = await evalModel(model);
  console.log(`${r.model}`);
  console.log(
    `  ${r.pass}/${CASES.length} cases clean · false positives: ${r.falsePositives} · false negatives: ${r.falseNegatives}`,
  );
  for (const f of r.failures) console.log(f);
  console.log("");
}

console.log(
  "Read it like this: FALSE POSITIVES are the metric that matters — a wrong\ncheckoff hides real work. False negatives just cost the user one tap.",
);
