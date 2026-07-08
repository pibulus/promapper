/**
 * EmojimapViz Island - Topic Graph Visualization
 *
 * Non-chronological topic map showing emoji nodes and their relationships
 * Uses force-directed physics simulation for organic layout
 */

import { useComputed } from "@preact/signals";
import { isProcessing } from "@signals/conversationStore.ts";
import ForceDirectedGraph from "./ForceDirectedGraph.tsx";

export default function EmojimapViz() {
  const loading = useComputed(() => isProcessing.value);

  // No zero-node gate here — ForceDirectedGraph owns the warm 🌱 empty state.
  // The old grey "No topic map yet" text shadowed it for everyone.
  return <ForceDirectedGraph loading={loading.value} />;
}
