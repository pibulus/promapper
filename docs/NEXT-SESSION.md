# NEXT-SESSION — the overnight module build (July 10, ~02:30)

Main, committed through `d5cb38a`, pushed. Gates green (243 tests, check +
build). Read docs/MODULES.md (the rack standard) + the promapper-modules
memory. Dev: `DENO_ENV=development deno task dev` (8003).

## What got built overnight (Pablo said "go for broke")

**The synth rack is real** (`371f9fb..d5cb38a`):

- **Module standard**: registry (drop-a-file + register-a-line), three
  sizes (small/standard/wide) in one dense grid, conversation JSON as the
  bus, modules OFF by default, the rack ghost tile → modal with toggles.
  Board stays arranged (registry order, no drag).
- **Four instruments**: Notes (scratch pad in the conversation JSON),
  Bishop ♗ (ask your memory — guarded /api/ask via AIService, verified
  live: answers about the pig were correct), Radio (raya port: KPAB +
  SomaFM, small tile), Canvas (whiteboard outside meetings, same
  whiteboardScene field, steps aside during live).
- **Cheap wins**: DiceBear thumbs avatars on chat senders; share IDs
  36-char UUID → 14-char base36 (~72 bits, rejection-sampled); history
  chips de-Tailwinded to theme tokens.
- **The gauntlet ran** (all four briefed on the contract): Rex found an
  unbounded-conversation cost hole in /api/ask AND /api/markdown (fixed:
  context caps) + Notes stale-overwrite (fixed); Bumblefuzz found the
  hall-of-famer — modules didn't remount on conversation switch, so
  Notes/Canvas debounces wrote into the WRONG conversation (fixed:
  conversation-scoped keys + id-pinned writes + unmount cleanup + Bishop
  stale-answer guard); Stacey laid 44px tap floors on the new controls;
  Vince made the rack respond (hover/press/chips/8px rhythm).
- Also fixed live: Excalidraw crashed restoring persisted scenes
  (collaborators Map → plain object after JSON round-trip; stripped).

## Morning taste calls (parked for Pablo, in order)

1. **Canvas as the node map's flip** — the module works; the flip
   unification (map front / canvas back, pencil affordance, maybe
   auto-flip in meetings) is your call. All pieces exist.
2. Roll the rack on a phone — the modules row at 390px got Stacey'd but
   never real-device tested (the eternal caveat).
3. Bishop Q&A is session-ephemeral by design — persist into the
   conversation JSON if you want receipts (one field + one line).
4. Magpie (collection module) and Horizon (the un-calendar) are specced
   in MODULES.md "on deck" — each is roughly an afternoon.
5. Oracle flags: rack rows lack distinct keyboard focus-visible; radio
   now-playing ellipsis wants a long-title device check.
6. Unlock/purchase mechanics: the enabled-set seam is built; "record 10
   takes → radio hums awake" is a rule away.

## Standing items

- Real-device iPhone QA (dock, IDB, safe-area) — still virgin, still
  first.
- Named themes (BUBBLEGUM/SKY/GRAPE/LIME/GOLD) predate the pair system;
  LIME/GOLD violate the taste law. Re-curate + FOUC mirror.
- PDF export: theme header band + map PNG embed (specced July 10 chat).
- The shared-view skinning gap (should feel like THE dashboard).
