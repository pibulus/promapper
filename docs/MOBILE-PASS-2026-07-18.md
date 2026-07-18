# Mobile Love Pass — 2026-07-18 (branch `fable-mobile-2026-07-18`)

Premium-mobile session: two report-only agent audits (mechanics only, every
claim verified against code) + a live Playwright walk at 354–390px, with
Pablo picking every taste call from rendered screenshots.

## Shipped (4 commits on this branch)

1. `7d1a44f` **Mobile header** — wordmark air, tight 1.8rem icon cluster
   (44px tap boxes intact), title strip. Superseded by 4 below for phones.
2. `54216f8` **Hardening batch** — node-map svg `touch-action: pan-y`
   (empty-canvas thumbs scroll the page; nodes stay `none` so drags never
   fight), iOS focus-zoom killed on rename/add-topic/speaker inputs
   (typeless inputs never matched the `input[type="text"]` guard), Export
   + History drawers mutually exclusive (they could stack inescapably),
   Modal body-scroll lock, whiteboard 500px → `min(55svh, 440px)` on
   phones + tap-box extensions on draw buttons + dead `.live-layout*` CSS
   deleted, action-editor preset chips get vertical tap boxes, voice
   drawer + mapper-scene in svh/dvh, recording timer derives from wall
   clock (iOS background throttling made it lie).
3. `b842776` **Escape closes the history drawer** (was the only overlay
   without it) + the 16px anti-zoom guard now carries `!important` —
   classed fields (.action-edit-textarea computed 13px) were beating the
   bare element selector.
4. `eab7d3c` **Open-air landing + footer title strip** (Pablo's picks from
   rendered options): container card + pillboxes gone on phones, hero +
   cream capture slab float on the sky, fold-exact fit (767/767),
   sentence-case CTAs; conversation title docks as the footer's top strip
   (accent tint, dot lead-in, thumb zone), header single-row,
   --header-height 68→52. The h1 stays sr-only for a11y/desktop.
   Implementation note: the header's backdrop-filter is a containing
   block — a fixed-position strip inside it renders at the TOP; hence a
   real element in the footer.

261 tests green, `deno task build` passes, zero horizontal overflow at
354px on landing + conversation views.

## Parked / still owed

- **Real-iPhone QA** (the standing July list + everything above): pan-y
  feel on the node map, svh sheets, footer strip with safe-area, the
  editor keyboard dance. Emulation can't sign these off.
- **Live mode at phone width** — needs the PartyKit worker (zone full);
  the voice-drawer/live-transcript/one-handed check waits on hosting.
- **Header actions edge-fade hint** when the live-session icon cluster
  overflows (needs a scroll-aware affordance, not a static fade).
- **Whiteboard tap-to-expand fullscreen** — height clamp shipped;
  a dedicated fullscreen toggle is the next step if inline still feels
  cramped on-device.
- **Backgrounding mid-recording** — timer now honest, but a "recording
  paused while you were away" surface for iOS-killed mic tracks is
  still open (visibilitychange listener).
- `islands/VoicePanel.tsx` has an uncommitted iOS AudioContext
  sample-rate fix from outside this session — deliberately left
  uncommitted here.
