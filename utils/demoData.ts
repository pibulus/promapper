/**
 * Demo Data — pre-baked conversation for instant "try it" preview.
 *
 * Plots a fun, goofy narrative with transcript, topic map, action items,
 * and summary so every dashboard card is populated. No API call needed.
 */

import type { ConversationData } from "../core/types/conversation-data.ts";

export function createDemoConversation(): ConversationData {
  const conversationId = "demo_" + Date.now();
  return {
    conversation: {
      id: conversationId,
      title: "The Biting Incident at Dusty Gulch",
      source: "town-hall",
      transcript: TRANSCRIPT,
      created_at: new Date().toISOString(),
    },
    transcript: {
      text: TRANSCRIPT,
      speakers: ["Sheriff Buck", "Mabel", "Doc Holloway", "Old Man Perkins"],
    },
    summary: SUMMARY,
    nodes: NODES,
    edges: EDGES,
    actionItems: ACTION_ITEMS.map((item) => ({
      ...item,
      conversation_id: conversationId,
    })),
    statusUpdates: [],
  };
}

const TRANSCRIPT =
  `Sheriff Buck: Alright folks, settle down. We're here to discuss the... uh... biting situation. Mabel, you've got the floor.

Mabel: Thank you, Sheriff. Look, I'm not proud of it. But someone had to stand up to the Henderson boys and their prize pig. That animal has been terrorizing my vegetable garden for three months. Three! I tried talking, I tried fences, I tried a sternly worded letter pinned to the pig.

Doc Holloway: You pinned a letter to a pig?

Mabel: I did. It said "Please stop" in block capitals. The pig ate it.

Sheriff Buck: So you... bit the pig?

Mabel: I bit the pig. Yes. Just a little nip on the ear. It was a statement.

Old Man Perkins: (wheezing laugh) That pig bit me first! Back in March! Nobody held a town hall for old Perkins!

Sheriff Buck: Perkins, we covered this. You were trying to ride the pig.

Old Man Perkins: I was breaking him in! The county fair is in September!

Doc Holloway: The real question is what we do about the Hendersons. They've been letting that pig roam free since before Mabel got feisty. And now Mrs. Patterson says she's been bitten too.

Sheriff Buck: Mrs. Patterson was bitten by the pig?

Doc Holloway: No, by Mabel. Mrs. Patterson said the pig "didn't look that sorry" about the garden situation and Mabel took exception.

Mabel: She was victim-blaming the vegetables!

Sheriff Buck: (long sigh) Alright. Here's what we're gonna do. First, I'll talk to the Hendersons about keeping the pig contained — properly this time. Second, Mabel, no more biting. People or pigs. That's an official order.

Mabel: Even if they have it coming?

Sheriff Buck: Especially if they have it coming. Third, Doc, check Mrs. Patterson for... I don't know, bite-related concerns.

Doc Holloway: On it.

Sheriff Buck: And Perkins, the pig is not a rodeo animal.

Old Man Perkins: You can't stop progress, Buck.

Sheriff Buck: I can and I will. Meeting adjourned. Someone get Mabel a cookie, she's had a rough week.`;

const SUMMARY =
  `The town of Dusty Gulch held an emergency meeting to address a growing biting problem. Mabel, a respected gardener, admitted to biting the Henderson family's prize pig after it repeatedly destroyed her vegetable garden over three months. Old Man Perkins revealed the pig had previously bitten him when he attempted to ride it. The situation escalated when Mabel also bit Mrs. Patterson for suggesting the pig showed insufficient remorse. Sheriff Buck laid down a three-point plan: contain the pig, prohibit all biting (human and animal), and have Doc Holloway check Mrs. Patterson's bite wounds. Perkins remains committed to his pig-riding ambitions despite the Sheriff's objections.`;

const NODES = [
  { id: "node_1", label: "The Pig", emoji: "\uD83D\uDC37", color: "#e8839c" },
  {
    id: "node_2",
    label: "Mabel's Garden",
    emoji: "\uD83E\uDD55",
    color: "#6A9FB5",
  },
  {
    id: "node_3",
    label: "The Biting",
    emoji: "\uD83E\uDEE6",
    color: "#C9A0DC",
  },
  {
    id: "node_4",
    label: "Henderson Boys",
    emoji: "\uD83D\uDC68\u200D\uD83C\uDF3E",
    color: "#D4A76A",
  },
  {
    id: "node_5",
    label: "Pig-Riding",
    emoji: "\uD83E\uDD20",
    color: "#7CA82B",
  },
  {
    id: "node_6",
    label: "Mrs Patterson",
    emoji: "\uD83D\uDC75",
    color: "#B5838D",
  },
  {
    id: "node_7",
    label: "Town Hall",
    emoji: "\uD83C\uDFDB\uFE0F",
    color: "#E59866",
  },
];

const EDGES = [
  {
    id: "edge_1",
    source_topic_id: "node_1",
    target_topic_id: "node_2",
    color: "#e8839c",
  },
  {
    id: "edge_2",
    source_topic_id: "node_3",
    target_topic_id: "node_1",
    color: "#C9A0DC",
  },
  {
    id: "edge_3",
    source_topic_id: "node_1",
    target_topic_id: "node_4",
    color: "#e8839c",
  },
  {
    id: "edge_4",
    source_topic_id: "node_3",
    target_topic_id: "node_6",
    color: "#C9A0DC",
  },
  {
    id: "edge_5",
    source_topic_id: "node_5",
    target_topic_id: "node_1",
    color: "#7CA82B",
  },
  {
    id: "edge_6",
    source_topic_id: "node_7",
    target_topic_id: "node_3",
    color: "#E59866",
  },
];

const ACTION_ITEMS = [
  {
    id: "demo_ai_1",
    description:
      "Sheriff Buck to speak with the Henderson boys about containing the pig",
    assignee: "Sheriff Buck",
    due_date: null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo_ai_2",
    description:
      "Mabel prohibited from biting anyone or anything going forward",
    assignee: "Mabel",
    due_date: null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo_ai_3",
    description:
      "Doc Holloway to check Mrs Patterson for bite-related injuries",
    assignee: "Doc Holloway",
    due_date: null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo_ai_4",
    description: "Get Mabel a cookie — she's had a rough week",
    assignee: "Anyone",
    due_date: null,
    status: "completed" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo_ai_5",
    description: "Old Man Perkins must stop attempting to ride the pig",
    assignee: "Old Man Perkins",
    due_date: null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
