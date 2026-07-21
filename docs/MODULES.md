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
  size: "small" | "medium" | "tall"; // the DEFAULT — users cycle per card
  component: ComponentType; // an island, renders a .dashboard-card
}
```

Registered in `islands/modules/moduleRegistry.ts` — drop a file in
`islands/modules/`, add one entry. Same seam as `vizRegistry` and the export
formats.

## The rules

1. **Three sizes, one grid — 1:2:4, halving all the way.** Every card is ONE
   pillar wide (3 desktop / 2 tablet / 1 phone) and spans fixed row units:
   `small` = 1, `medium` = 2, `tall` = 4. Two smalls make a medium, two mediums
   make a tall — the grid computes the packing natively (`grid-auto-rows` +
   `grid-auto-flow: dense`), holes back-fill themselves. Cards drag to rearrange
   and TAP-resize on the grip (`useGridSortable` + `boardOrderStore`): order +
   sizes persist per user; the canvas is the one exception (full row, fixed, not
   resizable). No freeform x/y positions — cells always pack. Deep reading stays
   with the ReaderModal.
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
6. **Modules can FLIP.** Wrap your own card in `FlipCard` (front/back are
   closures over the same signals — state sharing is free). Radio's back is its
   station dial; the pattern is yours.
7. **Small modules are habitat.** Ambient/delight modules (radio, palette, a
   cat) should be `small` — they exist to make leftover grid cells feel
   intentional.

## Current rack

| Module | Size   | What it does                                                                                      |
| ------ | ------ | ------------------------------------------------------------------------------------------------- |
| Notes  | small  | Scratch pad stored in the conversation JSON.                                                      |
| Bishop | small  | Ask your memory — reads this conversation to answer.                                              |
| Takes  | medium | Every recording kept — listen back + append receipts (reads recordingsDB, same rows as the dock). |
| Sound  | small  | Radio + Tones as one dial: SomaFM/KPAB streams up top, WebAudio moods below the seam.             |

Retired (July 19 compression): Radio + Tones merged into Sound; Canvas left the
rack entirely — the whiteboard is now the node map's FLIP SIDE (the AI draws the
front, you draw the back; news dots mark hidden-face activity). `moduleStore`
migrates legacy enabled ids on load.

## Height units (July 22 — replaced the July 19 width units)

Sizes are fixed HEIGHTS on a row rhythm (`--board-row` in styles.css): every
card spans 2 grid columns (one pillar), and `small`/`medium`/`tall` span 1/2/4
row units. Core cards default `medium`; users cycle any card's size by tapping
its grip and drag anything anywhere — order + size overrides live in
`promapper-board-order` / `promapper-board-sizes`
(`@signals/boardOrderStore.ts`). The grid's dense flow does all packing; the
notes+takes pair sharing one card is the only grouping logic left in code
(`utils/boardLayout.ts` planCells).

## Faceplates (July 20 — MONO)

Card header bands are ONE colour: the accent band, on every card (the July 19
trio and the brief duo experiment are both dead — Pablo's ruling: "headers are
consistent"). The rack's colour relationships live between LAYERS instead: each
theme's ground family ↔ the band ↔ the CTA plate — the trio law in
docs/COLOR-SYSTEM.md. Per-theme grounds and accents are defined in FOUR places
that must stay in sync: `static/styles.css` (:root defaults and recipes),
`core/theme/themes.ts` (per-theme cssVars incl. `--gradient-bg` skies),
`routes/_app.tsx` (FOUC map), `core/theme/randomTheme.ts` (shuffle pairs).

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
