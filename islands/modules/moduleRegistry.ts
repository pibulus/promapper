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
import type { BoardSize } from "@utils/boardLayout.ts";
import NotesModule from "./NotesModule.tsx";
import AskModule from "./AskModule.tsx";
import TakesModule from "./TakesModule.tsx";
import SoundModule from "./SoundModule.tsx";
import MagpieModule from "./MagpieModule.tsx";

/** The 1:2:4 row system (utils/boardLayout.ts): small = 1 unit, medium = 2,
 * tall = 4. This is the module's DEFAULT — users cycle sizes per card. */
export type ModuleSize = BoardSize;

export interface ModuleEntry {
  id: string;
  /** Sentence case, warm, no jargon. */
  name: string;
  /** One line for the rack — what it does, in the app's voice. */
  tagline: string;
  /** FULL FontAwesome class, `fa-` prefix included. The prefix is not
   * optional bookkeeping: scripts/build-fa-subset.py finds the icons to keep
   * by scanning source for literal `fa-*` tokens, so a name assembled at
   * render time (`fa-${icon}`) is invisible to it and ships as a blank box. */
  icon: string;
  size: ModuleSize;
  component: ComponentType;
}

export const moduleRegistry: ModuleEntry[] = [
  {
    id: "notes",
    name: "Notes",
    tagline: "A scratch pad that stays with this conversation.",
    icon: "fa-note-sticky",
    size: "small",
    component: NotesModule,
  },
  {
    id: "ask",
    name: "Ask",
    tagline: "Ask a question — answered from this conversation only.",
    icon: "fa-circle-question",
    size: "small",
    component: AskModule,
  },
  {
    id: "takes",
    name: "Takes",
    tagline: "Every recording kept — listen back, see what each one changed.",
    icon: "fa-record-vinyl",
    size: "medium",
    component: TakesModule,
  },
  {
    id: "sound",
    name: "Sound",
    tagline: "Radio and a hum for your head — one dial.",
    icon: "fa-radio",
    size: "small",
    component: SoundModule,
  },
  {
    id: "magpie",
    name: "Magpie",
    tagline: "A shelf for shiny things — drop files, links, scraps.",
    icon: "fa-gem",
    size: "medium",
    component: MagpieModule,
  },
];
