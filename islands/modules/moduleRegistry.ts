/**
 * Module registry — the rack.
 *
 * A module is a card that plugs into the dashboard grid and reads/writes the
 * conversation JSON (the bus). Adding one is drop-a-file + register-a-line,
 * same seam as vizRegistry and the export formats. Full ruleset:
 * docs/MODULES.md.
 *
 * Modules ship OFF by default and are switched on in the rack (the ghost
 * tile at the end of the dashboard). Render order defaults to registry
 * order; dragging cards writes the user's own arrangement
 * (@signals/boardOrderStore).
 */

import type { ComponentType } from "preact";
import NotesModule from "./NotesModule.tsx";
import BishopModule from "./BishopModule.tsx";
import TakesModule from "./TakesModule.tsx";
import SoundModule from "./SoundModule.tsx";

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
    size: "small",
    component: NotesModule,
  },
  {
    id: "bishop",
    name: "Bishop",
    tagline: "Ask your memory — answers from this conversation only.",
    icon: "chess-bishop",
    size: "small",
    component: BishopModule,
  },
  {
    id: "takes",
    name: "Takes",
    tagline: "Every recording kept — listen back, see what each one changed.",
    icon: "record-vinyl",
    size: "standard",
    component: TakesModule,
  },
  {
    id: "sound",
    name: "Sound",
    tagline: "Radio and a hum for your head — one dial.",
    icon: "radio",
    size: "small",
    component: SoundModule,
  },
];
