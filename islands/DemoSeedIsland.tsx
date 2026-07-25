/**
 * Demo seeder — dev-only.
 *
 * Writes a fully-formed conversation straight into localStorage and bounces to
 * the dashboard, so screenshots and demos don't need a live AI round-trip (or
 * an API key). Everything here is fake but SHAPED like real output: diarised
 * speakers, an AI-checked-off action item with its reason, a topic graph with
 * real edges, notes, and a summary.
 *
 * Test data follows the house rule — weird human material, never corporate
 * cosplay. See the test-data-voice memory.
 */

import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import type { ConversationData } from "@core/types/conversation-data.ts";

const CID = "demo-halloran";
const NOW = "2026-07-26T09:14:00.000Z";

const TRANSCRIPT =
  `Sheriff Dun: Right, third callout this week. Start from the top.
Deputy Ruiz: Marge Halloran. Bit the postman Tuesday, bit Terry Dwyer at the feed store Thursday, and this morning she took a chunk out of the vet.
Sheriff Dun: The vet. She bit the vet.
Deputy Ruiz: The vet was there for the alpacas. She got him at the gate before he'd even parked.
Sheriff Dun: And Cormac's saying what, exactly?
Deputy Ruiz: That she's been like this since the sinkhole opened up in the north paddock. Says she went down there with a torch one night and came back different. Won't eat anything cooked.
Sheriff Dun: Cormac's been saying the north paddock's cursed since 1998. That's not evidence, that's a hobby.
Deputy Ruiz: The council geologist did say the sinkhole isn't on any survey. Nothing under there should be hollow.
Sheriff Dun: I want the bite reports pulled, all three. And someone from health down here — if this is rabies I need it in writing before I put a woman in a cell for it.
Deputy Ruiz: Doc Feeney already ran bloods. Came back clean. Better than clean, actually — he said her iron's the best he's seen in forty years of practice.
Sheriff Dun: Better than clean.
Deputy Ruiz: His words. He wants to run them again, reckons the machine's off.
Sheriff Dun: Get the machine checked, then. And Ruiz — nobody goes near that sinkhole. Not you, not Cormac, not the bloody geologist, until I've got a fence round it.
Deputy Ruiz: Terry's already selling tickets.
Sheriff Dun: Of course he is.`;

const item = (
  id: string,
  description: string,
  assignee: string | null,
  due_date: string | null,
  status: "pending" | "completed",
  extra: Record<string, unknown> = {},
) => ({
  id,
  conversation_id: CID,
  description,
  assignee,
  due_date,
  status,
  created_at: NOW,
  updated_at: NOW,
  ...extra,
});

const DEMO: ConversationData = {
  conversation: {
    id: CID,
    title: "The Halloran Situation",
    source: "text",
    transcript: TRANSCRIPT,
    created_at: NOW,
  },
  transcript: {
    text: TRANSCRIPT,
    speakers: ["Sheriff Dun", "Deputy Ruiz"],
  },
  nodes: [
    { id: "n1", label: "Marge Halloran", emoji: "🧑‍🌾", color: "#E8839C" },
    { id: "n2", label: "The biting", emoji: "🦷", color: "#F2A65A" },
    { id: "n3", label: "The sinkhole", emoji: "🕳️", color: "#7C6BAD" },
    { id: "n4", label: "Bloodwork", emoji: "🩸", color: "#C2555F" },
    { id: "n5", label: "Cormac's curse theory", emoji: "🔮", color: "#5B9E8F" },
    { id: "n6", label: "The alpacas", emoji: "🦙", color: "#D9A441" },
    { id: "n7", label: "Terry's ticket stand", emoji: "🎟️", color: "#4E8AB8" },
  ],
  edges: [
    { id: "e1", source_topic_id: "n1", target_topic_id: "n2", color: "" },
    { id: "e2", source_topic_id: "n1", target_topic_id: "n3", color: "" },
    { id: "e3", source_topic_id: "n3", target_topic_id: "n5", color: "" },
    { id: "e4", source_topic_id: "n1", target_topic_id: "n4", color: "" },
    { id: "e5", source_topic_id: "n2", target_topic_id: "n4", color: "" },
    { id: "e6", source_topic_id: "n1", target_topic_id: "n6", color: "" },
    { id: "e7", source_topic_id: "n3", target_topic_id: "n7", color: "" },
    { id: "e8", source_topic_id: "n2", target_topic_id: "n7", color: "" },
  ],
  actionItems: [
    item(
      "a1",
      "Pull the bite reports — postman, Terry, the vet",
      "Ruiz",
      "today",
      "pending",
    ),
    // The self-checkoff, visible: a later line in the same take says it's done.
    item(
      "a2",
      "Get Doc Feeney to run the bloods",
      "Ruiz",
      "before Friday",
      "completed",
      {
        ai_checked: true,
        checked_reason: "Ruiz says Feeney already ran them — came back clean.",
      },
    ),
    item(
      "a3",
      "Fence the sinkhole before anyone else goes down",
      "Dun",
      "this week",
      "pending",
    ),
    item(
      "a4",
      "Health department, in writing, before she goes in a cell",
      "Dun",
      null,
      "pending",
    ),
    item(
      "a5",
      "Have the lab machine checked — Feeney reckons it's off",
      "Feeney",
      null,
      "pending",
    ),
    item(
      "a6",
      "Tell Terry to stop selling tickets",
      "Ruiz",
      "whenever",
      "pending",
    ),
  ],
  statusUpdates: [
    {
      id: "a2",
      description: "Get Doc Feeney to run the bloods",
      status: "completed",
      reason: "Ruiz says Feeney already ran them — came back clean.",
    },
  ],
  summary:
    "Three bites in a week — the postman on Tuesday, Terry Dwyer at the feed store on Thursday, and this morning the vet, who never made it past the gate. Marge Halloran is the common thread and nobody agrees on why. Cormac dates the change to the night she went down the new sinkhole in the north paddock with a torch, and the council geologist concedes the hole isn't on any survey and shouldn't be hollow. Doc Feeney's bloods came back clean — better than clean, the best iron he's seen in forty years — which he distrusts enough to blame his own machine. Dun wants all three bite reports pulled and health involved in writing before he'll put a woman in a cell, and a fence round the sinkhole before anyone else goes near it. Terry is already selling tickets.",
  notes:
    "Feeney's \"better than clean\" is the thread to pull. Also: she won't eat anything cooked.",
};

export default function DemoSeedIsland() {
  const status = useSignal("Seeding…");

  useEffect(() => {
    if (saveConversation(DEMO)) {
      status.value = "Seeded — opening the dashboard…";
      globalThis.location.href = "/";
    } else {
      status.value = "Storage write failed (full?). Nothing was seeded.";
    }
  }, []);

  return <p style={{ textAlign: "center", padding: "2rem" }}>{status.value}</p>;
}
