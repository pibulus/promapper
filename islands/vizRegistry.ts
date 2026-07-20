/**
 * Visualization Registry
 *
 * Single source of truth for the topic-map visualizations. To add a new viz,
 * create its island component and add ONE entry here — VisualizationSelector
 * renders whatever is registered. This is the "dashboard of tools that can
 * grow" seam: drop a file, register a line.
 */

import type { ComponentType } from "preact";
import EmojimapViz from "./EmojimapViz.tsx";

export interface VizEntry {
  id: string;
  label: string;
  /** FontAwesome icon name (without the `fa-`) shown in the switcher menu. */
  icon: string;
  component: ComponentType;
}

// The switcher renders whatever is listed here. With one viz it's a single
// pill; add entries and it becomes a dropdown — the UI already scales.
export const vizRegistry: VizEntry[] = [
  { id: "map", label: "Map", icon: "diagram-project", component: EmojimapViz },
];

export const defaultVizId = vizRegistry[0].id;
