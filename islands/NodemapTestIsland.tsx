/**
 * Nodemap Test Island — standalone harness for the node map.
 *
 * Dev-only page that seeds conversationData with a rich topic graph and mounts
 * the real ForceDirectedGraph, plus controls to exercise the "living" behavior
 * (append new nodes/edges) and measure memory in isolation. Not linked from the
 * app — reach it at /dev/nodemap.
 *
 * Seed data is weird-human on purpose (no corporate cosplay), per house style.
 */

import { useSignal } from "@preact/signals";
import { conversationData } from "@signals/conversationStore.ts";
import type { ConversationData } from "@core/types/conversation-data.ts";
import ForceDirectedGraph from "./ForceDirectedGraph.tsx";

// A palette pulled from the vivid pastel-punk reference (bright retro-pop pops).
const POPS = [
  "#FF69B4",
  "#63D6FF",
  "#32CD32",
  "#7659FF",
  "#FFB300",
  "#FF62D7",
  "#00BFFF",
];

type SeedNode = ConversationData["nodes"][number];
type SeedEdge = ConversationData["edges"][number];

// Initial graph: a small swamp-radio-station saga, richly connected so edges
// are obvious if they render.
const SEED_NODES: SeedNode[] = [
  { id: "swamp-radio", label: "swamp radio", emoji: "📻", color: POPS[0] },
  { id: "frog-choir", label: "frog choir", emoji: "🐸", color: POPS[1] },
  { id: "moon-shed", label: "moon shed", emoji: "🌙", color: POPS[2] },
  { id: "seed-jars", label: "seed jars", emoji: "🫙", color: POPS[3] },
  { id: "night-shift", label: "night shift", emoji: "🦉", color: POPS[4] },
  { id: "tape-hiss", label: "tape hiss", emoji: "📼", color: POPS[5] },
];

// Edge colors are deliberately AI-ish muted greys — production data carries
// these (the topic prompt asks for "muted modern hex"), and the harness used
// to seed "" which hid how real conversations rendered. The map must ignore
// them (always EDGE_INK); if grey cobwebs ever show up here, that guard broke.
const SEED_EDGES: SeedEdge[] = [
  {
    id: "e1",
    source_topic_id: "swamp-radio",
    target_topic_id: "frog-choir",
    color: "#8A8F98",
  },
  {
    id: "e2",
    source_topic_id: "swamp-radio",
    target_topic_id: "tape-hiss",
    color: "#6B7280",
  },
  {
    id: "e3",
    source_topic_id: "frog-choir",
    target_topic_id: "moon-shed",
    color: "#9CA3AF",
  },
  {
    id: "e4",
    source_topic_id: "moon-shed",
    target_topic_id: "seed-jars",
    color: "#8A8F98",
  },
  {
    id: "e5",
    source_topic_id: "night-shift",
    target_topic_id: "swamp-radio",
    color: "#7C8590",
  },
  {
    id: "e6",
    source_topic_id: "night-shift",
    target_topic_id: "moon-shed",
    color: "#6B7280",
  },
];

// Extra nodes the "append" button drips in, to test living updates.
const APPEND_BATCHES: { nodes: SeedNode[]; edges: SeedEdge[] }[] = [
  {
    nodes: [
      { id: "lost-sock", label: "lost sock", emoji: "🧦", color: POPS[6] },
      {
        id: "static-ghost",
        label: "static ghost",
        emoji: "👻",
        color: POPS[0],
      },
    ],
    edges: [
      {
        id: "a1",
        source_topic_id: "tape-hiss",
        target_topic_id: "static-ghost",
        color: "#9CA3AF",
      },
      {
        id: "a2",
        source_topic_id: "moon-shed",
        target_topic_id: "lost-sock",
        color: "#8A8F98",
      },
      {
        id: "a3",
        source_topic_id: "static-ghost",
        target_topic_id: "frog-choir",
        color: "#8A8F98",
      },
    ],
  },
  {
    nodes: [
      {
        id: "compost-king",
        label: "compost king",
        emoji: "👑",
        color: POPS[1],
      },
      { id: "rain-barrel", label: "rain barrel", emoji: "🛢️", color: POPS[2] },
      { id: "ham-radio", label: "ham radio", emoji: "📡", color: POPS[3] },
    ],
    edges: [
      {
        id: "b1",
        source_topic_id: "seed-jars",
        target_topic_id: "compost-king",
        color: "#6B7280",
      },
      {
        id: "b2",
        source_topic_id: "compost-king",
        target_topic_id: "rain-barrel",
        color: "#9CA3AF",
      },
      {
        id: "b3",
        source_topic_id: "ham-radio",
        target_topic_id: "swamp-radio",
        color: "#8A8F98",
      },
      {
        id: "b4",
        source_topic_id: "ham-radio",
        target_topic_id: "night-shift",
        color: "#7C8590",
      },
    ],
  },
];

function makeSeed(nodes: SeedNode[], edges: SeedEdge[]): ConversationData {
  const text = "Nan: the swamp radio only plays frog choir after midnight.";
  return {
    conversation: {
      id: "nodemap-test",
      title: "Swamp Radio Saga (test)",
      source: "text",
      transcript: text,
    },
    transcript: { text, speakers: ["Nan", "The Goat"] },
    nodes,
    edges,
    actionItems: [],
    statusUpdates: [],
    summary: "A test graph for the node map harness.",
  };
}

// A 20-node single-subject web — tests whether dense maps stay readable or mush.
const BIG_EMOJI = [
  "🪐",
  "🛰️",
  "☄️",
  "🌌",
  "🔭",
  "👽",
  "🚀",
  "🛸",
  "🌠",
  "🪨",
  "🧑‍🚀",
  "📡",
  "🌙",
  "⭐",
  "🌞",
  "🪂",
  "🧬",
  "⚗️",
  "🦠",
  "🔬",
];
function makeBigSeed(): ConversationData {
  const nodes: SeedNode[] = BIG_EMOJI.map((emoji, i) => ({
    id: `big-${i}`,
    label: `topic ${i + 1}`,
    emoji,
    color: POPS[i % POPS.length],
  }));
  // Connect into a loose web: each node links to a couple of earlier ones.
  const edges: SeedEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({
      id: `bm-${i}a`,
      source_topic_id: nodes[i].id,
      target_topic_id: nodes[Math.floor(i / 2)].id,
      color: "#6B7280",
    });
    if (i > 3 && i % 3 === 0) {
      edges.push({
        id: `bm-${i}b`,
        source_topic_id: nodes[i].id,
        target_topic_id: nodes[i - 3].id,
        color: "#9CA3AF",
      });
    }
  }
  return makeSeed(nodes, edges);
}

// Two disconnected clusters — tests whether disparate subjects drift apart into
// readable blobs instead of tangling. No edge bridges the two groups.
function makeTwoClusterSeed(): ConversationData {
  const work: SeedNode[] = [
    { id: "w1", label: "deadline", emoji: "⏰", color: POPS[1] },
    { id: "w2", label: "the client", emoji: "🧛", color: POPS[1] },
    { id: "w3", label: "invoice", emoji: "🧾", color: POPS[1] },
    { id: "w4", label: "burnout", emoji: "🫠", color: POPS[1] },
    { id: "w5", label: "the pivot", emoji: "🔄", color: POPS[1] },
  ];
  const garden: SeedNode[] = [
    { id: "g1", label: "tomatoes", emoji: "🍅", color: POPS[2] },
    { id: "g2", label: "snails", emoji: "🐌", color: POPS[2] },
    { id: "g3", label: "compost", emoji: "🪱", color: POPS[2] },
    { id: "g4", label: "the shed", emoji: "🏚️", color: POPS[2] },
    { id: "g5", label: "frost", emoji: "❄️", color: POPS[2] },
  ];
  const link = (a: string, b: string, i: number): SeedEdge => ({
    id: `tc-${i}`,
    source_topic_id: a,
    target_topic_id: b,
    color: "#8A8F98",
  });
  const edges: SeedEdge[] = [
    link("w1", "w2", 0),
    link("w2", "w3", 1),
    link("w3", "w4", 2),
    link("w4", "w5", 3),
    link("w5", "w1", 4),
    link("g1", "g2", 5),
    link("g2", "g3", 6),
    link("g3", "g4", 7),
    link("g4", "g5", 8),
    link("g5", "g1", 9),
  ];
  return makeSeed([...work, ...garden], edges);
}

export default function NodemapTestIsland() {
  const appendStep = useSignal(0);

  function seed() {
    conversationData.value = makeSeed([...SEED_NODES], [...SEED_EDGES]);
    appendStep.value = 0;
  }

  function simulateAppend() {
    const batch = APPEND_BATCHES[appendStep.value % APPEND_BATCHES.length];
    const current = conversationData.value ?? makeSeed([], []);
    // Mimic what a real append does: union new nodes/edges into the existing
    // graph (existing nodes keep their identity → should keep position).
    const nodeIds = new Set(current.nodes.map((n) => n.id));
    const edgeIds = new Set(current.edges.map((e) => e.id));
    conversationData.value = {
      ...current,
      nodes: [
        ...current.nodes,
        ...batch.nodes.filter((n) => !nodeIds.has(n.id)),
      ],
      edges: [
        ...current.edges,
        ...batch.edges.filter((e) => !edgeIds.has(e.id)),
      ],
    };
    appendStep.value++;
  }

  function clear() {
    conversationData.value = makeSeed([], []);
  }

  const nodeCount = conversationData.value?.nodes.length ?? 0;
  const edgeCount = conversationData.value?.edges.length ?? 0;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1rem" }}>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <button class="btn btn--primary btn--compact" onClick={seed}>
          Seed graph
        </button>
        <button
          class="btn btn--secondary btn--compact"
          onClick={() => {
            conversationData.value = makeBigSeed();
            appendStep.value = 0;
          }}
        >
          20 nodes
        </button>
        <button
          class="btn btn--secondary btn--compact"
          onClick={() => {
            conversationData.value = makeTwoClusterSeed();
            appendStep.value = 0;
          }}
        >
          Two clusters
        </button>
        <button
          class="btn btn--secondary btn--compact"
          onClick={simulateAppend}
        >
          Simulate append (+batch)
        </button>
        <button class="btn btn--secondary btn--compact" onClick={clear}>
          Clear
        </button>
        <span
          style={{
            fontSize: "var(--small-size)",
            color: "var(--color-text-secondary)",
          }}
        >
          {nodeCount} nodes · {edgeCount} edges
        </span>
      </div>

      {nodeCount === 0
        ? (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--color-text-secondary)",
              border: "2px dashed var(--color-border)",
              borderRadius: "var(--border-radius)",
            }}
          >
            Press “Seed graph” to render the node map.
          </div>
        )
        : <ForceDirectedGraph loading={false} />}
    </div>
  );
}
