/**
 * AI Prompts - The Nervous System Core
 *
 * All AI prompts in one place, provider-agnostic.
 * Framework-agnostic, reusable across any implementation
 */

import type { ActionItem, NodeInput } from "../types/index.ts";

// ===================================================================
// TRANSCRIPTION
// ===================================================================

export const TRANSCRIPTION_PROMPT =
  `Transcribe this audio file accurately and completely,
removing any redundant 'ums,' 'likes, 'uhs', and similar filler words.
Return only the cleaned-up transcription, with no additional text.

I want you to denote all the different speakers.
If you can work out their names then use their name, otherwise use Speaker1, Speaker2 etc.
Make sure you show each speaker's name before their text.
`;

// ===================================================================
// ACTION ITEMS
// ===================================================================

export const ACTION_ITEMS_BASE_PROMPT = `Extract action items
If there are not action item then make one called 'No action items' and set the assignee to null and the due date to null.
Return only a JSON array like this:
[
  {
    "description": "task description",
    "assignee": "person or null",
    "due_date": "YYYY-MM-DD or null"
  }
]`;

export const buildActionItemsPrompt = (
  input: string | unknown,
  speakers: string[] = [],
  existingActionItems: ActionItem[] = [],
): string => {
  // Build existing items context to avoid duplicates
  const existingItemsContext = existingActionItems.length > 0
    ? `\n\nEXISTING ACTION ITEMS (do not duplicate these):\n${
      existingActionItems.map((item) => `- ${item.description}`).join("\n")
    }\n\nIMPORTANT: Only extract NEW action items that are NOT already in the existing list above. If a new item is semantically the same as an existing one (even if worded differently), DO NOT include it.`
    : "";

  if (typeof input !== "string") {
    return `Listen to this audio and ${ACTION_ITEMS_BASE_PROMPT}${existingItemsContext}`;
  }

  const speakerPrompt = speakers && speakers.length
    ? `\nAvailable speakers for assignment: ${speakers.join(", ")}`
    : "";

  return `Analyze this text and ${ACTION_ITEMS_BASE_PROMPT}${speakerPrompt}${existingItemsContext}\n\nText: ${input}`;
};

// ===================================================================
// AI SELF-CHECKOFF (The Magic!)
// ===================================================================

export const buildActionItemStatusPrompt = (
  existingActionItems: ActionItem[],
): string => {
  const actionItemsJSON = JSON.stringify(
    existingActionItems.map((item) => ({
      id: item.id,
      description: item.description,
      assignee: item.assignee,
      status: item.status,
    })),
  );

  return `Based on the following audio, determine if any of these action items have been completed or need to be uncompleted.

Existing Action Items:
${actionItemsJSON}

Return a JSON array of action items that need their status changed, with the following structure:
[
  {
    "id": "action-item-id",
    "description": "task description",
    "status": "completed" or "pending",
    "reason": "brief explanation of why this status changed"
  }
]

If no action items need to be updated, return an empty array: []
`;
};

// ===================================================================
// TITLE GENERATION
// ===================================================================

export const buildTitlePrompt = (transcript: string): string => {
  return `Generate a concise and descriptive title (3-4 words maximum) for this conversation transcript.
Return only the title text, no quotes or additional text.

TRANSCRIPT: ${transcript}`;
};

// ===================================================================
// TOPIC/NODE EXTRACTION (Conversation Graph)
// ===================================================================

export const buildTopicExtractionPrompt = (
  text: string,
  existingNodes: NodeInput[] = [],
): string => {
  // Build existing nodes context to reuse them
  const existingNodesContext = existingNodes.length > 0
    ? `\n\nEXISTING TOPICS (reuse these if applicable):\n${
      existingNodes.map((node) =>
        `- ID: "${node.id}" | ${node.emoji} ${node.label}`
      ).join("\n")
    }\n\nIMPORTANT: If you identify a topic that is the same as or very similar to an existing topic above, REUSE the existing node ID instead of creating a new one. Only create NEW node IDs for genuinely new topics that don't match any existing ones.`
    : "";

  return `Analyze the following conversation and extract the main topics and their relationships.
I want a you to break down the conversation into the topics covered and how they are related.
I'm not interested in a chronoliogical order, but rather the relationships of the topics.

The purpose of this it to provide a live visualisation of the conversation for note taking but also to
prevent interruptions of the speaker by letting all participants have a visualisation of what all the topics
that have been mentioned/discussed so that they can circle back to them later.
Make sure to include all the main topics and their relationships, err in favour of more topics rather than less.

Use a color scheme for the edges to show the relationships between the topics.
Base the colours on having a white background but being muted and understated modern style of understated colours.
Dont make it black and white.

Provide an emoji for each topic in the emoji field. Do not include the emoji in the label.

Return a JSON object with the following structure:
{
	"nodes": [
		{
			"id": "node1",
			"label": "Topic 1",
			"color": "#4287f5",
			"emoji": "😀"
		},
		{
			"id": "node2",
			"label": "Topic 2",
			"color": "#42f5a7",
			"emoji": "🤔"
		}
	],
	"edges": [
		{
			"source_topic_id": "node1",
			"target_topic_id": "node2",
			"color": "#999999"
		}
	]
}${existingNodesContext}

IMPORTANT: Only summarise the conversation which is the text below denoted as CONVERSATION.

CONVERSATION: ${text}`;
};

// ===================================================================
// SUMMARY GENERATION
// ===================================================================

export const buildSummaryPrompt = (text: string): string => {
  return `Summarize the following conversation text. Focus on the main points and key takeaways. Return the summary in a concise and clear format.

CONVERSATION TEXT:
${text}`;
};

// ===================================================================
// EXPORT TRANSFORMATION
// ===================================================================

export const buildMarkdownTransformPrompt = (
  formatPrompt: string,
  text: string,
): string => {
  return `Transform the following conversation text according to these instructions:

${formatPrompt}

Return the result in markdown format, properly formatted and structured.
Only return the markdown content, no additional text or explanations.
Use proper markdown syntax including headers, lists, code blocks, etc as appropriate.

CONVERSATION TEXT:
${text}`;
};
