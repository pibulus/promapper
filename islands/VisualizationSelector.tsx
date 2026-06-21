/**
 * Visualization Selector - Tab Switcher for Different Viz Types
 *
 * Renders whatever is registered in vizRegistry.ts. To add a visualization,
 * register it there — no changes needed here.
 */

import { useSignal } from "@preact/signals";
import { defaultVizId, vizRegistry } from "./vizRegistry.ts";

export default function VisualizationSelector() {
  const activeViz = useSignal<string>(defaultVizId);

  const active = vizRegistry.find((v) => v.id === activeViz.value) ??
    vizRegistry[0];
  const ActiveComponent = active.component;

  return (
    <div class="flex flex-col h-full">
      {/* Tab Selector */}
      <div class="flex gap-2 mb-4">
        {vizRegistry.map((viz) => (
          <button
            key={viz.id}
            onClick={() => (activeViz.value = viz.id)}
            class={`mode-tab ${activeViz.value === viz.id ? "active" : ""}`}
            aria-pressed={activeViz.value === viz.id}
          >
            {viz.label}
          </button>
        ))}
      </div>

      {/* Visualization Container */}
      <div class="flex-1 min-h-0">
        <ActiveComponent />
      </div>
    </div>
  );
}
