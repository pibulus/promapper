/**
 * Markdown Maker Preset Prompts
 *
 * Ported from Svelte project_mapper version
 * 8 preset templates for converting conversations to different formats
 */

export interface MarkdownPrompt {
  id: string;
  label: string;
  prompt: string;
}

export const markdownPrompts: MarkdownPrompt[] = [
  {
    id: "blog-post",
    label: "Blog",
    prompt:
      `Analyze this content and, if it contains narrative-worthy material, transform it into an engaging article in the style of modern web portals like Pedestrian or Kotaku.
If the content isn't suitable for a blog post (e.g., it's too technical or purely procedural), kindly respond with: "This content might work better with a different format. Consider trying the Summary or Meeting format instead."`,
  },
  {
    id: "meeting-minutes",
    label: "Meeting",
    prompt:
      `If this appears to be a discussion or meeting conversation, convert it into formal meeting minutes including:
• Date and participants (if mentioned)
• Key discussion points
• Decisions made
• Action items

If this doesn't appear to be meeting-related content, kindly respond with: "This content doesn't seem to be from a meeting. Perhaps try the Summary or Research format for better results."`,
  },
  {
    id: "technical-spec",
    label: "Specifications",
    prompt:
      `If this conversation contains technical discussion or specifications, transform it into a technical specification document with:
• Overview
• Requirements
• Technical Details
• Implementation Notes
• Considerations

If the content lacks technical substance, kindly respond with: "This conversation doesn't contain enough technical details for a specification document. Consider using the Summary or Action Plan format instead."`,
  },
  {
    id: "summary-report",
    label: "Summary",
    prompt:
      'Create a concise executive summary of this conversation. Focus on key points, decisions, and outcomes. If the content is too brief or lacks substantial points to summarize, kindly note: "This content might be too brief for a meaningful summary. Perhaps try viewing it in its original form."',
  },
  {
    id: "action-plan",
    label: "Plan",
    prompt:
      `Extract and organize any action items or tasks from this conversation into a structured plan. Only include assignees when they are explicitly mentioned in the conversation. Format each item as:
• Task: [description]
• Assignee: [name] (only if explicitly mentioned)
• Suggested timeframe (if mentioned)

If no clear action items are found, respond with: "No specific action items were identified in this conversation. Consider using the Summary format to review the key points instead."`,
  },
  {
    id: "research-notes",
    label: "Research",
    prompt:
      `If this conversation contains research-related discussion, format it as research notes with:
• Topics discussed
• Key findings
• Methodologies mentioned
• Areas for further investigation

If the content isn't research-oriented, kindly respond with: "This conversation doesn't appear to contain research-related content. The Summary or Meeting format might be more appropriate."`,
  },
  {
    id: "journal-entry",
    label: "Journal",
    prompt:
      `If this conversation contains personal insights, experiences, or reflective content, transform it into a thoughtful journal entry with:
• Key reflections
• Personal/professional impact
• Mindful observations
• A touch of wisdom (quote, tarot insight, or philosophical perspective)

If the content is purely technical or procedural, kindly respond with: "This content might be better suited for a different format, as it doesn't contain personal elements for a journal entry. Consider the Summary or Technical format instead."`,
  },
  {
    id: "case-study",
    label: "Report",
    prompt:
      `If this conversation describes a specific situation, problem, or solution implementation, convert it into a case study with:
• Background
• Challenges
• Solutions
• Results
• Lessons Learned

If the content doesn't fit a case study format, kindly respond with: "This conversation doesn't contain enough situation-specific details for a case study. Consider using the Summary or Meeting format instead."`,
  },
  {
    id: "technical-manual",
    label: "Manual",
    prompt:
      `Transform this conversation into a practical technical manual or operating guide.
Use clear sections, ordered steps where useful, assumptions, caveats, and any implementation details mentioned in the source material.

If the conversation does not contain enough procedural or technical detail, kindly respond with: "This conversation doesn't contain enough technical detail for a manual. Consider using the Summary or Action Plan format instead."`,
  },
  {
    id: "haiku",
    label: "Haiku",
    prompt:
      "Distill the essence of this conversation into a haiku or a compact haiku sequence. Preserve the core idea and tone rather than forcing every detail into the poem.",
  },
];
