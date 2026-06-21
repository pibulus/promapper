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
import ArcDiagramViz from "./ArcDiagramViz.tsx";

export interface VizEntry {
  id: string;
  label: string;
  component: ComponentType;
}

export const vizRegistry: VizEntry[] = [
  { id: "map", label: "Map", component: EmojimapViz },
  { id: "threads", label: "Threads", component: ArcDiagramViz },
  // Add new visualizations here, e.g.:
  // { id: "cloud", label: "Cloud", component: WordCloudViz },
];

export const defaultVizId = vizRegistry[0].id;
