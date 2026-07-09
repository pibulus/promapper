# Modules — the rack standard

ProMapper's dashboard is a synth rack: optional cards ("modules") plug into the
grid, and they compose without wiring because **the conversation JSON is the
bus**. A module never talks to another module — it reads and writes the living
document, and everything downstream (topics, exports, shares, sync) picks the
changes up for free. Emergence without cables.

## The contract

A module is:

```ts
{
  id: string; // kebab-case, stable forever (it's a storage key)
  name: string; // sentence case, warm, no jargon ("Notes", "Bishop")
  tagline: string; // one line for the rack, in the app's voice
  icon: string; // FontAwesome name without the fa- prefix
  size: "small" | "standard" | "wide";
  component: ComponentType; // an island, renders a .dashboard-card
}
```

Registered in `islands/modules/moduleRegistry.ts` — drop a file in
`islands/modules/`, add one entry. Same seam as `vizRegistry` and the export
formats.

## The rules

1. **Three sizes, one grid.** `small` = a short tile that tucks into leftover
   cells; `standard` = a core-card cell; `wide` = full row. The grid packs dense
   (`.dashboard-grid`) so holes get filled. No freeform drag, no masonry — the
   board stays arranged (registry order).
2. **The JSON is the bus.** Persist through `conversationData` (see NotesModule
   / whiteboardScene for the pattern: optional field on `ConversationData`,
   debounced signal update, autosave does the rest). Session-ephemeral state
   stays in the island. Never invent a parallel store.
3. **Off by default.** Users switch modules on in the rack (the ghost tile).
   Enabled set lives in localStorage (`promapper-modules`,
   `@signals/moduleStore.ts`). This is also the unlock seam: "unlocked through
   use" or "purchased" is just a rule about when a registry entry shows in the
   rack.
4. **House style is law.** A module renders a `.dashboard-card` with a
   `.dashboard-card-header` h3 (sentence case) — it inherits the theme bands,
   tokens, and contract automatically. FontAwesome only, no uppercase, no red,
   tooltips via `data-tip`, accent text/fills via
   `--accent-ink`/`--accent-fill`.
5. **Server work goes through the existing seams.** AI calls: a guarded route
   (`requestGuard`) calling the `AIService` — never a key in an island.
   Audio/files: the existing pipeline routes.
6. **Small modules are habitat.** Ambient/delight modules (radio, palette, a
   cat) should be `small` — they exist to make leftover grid cells feel
   intentional.

## Current rack

| Module | Size     | What it does                                 |
| ------ | -------- | -------------------------------------------- |
| Notes  | standard | Scratch pad stored in the conversation JSON. |

## On deck (from the July 10 riff)

- **Bishop** ♗ — ask your memory (chatText over the conversation context).
- **Radio** — small tile, KPAB stream, born gap-filler.
- **Magpie** — collect images/clips/files; OCR feeds the pipeline; exports get
  automatic provenance ("sources") for free.
- **Horizon** — the calendar that isn't one: next few dated things, in prose, in
  your colors.
- **Canvas** — the whiteboard as the node map's flip (the map draws itself; flip
  it over and draw by hand).
- Third-party modules later: same registry, a manifest instead of an import.
