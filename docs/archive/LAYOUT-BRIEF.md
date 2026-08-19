# ProMapper Board Layout — the brief

ultrathink. This is a dedicated pass on how ProMapper's dashboard BOARD works as
a spatial thing — how cards and modules fit, flow, and feel. You have license to
research, think, and choose your own direction: what follows is context and
taste-calibration, not a spec. Where this brief guesses, you're allowed to
conclude differently — bring reasons, and show options as rendered screenshots
rather than arguing in the abstract.

Repo: `~/Projects/active/apps/promapper` (Deno Fresh, `deno task dev` →
localhost:8003, iterate with Playwright screenshots). Read `docs/MODULES.md` and
the `promapper-modules` + `promapper-visual-language` memories first.

## Where the board is today (July 20)

- 6-unit CSS grid (4 on tablet), `grid-auto-flow: dense`. Core cards span 2;
  `small` modules are one pillar wide and HALF-tall (13rem body cap);
  consecutive smalls STACK two-to-a-pillar (`.module-cell--stack`); Notes ↔
  Takes share a FlipCard cell when both are enabled; the map ↔ canvas
  centerpiece spans full width and flips. `wide` spans the row.
- This works, and the board finally closes flat-ish. But it's rigid: heights
  come from caps and stacking special-cases, not from a real vertical rhythm.
  The obvious next rung is HEIGHT UNITS — `grid-auto-rows` at a base unit
  (~8-9rem), every card declaring a height span like it declares a width span,
  dense packing tucking things into vertical gaps. That sketch is a starting
  hypothesis, not a mandate — pressure-test it. (Watch out: the equal-height
  card machinery in styles.css — the `height: 0` flex trick on card bodies —
  will fight naive row units. Understand it before touching it.)

## The dream, and the scar

Pablo, verbatim-ish, thinking out loud: "man, drag and drop masonry boards would
be so lush and is one we've been trying to crack for a while, it would be a
beautiful thing if it was smooth and flowy, but like, damn, i get it."

The scar: the ORIGINAL app (`~/Projects/active/apps/conversation_mapper`) WAS a
drag-drop masonry board — Packery + Draggabilly in `ConversationView.svelte`,
plus two abandoned experiments worth studying
(`ConversationViewGrid.svelte.old`: 12-col named grid-areas;
`ConversationViewMuuri.svelte.old`: absolute-masonry with small/medium/large
width tiers, bouncy `cubic-bezier(0.34, 1.56, 0.64, 1)` release easing,
lift-on-hover). It was lush AND it was pain — drag persistence, reflow jank, a
board that never felt settled. docs/MODULES.md rule 1 ("no freeform drag, no
masonry — the board stays arranged") is the scar tissue. You may challenge that
rule, but only consciously: if you propose drag, you own the answers to "where
does order persist, what happens on mobile, why won't it jank, why won't the
board feel unsettled."

Research worth doing before deciding: current state of NATIVE CSS masonry
(`display: masonry` / the item-flow proposals — support has been actively
landing; verify what is actually shippable in 2026 browsers), the View
Transitions API for smooth reflow when cards move/toggle, FLIP-animation
patterns (anime.js is already vendored), and how Muuri/Packery solved packing.
An arranged board that ANIMATES beautifully between arrangements may deliver the
"smooth and flowy" feeling with none of the drag pain — or maybe a tiny amount
of constrained drag (reorder within the rack, not freeform x/y) is the 80/20.
Your call to make, with evidence.

## The module-count worry (also verbatim-ish)

"maybe more modules just makes a mess of it all.. im not sure, but like smaller
modules kinda sounds cool, or maybe we can like, hide em or pin em, maybe they
can be selected from the side drawer.."

Signals to take from that, without over-literalizing:

- The board should look NICE at any module count — 0 modules or 8. Today every
  enabled module renders always; there's no notion of pinned vs tucked-away, and
  a maximalist rack could get messy.
- Ideas in the air (evaluate, don't just implement all): even-smaller module
  tiers; pin/hide states; modules living in the history side-drawer or a dock
  until summoned; the rack modal (ModuleRack) growing into the place you MANAGE
  the board, not just toggle it. The "unlock/purchase seam" in moduleStore
  matters — whatever you do must keep per-module enable state.
- The deeper want under all of it: the board should feel SETTLED (arranged,
  intentional, closes flat) and ALIVE (flowy transitions, things tuck in nicely)
  at the same time. That pair of adjectives is the actual spec.

## Hard constraints

- 80/20 ruthlessly: prefer the smallest mechanism that delivers the feeling.
  Complexity theatre gets vetoed here historically.
- Registry stays the source of module truth (drop-a-file + register-a-line);
  conversation-scoped remount keys stay; the JSON-bus rule stays.
- Do not touch color tokens/theme files (separate system, docs/COLOR-SYSTEM.md
  is law). Mobile single-column order (actions lead, transcript last) stays.
- `deno task check` + `deno task test` green (280+); commit in Pablo's emoji
  style; update docs/MODULES.md and the promapper-modules memory with whatever
  new law you create.
- Taste process: Pablo has the taste. Build rendered options, screenshot across
  a couple of themes/widths, show side-by-side (AskUserQuestion previews work
  well), let him point. Don't generate taste by committee.

## Deliverables

1. A decision write-up in `docs/LAYOUT-SYSTEM.md`: the vertical-rhythm mechanism
   you chose, the masonry/drag verdict (do / don't / later, with the reason),
   and the module-count story (pin/hide/drawer or why not).
2. Implementation of whatever you decided, with the board demonstrably nice at:
   0 modules, all modules, phone width, and mid-desktop.
3. Screenshots to Pablo at each decision point; parked taste calls listed with
   one-line flips.
