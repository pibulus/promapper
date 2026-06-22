/**
 * Visualization Selector — switcher for the topic-map visualizations.
 *
 * Renders whatever is registered in vizRegistry.ts. One viz → a single label
 * pill. Two or more → a compact dropdown menu (current viz + chevron), so the
 * switcher scales cleanly to many visualizations without becoming a button row.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { defaultVizId, vizRegistry } from "./vizRegistry.ts";

export default function VisualizationSelector() {
  const activeViz = useSignal<string>(defaultVizId);
  const menuOpen = useSignal(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = vizRegistry.find((v) => v.id === activeViz.value) ??
    vizRegistry[0];
  const ActiveComponent = active.component;
  const hasChoices = vizRegistry.length > 1;

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen.value) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        menuOpen.value = false;
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") menuOpen.value = false;
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen.value]);

  return (
    <div class="relative h-full">
      {
        /* Viz switcher — floats on the map's top-left. A single registered viz
          renders as a plain label pill; multiple show a dropdown. */
      }
      <div class="topic-viz-switcher" ref={wrapRef}>
        {hasChoices
          ? (
            <>
              <button
                type="button"
                class="topic-viz-trigger"
                onClick={() => (menuOpen.value = !menuOpen.value)}
                aria-haspopup="menu"
                aria-expanded={menuOpen.value}
                title="Switch visualization"
              >
                <i class={`fa fa-${active.icon}`} aria-hidden="true"></i>
                <span>{active.label}</span>
                <i class="fa fa-chevron-down text-xs" aria-hidden="true"></i>
              </button>
              {menuOpen.value && (
                <div class="topic-viz-menu" role="menu">
                  {vizRegistry.map((viz) => (
                    <button
                      key={viz.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={viz.id === activeViz.value}
                      class={`topic-viz-menu-item ${
                        viz.id === activeViz.value ? "active" : ""
                      }`}
                      onClick={() => {
                        activeViz.value = viz.id;
                        menuOpen.value = false;
                      }}
                    >
                      <i class={`fa fa-${viz.icon}`} aria-hidden="true"></i>
                      <span>{viz.label}</span>
                      {viz.id === activeViz.value && (
                        <i class="fa fa-check ml-auto" aria-hidden="true"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )
          : (
            <span class="topic-viz-label">
              <i class={`fa fa-${active.icon}`} aria-hidden="true"></i>
              <span>{active.label}</span>
            </span>
          )}
      </div>

      <ActiveComponent />
    </div>
  );
}
