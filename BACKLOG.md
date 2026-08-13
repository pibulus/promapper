# ProMapper Backlog — dogfood session 2026-08-13

> Source: Pablo's own ProMapper export (the app planning its own fixes) + voice
> session notes + Claude's read of 4 screenshots. This is the working list for
> the next ProMapper session.

## 🔴 Claude's screenshot diagnosis (start here)

1. **Summary panel renders RAW markdown at giant size.** Screenshots 43/44/45
   all show literal `# Summary` / `**Main Points:**` asterisks on screen, set in
   display-size type. Two bugs in one place: the AI now returns markdown but the
   panel prints it as plain text, and the type scale treats body copy as a
   heading. Fix: parse the markdown, cap the summary at body size. (This is
   Pablo's "summary text is all pretty big" — it's really "markdown not
   rendered".)
2. **Dashboard full-blink on every tick/change.** Smells like a full refetch +
   re-render instead of an optimistic update. Find the mutation handler, update
   the signal locally, reconcile in the background.
3. **Theme shuffle flashes a _different_ theme mid-transition.** Pablo sees a
   split-second of better colors before the final theme lands — consistent with
   two theme systems fighting (e.g. CSS vars swap, then a second pass stomps
   them). He was NOT making it up; treat as a real double-apply.
4. **Processing/loading screen is a trust hole.** Blank screen + small text
   while audio processes. The old conversation-map flow felt better. Wants
   staged visual feedback ("we got you") — perceive/receive law.

## 🟡 Voice-session extras (not in the export)

- **Notes don't sync on live share** (action items DO). Open design question:
  should they? Decide the sync surface deliberately, don't just wire it.
- **microUI-style color picker** for choosing/curating themes — some current
  themes Pablo likes (periwinkle/blue), some he doesn't dig at all. Curate the
  theme bank, cut the duds.
  - Clue from the phantom-theme fix (2026-08-13): the "in-between theme" Pablo
    LIKED was the transition blend — i.e. the same hues at lower chroma. The
    NEON generator may be dealing hotter than his taste; try a chroma-dial or a
    "soft roll" variant when curating.
- **Hover link previews** (like QCC front page tiles) for Magpie items.
- **Soundscape module**: focus mood is a hit ("listened for ages"). Wants more
  moods/stations added in a way that keeps the panel tiny. Maybe mood blending
  later.
- **AI append context**: give the model a brief history of already-captured
  content so appended audio smartly extends vs duplicates (also in export).

## 🟢 Round 2 (typed follow-up, same night)

- **Export drawer empty state** looks sparse/wrong — design a proper empty state
  (ghost snapshot cards, "your exports land here" posture).
- **Snapshot auto-titles** — exports currently untitled; generate from format +
  dominant topic + date (e.g. "Plan — ProMapper fixes — Aug 13").
- **Export immediacy**: Pablo unsure if one-tap-and-done is too fast. Claude's
  take: keep it instant (it's reversible + cheap), but make the feedback LOUDER
  — button pop, toast, snapshot visibly sliding into the shelf with its fresh
  title. Feedback over friction; no confirmation modal.
- **Contextual export buttons** — check if formats already adapt to content; if
  not, dim/reorder formats by what the session actually contains.
- **Append-reconcile is the moat** — "I already did X and Y" ticked items off
  automatically. Protect + polish this loop above all else.
- Payment/wall design — parked, later.

## 📋 Pablo's ProMapper export (verbatim)

### Missing UI Elements

- [ ] Restore flip icon
- [ ] Restore search icon
- [ ] Add icon to sort button in action items module
- [ ] Add icon to delete button

### Sort Cycling Button

- [ ] Single button cycling: newest→oldest / oldest→newest / shuffle

### Action Item Edit UX

- [ ] Reposition edit icons to bottom right
- [ ] Display icons inline with action items
- [ ] Improve clarity on icon functionality

### Delete Confirmation

- [ ] Add confirmation mechanism to delete button

### Grouping Strategy

- [ ] Decide between grouping by tag or by speaker, then implement

### Natural Language Capture

- [ ] Clarify how "when" capture field works with natural language input
- [ ] Verify functionality across different input types

### Tooltip Coverage

- [ ] Add tooltips across interface, prioritize frequent features

### Dashboard & Loading

- [ ] Loading screen: more satisfying and trustworthy
- [ ] Fix dashboard load flicker
- [ ] Mobile: decide if dashboard cards need background container
- [ ] Improve overall app colors / consistency

### Speaker Management

- [ ] Global sync for speaker name changes (transcripts, action items, all
      modules)
- [ ] Rename modal: reduce vertical layout, position properly
- [ ] Rename modal: list existing speakers, allow merging duplicates

### Audio Processing & AI

- [ ] Smarter append parsing (add actions vs expand summary vs extra info)
- [ ] Better visual feedback during append + processing stages
- [ ] Give AI brief history of captured content for smarter appends

### Module Management

- [ ] Hide/close modules within the interface, smooth toggle UX

### Pablo's priority call

- **High**: missing icons, sort cycling, delete confirmation, speaker sync
- **Medium**: loading screen, dashboard flicker, processing feedback, module
  toggle
- **Low**: color refinement, tooltips, grouping decision
