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
// import ArcDiagramViz from "./ArcDiagramViz.tsx"; // Threads — hidden for now

export interface VizEntry {
  id: string;
  label: string;
  /** FontAwesome icon name (without the `fa-`) shown in the switcher menu. */
  icon: string;
  component: ComponentType;
}

// The switcher renders whatever is listed here. With one viz it's a single
// pill; add entries and it becomes a dropdown — the UI already scales. To bring
// Threads back: re-import ArcDiagramViz and add its line below.
export const vizRegistry: VizEntry[] = [
  { id: "map", label: "Map", icon: "diagram-project", component: EmojimapViz },
  // { id: "threads", label: "Threads", icon: "wave-square", component: ArcDiagramViz },
  // { id: "cloud", label: "Word cloud", icon: "cloud", component: WordCloudViz },
];

export const defaultVizId = vizRegistry[0].id;
