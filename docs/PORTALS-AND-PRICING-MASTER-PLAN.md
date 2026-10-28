# 🗺️🕸️ ProMapper Master Plan: Unit Economics, Free vs. Paid Fairness, Offline Whisper & The 16-Route Bilingual Web

> **Created:** 2026-10-28\
> **App:** ProMapper (`https://promapper.app` —
> `/Users/pabloalvarado/Projects/active/apps/promapper`)\
> **Crew:** Pablo + Antigravity + Arachne (`16/20`) + Stacey (`8/20`) + Vince
> (`1/20`)

---

## 1. 💡 The Big Question: Should We Keep Live Text Streaming on the Porch, and How Do We Make Free vs. Paid Fair?

### A. DO NOT Lose the Initial Live Text Streaming on the Voice Box!

Watching your words stream into the porch box in real time (`200ms` latency via
Deepgram `nova-3`) the first time you tap **Start recording** is **the single
best conversion hook in the app** (_"You can't receive what you can't
perceive"_).

- **What it actually costs:** A 3-minute porch test-drive costs **`$0.023 USD`
  (2.3 cents)** at retail Deepgram rates — and **`$0.00`** while running on a
  `$200` Deepgram credit (one `$200` credit covers **8,600 three-minute
  takes**!).
- **Verdict:** Never kill the porch magic trick to save 2 cents. Instead, **cap
  the Free Tier's fast cloud audio at 10 minutes/day** so visitors get the full
  goosebumps experience on their daily quick takes, and hit the upgrade
  motivation when they want to record longer sessions.

### B. The Trap You Just Caught: NEVER Give "Unlimited Cloud Audio" on Paid OR "Unlimited Free Whisper" on Free!

Look at what
[`utils/i18n.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/utils/i18n.ts#L131)
and
[`services/requestGuard.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/services/requestGuard.ts#L280)
currently do in the codebase:

- `utils/i18n.ts` says:
  `featTakes: "Unlimited Audio Takes (no daily recording cap)"`
- `services/requestGuard.ts` line 281 says:
  `if (await isSupporterRequest(req)) return null;` (zero cap on cloud audio for
  Supporters!).

**Why that's dangerous:**

1. If a `$49 AUD` (`~$31.50 USD` net) Supporter records 2–3 hours a day on Cloud
   Audio (or shares their pass token with 3 friends), they will burn **100+
   hours of Deepgram (`~$46+ USD`)** and **you lose money out of your own
   pocket**.
2. Conversely, if we gave **Free** users unlimited On-Device Whisper + free LLM
   text runs, Free users would never need to buy the `$49` Pass!

### C. The Street-Smart Fix: 3-Tier Menu (`$0` Free · `$49` Solo Pass · `$99` Guild / Lab / Practice Pass) + Auto-Chunking Marathon Mode!

What if a D&D group, a professor, or a research lab has a **3-to-4 hour
session**? Nobody wants to wait until the end of a 4-hour session to see their
map — and a single 4-hour audio file would be `>150MB` anyway.

**How 3–4 Hour Marathon Sessions Work (Auto-Chunking Rolling Appends):**

1. **Rolling 15-Minute Auto-Appends (Zero Interruption)**:
   - In
     [`islands/AudioRecorder.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/islands/AudioRecorder.tsx),
     when a user is in a long session (or clicks **"Pause / Map So Far & Keep
     Rolling"**), every **10–15 minutes** (at a natural silence break) the
     recorder seamlessly slices the completed 15-minute Take, sends it to
     `/api/append` in the background, and immediately rolls into `Take N+1`
     without dropping a syllable!
   - **Result**: During a 4-hour D&D session or uni workshop, the lore graph,
     action items, and summary update **every 10–15 minutes while they play**,
     and every take is safely saved along the way.
2. **Why a 4-Hour Session Costs Only `32 Cents` (`$0.32 USD`) on
   `/api/append`**:
   - Remember: `/api/append` uses **OpenRouter `~google/gemini-flash-latest`
     audio (`8¢ USD / hour`)**, NOT Deepgram (`46¢ / hour`)!
   - That means a **full 4-hour D&D session** (16 rolling 15-minute appends)
     costs only **`~$0.32 USD` for audio + `~$0.08 USD` for LLM map updates =
     `$0.40 USD` (`~60¢ AUD`) total**!
   - And if a chunk runs through **On-Device Whisper** (which easily crunches a
     10-minute chunk in ~8–12 seconds in the background while the next 10-minute
     chunk is recording!), the audio cost for that chunk is **`$0.00`**!

### D. The `$0` / `$49 AUD` / `$99 AUD` Pricing & Margin Architecture

| Feature / Limit                                 | 🆓 **Free Table (`$0`)**        | 💜 **Solo Pass (`$49 AUD/yr`)**                          | 👑 **Guild, Lab & Practice Pass (`$99 AUD/yr`)**                     | 🔑 **BYO Key (`$0`)**      |
| :---------------------------------------------- | :------------------------------ | :------------------------------------------------------- | :------------------------------------------------------------------- | :------------------------- |
| **Who It's For**                                | Daily quick takes & test drives | Solo creators, students, parents & ADHD brains           | **D&D Groups, Professors, Research Labs & Client Practices**         | Developers & tinkerers     |
| **Porch Live Text Streaming**                   | ✅ First **10 mins/day**        | ✅ Included (**60 mins/day**)                            | ✅ Included (**4 hours/day** Marathon)                               | ⚡ Uses own OpenRouter key |
| **Continuous Session Length**                   | **10 mins / take**              | **Up to 60 mins** _(auto-rolls 15m takes)_               | **Up to 4-Hour Marathons** _(auto-rolls 15m takes live!)_            | **Up to 4-Hour Marathons** |
| **Annual Cloud Audio Bank**                     | **10 mins / day hard cap**      | **40 Hours / year** + **Unlimited On-Device Whisper**    | **120 Hours / year** + **Unlimited On-Device Whisper**               | Unlimited on user's key    |
| **Seat / Party Sharing**                        | 1 browser                       | Personal devices (laptop + phone)                        | **Up to 5 seats** _(whole D&D party or research lab shares 1 Pass!)_ | Personal browser cookie    |
| **Multiplayer Live Rooms + Voice + Excalidraw** | Join via link                   | ✅ **Host Live Rooms**                                   | ✅ **Host Marathon Live Rooms**                                      | ✅ **Host Live Rooms**     |
| **Export Drawer (PDF, Slide Deck, 8 Presets)**  | ✅ Included                     | ✅ All formats + Permanent Links                         | ✅ All formats + Permanent Links                                     | ✅ All formats             |
| **Our Max Annual Cost vs. Net Revenue**         | `~2¢/day` active test           | Cost: `~$4–$8 USD` vs **`$31.50 USD` net (~80% margin)** | Cost: `~$10–$18 USD` vs **`$64.00 USD` net (~75%–85% margin)**       | **`$0.00` cost to us**     |

---

## 2. 💰 Exact Unit Economics (Verified Against Codebase)

From
[`services/ai.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/services/ai.ts),
[`services/deepgram.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/services/deepgram.ts),
[`routes/api/process.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/routes/api/process.ts),
and
[`routes/api/append.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/routes/api/append.ts):

| Pipeline Step                        | Engine & Model                                                | Cost per **10-Min Take** (USD) | Cost per **Full Hour** (USD) | Notes                                                                                                                               |
| :----------------------------------- | :------------------------------------------------------------ | :----------------------------: | :--------------------------: | :---------------------------------------------------------------------------------------------------------------------------------- |
| **Gear 1: Porch Live Stream**        | Deepgram `nova-3` WebSocket                                   |        `$0.077` (7.7¢)         |        `$0.462` (46¢)        | `$0.00` while on `$200` Deepgram credit (**433 hrs / account**). Sends `{ text }` to `/api/process` so audio is never billed twice. |
| **Gear 2: Live Room Chunks**         | Deepgram `nova-3` REST + Diarize                              |        `$0.058` (5.8¢)         |        `$0.348` (35¢)        | `$0.00` while on `$200` Deepgram credit (**570 hrs / account**).                                                                    |
| **Gear 3: Appends & File Uploads**   | OpenRouter `~google/gemini-flash-latest`                      |        `$0.013` (1.3¢)         |      **`$0.080` (8¢)**       | **6× cheaper than Deepgram!** Every `/api/append` take already uses this path.                                                      |
| **Gear 4: On-Device Whisper (New)**  | Browser WASM `whisper-tiny` (`q4`)                            |       **`$0.000` (0¢)**        |      **`$0.000` (0¢)**       | Runs on user's CPU/GPU; sends `{ text }` to `/api/process` or `/api/append`.                                                        |
| **Map Analysis (4 Parallel Calls)**  | OpenRouter `~google/gemini-flash-latest` (`reasoning: "low"`) |        `$0.002` (0.2¢)         |        `$0.010` (1¢)         | Extracts Title + Topics/Edges + Action Items + Self-Checkoff Status.                                                                |
| **Executive Summary**                | OpenRouter `~anthropic/claude-haiku-latest`                   |        `$0.004` (0.4¢)         |       `$0.016` (1.6¢)        | High-craft prose summary.                                                                                                           |
| **Export Drawer / Slide Deck / Ask** | OpenRouter `~anthropic/claude-haiku-latest`                   |        `$0.005` (0.5¢)         |       `$0.015` (1.5¢)        | PDF, Slide-O-Matic Deck JSON, Unasked Questions, Done Report, etc.                                                                  |

### Bottom-Line Margin on a `$49 AUD` (`~$31.50 USD` net after Square) Supporter Pass:

- **Out-of-pocket OpenRouter cost per hour of usage** (when Deepgram is covered
  by credit or using Append/Whisper): **`~4¢ to 12¢ USD / hour`**.
- **Blended full-retail cost per hour** (50% retail Deepgram + 50% OpenRouter):
  **`~$0.30 USD / hour` (`~$0.46 AUD / hour`)**.
- A typical supporter using **20–40 hours across a year** costs
  **`$1.50 to $4.50 USD` on OpenRouter** (or `$6–$12 USD` at full retail
  Deepgram), leaving a **65% to 90% net profit margin**!

---

## 3. 🕸️ Phase 1 Execution Plan: Multiplayer + "Export to Anything" + 16-Route Bilingual Web

### Step 1.1: Upgrade [`VerticalStudioIsland.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/islands/VerticalStudioIsland.tsx) & [`DndStudioIsland.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/islands/DndStudioIsland.tsx) to Show the Whole Machine

Right now the vertical pages only show a static `<pre>` Markdown preview. We
will upgrade the showcase section on every vertical portal to highlight:

1. **The "Export to Anything" Drawer (`MarkdownMakerDrawer.tsx`)**:
   - **📄 1-Click Styled PDF Print/Download** (clean typeset handout for
     clients, parents, teachers, or doctors).
   - **🖥️ 1-Click Slide-O-Matic Presentation Deck (`Deck`)** (turns any mapped
     conversation into a 6–9 slide presentation deck in 1 tap).
   - **🧭 Contextual Formats**: `Done` (progress report), `Meeting` (minutes),
     `Plan` (tasks & owners), `Research` (findings & methods), `Unasked` (the
     open threads & questions nobody asked), `Chronicle` (TTRPG), `Haiku`, plus
     **Custom Prompt** & **Resample into a Fresh Map**.
2. **Multiplayer Live Rooms + Flip-Side Excalidraw Sketchboard**:
   - **📱 Instant QR / Link Join (`ChonkyQrCard`)** with built-in **Live Voice
     Chat**, real-time collaborative topic map, and the **shared Excalidraw
     Sketchboard flip-side** for drawing diagrams together.
3. **Fix Remaining
   [`DndStudioIsland.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/islands/DndStudioIsland.tsx)
   Contraband**:
   - Replace remaining `bg-white` / `text-black` / `text-gray-600` classes with
     Flexoki warm cream (`#fffef7`, `#fbf1e4`, `#1e1714`) and add
     `hrefLang={isSpanish ? "en" : "es"}` on the language switcher link.

### Step 1.2: Weave the 3 New Blue-Ocean Bilingual Portals (+ Sharpen the Existing 3)

1. **🤝 NEW: `/for/clients` ↔ `/es/clientes`** (`301` shortlinks: `/clients`,
   `/clientes`)
   - **Audience:** Coaches, Consultants, Freelancers, Tutors, Allied Health &
     Agencies taking recurring clients.
   - **Angle:** _One living map per client across 20 sessions — append a
     2-minute post-call debrief (or host a Live Room), watch last session's
     client homework auto-tick itself off, and send a 1-click zero-account
     progress board, PDF, or Slide-O-Matic deck._
2. **🩺 NEW: `/for/care` ↔ `/es/consultas`** (`301` shortlinks: `/care`,
   `/consultas`)
   - **Audience:** Pediatricians (the kids ones!), Doctor & Specialist Visits,
     Speech/OT Therapy & Family Caregivers.
   - **Angle:** _The 90-second car-park voice dump — capture dosages, referrals,
     and milestones before "white-coat amnesia" hits, append follow-up visits
     into the same family map, print a clean PDF, or text a 1-click share link
     to your partner._
3. **🍎 NEW: `/for/schools` ↔ `/es/escuelas`** (`301` shortlinks: `/schools`,
   `/escuelas`)
   - **Audience:** Teachers, IEP & Student Support Conferences, Parent-Teacher
     Nights, Uni Research Labs & Study Groups.
   - **Angle:** _100% browser-local privacy with zero creepy cloud bots — map
     IEP goals, PhD supervision check-ins, or group study sessions, and export
     straight to a printable PDF or a 6–9 slide presentation deck._
4. **Sharpen Existing Portals (`meetings`/`juntas`, `research`/`investigacion`,
   `brainstorming`/`ideas`)**:
   - Infuse **Accountability Boards & Co-Founder Check-Ins** into `meetings`,
     **PhD Supervision & Dispute Case Files** into `research`, and **ADHD /
     Neurodivergent Spatial Constellations** into `brainstorming`.
5. **Sync Sitemap, PorchTable & SEO Tests**:
   - Update
     [`static/sitemap.xml`](file:///Users/pabloalvarado/Projects/active/apps/promapper/static/sitemap.xml)
     (16 bilingual URLs with reciprocal `en`/`es`/`x-default`),
     [`components/PorchTable.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/components/PorchTable.tsx),
     and
     [`core/tests/seo_indexation_test.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/core/tests/seo_indexation_test.ts).

---

## 4. ⚡ Phase 2 Execution Plan: Raid TalkType's Offline Whisper for PAID Supporters & Cap Cloud Risk

### Step 2.1: Fix the Unbounded Supporter Cloud Audio Bug in [`services/requestGuard.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/services/requestGuard.ts)

- Right now
  [`services/requestGuard.ts:281`](file:///Users/pabloalvarado/Projects/active/apps/promapper/services/requestGuard.ts#L281)
  waives `guardAudioBudget` completely for Supporters
  (`if (await isSupporterRequest(req)) return null;`).
- **Fix**:
  - **Free Tier (`$0`)**: Hard cap at **10 mins/day** of Cloud Audio (`~7MB/day`
    Opus). When a Free user hits 10 mins/day, return `429` with
    `needs_supporter: true` so they are prompted to upgrade to the **$49 AUD
    Pass** or plug in a **BYOK key**.
  - **Supporter Pass (`$49 AUD/yr`)**:
    - Unlock **30-minute single takes** (`1800s` vs Free's `600s`).
    - Give each Supporter Pass token **60 mins/day (or 40 hrs/yr) of High-Speed
      Cloud Audio** tracked in Deno KV per Pass Token
      (`SUPPORTER_AUDIO_BYTES_PER_DAY`).
    - When a Paid Supporter goes past 60 mins of Cloud Audio in a single day (or
      toggles **"Strict Local Audio (On-Device Whisper)"** for
      medical/client/school privacy), automatically switch their browser to
      **On-Device Whisper** and send `{ text }` to `/api/process` or
      `/api/append`!

### Step 2.2: Build Deno-Deploy-Safe Offline Whisper (`static/whisper-worker.js` + `utils/offlineWhisper.ts`)

- **Why `static/whisper-worker.js`:** Deno Deploy has a 128MB isolate limit
  (`deno.json`), so `@huggingface/transformers` must **never** be imported by
  server-rendered Fresh islands.
- **How it works:**
  1. `static/whisper-worker.js` is a standalone browser module worker that
     imports `pipeline, env` from
     `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm` only
     when spawned in the browser.
  2. Uses `onnx-community/whisper-tiny.en` (`q4`, ~75MB) on English routes and
     multilingual `onnx-community/whisper-tiny` (`q4`, ~85MB) on `/es*` routes,
     cached in the browser's `CacheStorage`.
  3. `utils/offlineWhisper.ts` decodes any recorded `Blob` (`audio/webm` /
     `audio/mp4`) into a `16kHz` mono `Float32Array` via `OfflineAudioContext`,
     posts it to `whisper-worker.js`, and emits download/transcription progress.

### Step 2.3: Wire Supporter On-Device Whisper Overflow + Strict Local Privacy Toggle

- When a **Paid Supporter** hits their daily 60-min High-Speed Cloud Audio bank
  — or flips on **"Strict Local Audio (On-Device Whisper)"**:
  1. `UploadIsland.tsx` / `AudioRecorder.tsx` transcribes the recorded `Blob`
     locally via `transcribeBlobOffline(blob)`.
  2. Sends the resulting `{ text }` JSON payload to `/api/process` or
     `/api/append` (which costs **$0.00 for audio** and **0.5¢ for the LLM
     map/summary/actions**!).
- Update
  [`islands/SupporterModal.tsx`](file:///Users/pabloalvarado/Projects/active/apps/promapper/islands/SupporterModal.tsx)
  and
  [`utils/i18n.ts`](file:///Users/pabloalvarado/Projects/active/apps/promapper/utils/i18n.ts)
  so the promise is honest, sustainable, and exciting:
  - **Free**: 10 mins/day Cloud Audio (10m max per take) + Unlimited Saved Local
    Maps + All Exports.
  - **Supporter Pass ($49 AUD/yr)**: 30-min Long Takes, 60 mins/day High-Speed
    Cloud Audio + **Unlimited On-Device Whisper Takes**, **Strict Local Audio
    Privacy Mode**, **Multiplayer Live Rooms + Voice Chat**, and **Permanent
    Share Links**.
