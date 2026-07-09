/**
 * Module registry — the rack.
 *
 * A module is a card that plugs into the dashboard grid and reads/writes the
 * conversation JSON (the bus). Adding one is drop-a-file + register-a-line,
 * same seam as vizRegistry and the export formats. Full ruleset:
 * docs/MODULES.md.
 *
 * Modules ship OFF by default and are switched on in the rack (the ghost
 * tile at the end of the dashboard). Render order = registry order — the
 * board stays arranged.
 */

import type { ComponentType } from "preact";
import NotesModule from "./NotesModule.tsx";
import BishopModule from "./BishopModule.tsx";
import RadioModule from "./RadioModule.tsx";
import CanvasModule from "./CanvasModule.tsx";

/** small = short tile (tucks into leftover cells), standard = a core-card
 * cell, wide = full row. */
export type ModuleSize = "small" | "standard" | "wide";

export interface ModuleEntry {
  id: string;
  /** Sentence case, warm, no jargon. */
  name: string;
  /** One line for the rack — what it does, in the app's voice. */
  tagline: string;
  /** FontAwesome icon name, without the `fa-` prefix. */
  icon: string;
  size: ModuleSize;
  component: ComponentType;
}

export const moduleRegistry: ModuleEntry[] = [
  {
    id: "notes",
    name: "Notes",
    tagline: "A scratch pad that stays with this conversation.",
    icon: "note-sticky",
    size: "standard",
    component: NotesModule,
  },
  {
    id: "bishop",
    name: "Bishop",
    tagline: "Ask your memory — answers from this conversation only.",
    icon: "chess-bishop",
    size: "standard",
    component: BishopModule,
  },
  {
    id: "radio",
    name: "Radio",
    tagline: "KPAB and friends, while you map.",
    icon: "radio",
    size: "small",
    component: RadioModule,
  },
  {
    id: "canvas",
    name: "Canvas",
    tagline: "Draw by hand — your sketch is already there when you go live.",
    icon: "pen-ruler",
    size: "wide",
    component: CanvasModule,
  },
];
