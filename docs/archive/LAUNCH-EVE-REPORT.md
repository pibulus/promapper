# Launch-eve pass — ProMapper

**Aug 17, 2026.** Ten commits, 36 files, +1618/−368. `check`, `test` (397), and
`build` all green.

---

## The headline

**Live collab works in production.** This was the "huge one" and it's the one I
was most prepared to find broken — the docs said it had never run in prod. It
runs. `promapper.app` has both env vars, the worker is healthy, and a real
snapshot POST returns a room id.

I also proved the part nobody had ever tested: **two browsers, same room, live
edit sync.** An action item typed in one tab appeared in the other in about two
seconds with `@who` and `#tag` parsed. Presence counted both.

One booby trap, now defused: my first prod test returned 502 and I nearly wrote
"live collab is down". It was my own empty `{}` payload being correctly
rejected. A bare body gives 502, not the 503 that means "switched off" — that
distinction is now in CLAUDE.md so nobody repeats my minute of panic.

**Append is reliable.** I synthesised real speech, encoded it to the same
webm/opus the browser records, and pushed it through the real endpoint. Every
promise held: self-checkoff got 3/3 right _including the negative_ (the item
whose audio said "not started yet" correctly stayed open), the topic map grew
without trampling existing nodes, and the summary kept its base with an update
block appended. Short takes skip topics/summary by design, not by accident.

---

## NO MAROON

You were right that it was everywhere, and it wasn't the drawer's fault — it was
the colour engine. `deriveStrong()` walked warm accents down until they cleared
contrast on cream, and a dark warm hue _is_ brown. Measured across the wheel it
was producing `#c53550`, `#c63a2a`, `#b84b00`, `#956300` — brick, rust, ochre —
and `--accent-ink` paints text, borders and plates in about a hundred places.

Now the ink is hue-aware: cool hues keep a genuinely coloured deep tone, and
hues on the mud arc give up chroma and resolve to a warm espresso instead.
There's a test that fails the build if any roll ever lands mid-dark-and-warm
again.

Three more places maroon was sneaking in:

- The Preview bar used `--accent-strong` as a big slab. It now rides
  `--header-band` / `--header-band-ink` — the theme system's _solved_ band pair,
  same as every card header. Still fully theme-adaptive, just no longer using
  the one variable that goes espresso.
- The page scrim was a 35% dark wash, which multiplied bright coral bands into
  dusty brick. One `--scrim` token at 18% now, so the page recedes without the
  hue curdling.
- Printed exports took the theme accent for headings. A document isn't a themed
  surface — headings are warm near-black on sepia rules, the same on every roll.

---

## What else got fixed

**The flip icon** you flagged: the button lived _inside_ the rotating plane, so
it mirrored with the card. It sits outside now — only the card turns.

**The wordmark** is pinned to warm near-black on every roll. Verified across six
shuffles while bands travelled pink → blue → cyan → coral → green.

**Every module icon was a blank square.** The subset builder finds icons by
scanning for literal `fa-*` tokens, so `fa-${m.icon}` over `icon: "gem"` was
invisible to it. Eleven glyphs were missing from the shipped font. Registries
hold full class names now and the subset is rebuilt.

**Loading is a moment now.** It was four grey rectangles and a line of text
adrift in the corner. Now the real layout assembles — three cards over a wide
map, each landing a beat after the last, wearing the theme's band — with a
constellation drawing itself where the topics will go, and the progress lines
gathered onto a cream plaque. Opacity and transform only; stops dead under
reduced-motion.

**Magpie holds real files.** Drop them, paste a screenshot, or use the
paperclip. The pointers-not-payloads law is intact: localStorage still stores
only a pointer, and the bytes go to a Blob store shaped like `recordingsDB` — in
its own database, so a version bump can never block audio takes in a second tab.
Images carry thumbnails; tossing takes the bytes with it.

**Limits stopped shouting.** The server's warm sentences were getting `Error:`
stapled on the front and painted red. A limit isn't a failure — those now read
in the app's own voice, in amber.

---

## What the gang found

Three agents went at it. The two that mattered:

**Rex caught me shipping theatre.** The drag-teardown I'd added earlier removed
_nothing_ — the handlers are function declarations, so every render mints new
identities and `removeEventListener` matched none of them. It looked correct in
review. It's fixed properly now, capturing the teardown at registration.

**Bumblefuzz broke the thing I'd just built,** which is exactly the point. Every
serious finding was in tonight's Magpie code:

- Clicking a file did nothing in Safari and Firefox — awaiting IndexedDB spends
  the user gesture, so `window.open` got swallowed. It's a real `<a href>` now.
- Dropping a file 40px wide of the shelf navigated the whole board away. A
  global guard swallows any drop outside a real dropzone.
- Rows whose bytes the cap had evicted stayed on the shelf as clickable lies.
- Backups carried file pointers they couldn't honour.

Also: tossing a file is undoable now (the delete waits out the undo window),
duplicate and 0-byte drops are skipped, and a twenty-file drop gives you one
sentence instead of twenty stacked toasts.

**Stacey** did a genuine a11y and mobile pass: the default secondary ink was
4.25:1 on cream (below AA), the staged-file chip was `aria-hidden` while holding
a focusable button, and its remove button was a 16px glyph with no tap zone.

---

## Two calls that are yours, not mine

**1. First paint flashes the default palette.** Auto-shuffle-on-load means every
visitor paints the CSS defaults, hydrates, then recolours. Fixing it properly
means either duplicating the OKLCH maths inside the inline FOUC script (three
copies of colour logic, the drift problem you already know) or not
auto-shuffling on load. That's your aesthetic call — you added the auto-roll on
purpose, so I left it alone.

**2. The audio rail is daily; the pricing sheet says monthly.** The budget store
buckets by UTC day only, so "~1 hr/month" flattened to a day is about two
minutes. Monthly bucketing is roughly five lines, but it _is_ code, not config.
Related: there's no supporter identity anywhere yet, so the audio limit is
necessarily the same number for everyone, and the live-room seat caps (2 free /
8–10 supporter) have no enforcement point at all. The Keys door — bring your own
OpenRouter key — is the one tier that genuinely ships today; it's fully wired.

---

## Still not done

**Real-device QA on an actual phone.** I drove a real webm/opus file through the
whole pipeline and checked the layout at 390px, but I can't hold an iPhone. The
mic permission prompt, the recording gesture, and how the board feels under a
thumb are still yours to check.
