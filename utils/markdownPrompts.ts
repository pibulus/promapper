/**
 * Markdown Maker Preset Prompts
 *
 * The export format registry — adding a format is one entry here (growth
 * pattern). Each entry carries a FontAwesome icon + one-line description for
 * the picker, the prompt body, and (optionally) which formats to suggest when
 * the content doesn't suit this one.
 *
 * Format-mismatch contract: presets with `suggestInstead` get a shared clause
 * (buildExportPrompt) telling the model to reply with a single line starting
 * with FORMAT_MISMATCH_PREFIX instead of forcing a bad export. The drawer
 * detects that prefix and shows it as a friendly hint rather than a "success".
 */

export interface MarkdownPrompt {
  id: string;
  label: string;
  /** FontAwesome icon class, e.g. "fa-newspaper" */
  icon: string;
  /** One-liner for the picker (tooltip / hint line) */
  description: string;
  prompt: string;
  /** Format ids to suggest when the content doesn't fit. Omit = always works. */
  suggestInstead?: string[];
}

export const FORMAT_MISMATCH_PREFIX = "FORMAT_MISMATCH:";

/**
 * Shared grounding preamble — the server wraps the transcript in labeled
 * context blocks (see core/export/exportContext.ts); this tells every format
 * to actually use them instead of re-deriving from raw text.
 */
const CONTEXT_PREAMBLE =
  `You will receive structured context blocks: PROJECT TITLE, CURRENT SUMMARY, OPEN/COMPLETED ACTION ITEMS (with assignees and due dates), TOPICS with their connections, and the TRANSCRIPT. Ground your output in those blocks — reuse the real names, tasks, and topics rather than re-deriving or inventing them. Output clean markdown only, with no preamble and no code fences.`;

// Curated to EIGHT on purpose (July 22 trim — was 12 and read as a wall).
// Every format maps to a real ProMapper persona: meetings (Meeting, What got
// done, Plan), research groups (Research), voice notes (Journal), everything
// (Summary, Unasked), joy (Haiku). One-off formats are what the custom
// prompt is for — resist re-adding overlapping presets.
export const markdownPrompts: MarkdownPrompt[] = [
  {
    id: "done-report",
    label: "What got done",
    icon: "fa-clipboard-check",
    description: "Completed work so far — what, by whom, and what's left",
    prompt:
      `Write a warm, factual progress report from this conversation's action items and context. Lead with what has been COMPLETED (group by person where assignees exist, note anything the AI checked off from later conversation). Follow with what's still open. Close with a one-line pulse of the project. Plain headings, short lines, no corporate fluff.`,
    suggestInstead: [],
  },
  {
    id: "meeting-minutes",
    label: "Meeting",
    icon: "fa-users",
    description: "Minutes: who was there, what was decided, what's next",
    prompt:
      `If this appears to be a discussion or meeting conversation, convert it into meeting minutes including:
• Date and participants (if mentioned)
• Key discussion points
• Decisions made
• Action items`,
    suggestInstead: ["summary-report", "research-notes"],
  },
  {
    id: "summary-report",
    label: "Summary",
    icon: "fa-align-left",
    description: "A tight overview of the key points and outcomes",
    prompt:
      "Create a concise summary of this conversation. Focus on key points, decisions, and outcomes. If the content is very brief, keep the summary proportionally short rather than padding it.",
  },
  {
    id: "action-plan",
    label: "Plan",
    icon: "fa-list-check",
    description: "Every task with its owner and timeframe",
    prompt:
      `Extract and organize any action items or tasks from this conversation into a structured plan. Only include assignees when they are explicitly mentioned in the conversation. Format each item as:
• Task: [description]
• Assignee: [name] (only if explicitly mentioned)
• Suggested timeframe (if mentioned)`,
    suggestInstead: ["summary-report"],
  },
  {
    id: "research-notes",
    label: "Research",
    icon: "fa-flask",
    description: "Findings, methods, and open questions",
    prompt:
      `If this conversation contains research-related discussion, format it as research notes with:
• Topics discussed
• Key findings
• Methodologies mentioned
• Areas for further investigation`,
    suggestInstead: ["summary-report", "meeting-minutes"],
  },
  {
    id: "journal-entry",
    label: "Journal",
    icon: "fa-feather",
    description: "A reflective entry with a little wisdom in it",
    prompt:
      `If this conversation contains personal insights, experiences, or reflective content, transform it into a thoughtful journal entry with:
• Key reflections
• Personal/professional impact
• Mindful observations
• A touch of wisdom (quote, tarot insight, or philosophical perspective)`,
    suggestInstead: ["summary-report"],
  },
  {
    id: "unasked",
    label: "Unasked",
    icon: "fa-circle-question",
    description: "Open threads and the questions nobody asked",
    // Deliberately NOT a "bias detector" (the donor app had one; Pablo's
    // ruling: diagnosing people's reasoning is technocratic — out). This
    // surfaces the conversation's open threads with curiosity, not verdicts.
    prompt:
      `Read this conversation for what it circles but never lands on. Surface:
• Open threads — things raised and then dropped without resolution
• Quiet assumptions — what everyone treated as settled without ever saying so
• The unasked questions — the two or three questions that, if someone had asked them, would have changed the conversation
Ground each one in a specific moment (quote or closely paraphrase, with the speaker). No diagnosing anyone, no labels, no scoring — this is a curious friend pointing at loose ends, not an audit. End with the single question most worth asking at the next conversation.`,
    suggestInstead: ["summary-report"],
  },
  {
    id: "haiku",
    label: "Haiku",
    icon: "fa-leaf",
    description: "The whole thing, distilled to seventeen syllables",
    prompt:
      "Distill the essence of this conversation into a haiku or a compact haiku sequence. Preserve the core idea and tone rather than forcing every detail into the poem.",
  },
];

/**
 * Full prompt sent to the server for a preset: grounding preamble + format
 * body + (when the format can mismatch) the sentinel clause. Suggested labels
 * are derived from the registry so they can never drift from the real ones.
 */
export function buildExportPrompt(preset: MarkdownPrompt): string {
  const parts = [CONTEXT_PREAMBLE, preset.prompt];
  const alternatives = (preset.suggestInstead ?? [])
    .map((id) => markdownPrompts.find((p) => p.id === id)?.label)
    .filter(Boolean);
  if (alternatives.length) {
    parts.push(
      `If the content genuinely doesn't suit this format, reply with exactly one line: "${FORMAT_MISMATCH_PREFIX} " followed by a short friendly sentence suggesting the ${
        alternatives.join(" or ")
      } format instead. No other text in that case.`,
    );
  }
  return parts.join("\n\n");
}

/** Traits the suggestion ranker looks at — kept primitive so it's testable. */
export interface ConversationTraits {
  actionItemCount: number;
  topicCount: number;
  transcriptLength: number;
  speakerCount: number;
}

/**
 * Rank which formats fit this conversation — up to three ids, best first.
 * Cheap heuristics on shape, not content: tasks + multiple voices reads like
 * a meeting, many topics reads like research, one voice reads like a journal,
 * something tiny is best distilled.
 */
export function suggestFormatIds(traits: ConversationTraits): string[] {
  const ids: string[] = [];
  const { actionItemCount, topicCount, transcriptLength, speakerCount } =
    traits;

  if (transcriptLength > 0 && transcriptLength < 600) {
    ids.push("summary-report", "haiku");
  }
  if (actionItemCount >= 3) {
    ids.push(speakerCount >= 2 ? "meeting-minutes" : "action-plan");
    ids.push(speakerCount >= 2 ? "action-plan" : "summary-report");
  }
  if (topicCount >= 6) ids.push("research-notes");
  if (speakerCount <= 1 && transcriptLength >= 600) ids.push("journal-entry");
  ids.push("summary-report");

  return [...new Set(ids)].slice(0, 3);
}
