/**
 * A `/shared/<id>` snapshot is a photo.
 *
 * The share API is GET-only and a URL share is bytes in a link, so there is
 * nowhere for a tick, a rename or a new task to be written. Every mutation ran
 * on it anyway: the whole editing surface worked, armed undo toasts, and threw
 * the work away on the next refresh, with one banner line as the only warning.
 *
 * The UI hides those affordances now, but this is the net under it — the one
 * place every map mutation routes through — so a surface added later can't
 * quietly bring the lie back. Live rooms are deliberately NOT shared views:
 * everyone in a room owns their copy and edits for real.
 */

import { assert, assertEquals } from "./_assert.ts";
import {
  conversationData,
  isViewingShared,
} from "../../signals/conversationStore.ts";
import {
  addTopic,
  deleteEdge,
  deleteTopic,
  mergeTopics,
  persistTopicPositions,
  renameSpeaker,
  renameTopic,
  setActionItems,
  toggleActionItem,
} from "../../signals/actionItemsStore.ts";
import type { ConversationData } from "../types/conversation-data.ts";

function seeded(): ConversationData {
  return {
    conversation: { id: "c1", title: "Tape machine", source: "text" },
    transcript: { text: "Nan: the kick pedal is cactus", speakers: ["Nan"] },
    nodes: [
      { id: "n1", label: "kick pedal", emoji: "🥁", color: "#E8839C" },
      { id: "n2", label: "tape machine", emoji: "📼", color: "#5DBEAA" },
    ],
    edges: [{ id: "e1", source_topic_id: "n1", target_topic_id: "n2" }],
    actionItems: [{
      id: "a1",
      conversation_id: "c1",
      description: "fix the kick pedal",
      assignee: "Nan",
      due_date: null,
      status: "pending",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }],
    statusUpdates: [],
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("a shared snapshot refuses every map mutation", () => {
  conversationData.value = seeded();
  isViewingShared.value = true;
  const before = conversationData.value;

  toggleActionItem("a1");
  setActionItems([]);
  renameTopic("n1", "bass drum");
  deleteTopic("n1");
  mergeTopics("n1", "n2");
  deleteEdge("n1", "n2");
  renameSpeaker("Nan", "Nanette");
  persistTopicPositions({ n1: { x: 10, y: 10 } });
  const added = addTopic({ label: "a topic that must not appear" });

  // Same object, untouched — the ops return NEW objects, so an applied
  // mutation would change the reference even if the content looked similar.
  assert(conversationData.value === before, "a mutation slipped through");
  assertEquals(added, null);
  assertEquals(conversationData.value?.actionItems[0].status, "pending");
  assertEquals(conversationData.value?.nodes.length, 2);

  isViewingShared.value = false;
  conversationData.value = null;
});

Deno.test("the same mutations still work on a conversation that IS yours", () => {
  isViewingShared.value = false;
  conversationData.value = seeded();

  toggleActionItem("a1");
  assertEquals(conversationData.value?.actionItems[0].status, "completed");

  renameTopic("n1", "bass drum");
  assertEquals(conversationData.value?.nodes[0].label, "bass drum");

  assert(addTopic({ label: "reverb tank" }) !== null);
  assertEquals(conversationData.value?.nodes.length, 3);

  conversationData.value = null;
});
