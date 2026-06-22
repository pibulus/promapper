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
    <div class="relative h-full">
      {
        /* Map / Threads toggle — overlaid on the map's top-left so it doesn't
          need its own header band. */
      }
      {vizRegistry.length > 1 && (
        <div class="topic-viz-tabs">
          {vizRegistry.map((viz) => (
            <button
              key={viz.id}
              onClick={() => (activeViz.value = viz.id)}
              class={`mode-tab mode-tab--compact ${
                activeViz.value === viz.id ? "active" : ""
              }`}
              aria-pressed={activeViz.value === viz.id}
            >
              {viz.label}
            </button>
          ))}
        </div>
      )}

      <ActiveComponent />
    </div>
  );
}
