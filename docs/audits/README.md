# Audit passes

Four self-contained briefs for the parts of ProMapper where a bug costs real
user data or real money. Each one is copy-pasteable into any LLM with repo
access, or usable as a subagent prompt. They don't depend on each other and they
don't depend on this file.

| Pass                                                          | Guards                                            | Why it's delicate                                                           |
| ------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| [01 — the append loop](01-append-loop.md)                     | recording → AI → three-way merge → autosave       | The product's whole promise. Four REDs came out of it on 2026-07-26 alone.  |
| [02 — live collaboration](02-live-collab.md)                  | rooms, sync, presence, the three sanitizer copies | Six REDs. Three hand-synced protocol copies. Hardest to test by hand.       |
| [03 — storage & data lifecycle](03-storage-data-lifecycle.md) | localStorage, IndexedDB, backup/import            | Everything a user owns lives here. There is no server copy to restore from. |
| [04 — security & the money layer](04-security-and-money.md)   | auth, guards, budgets, BYO keys, AI spend         | Someone else's bill; someone else's conversation.                           |

## How to run one

Paste the whole file as the prompt. Give the model repo access (or the file list
it names). Nothing else is required — each brief carries its own context, its
own don't-report list, and its own output format.

For a stronger pass, run each finding back through a **second** model whose only
job is to refute it. On 2026-07-26 that step killed 15 of 59 raised findings —
misread line numbers, concerns already handled elsewhere, deliberate decisions
mistaken for bugs. It is the single highest-value part of the process.

## What these are calibrated against

They were written after a three-round audit on 2026-07-26 (51 + 26 + 29 agents)
that found **16 RED bugs**. Each brief carries that round's already-fixed list
so a fresh pass doesn't burn its attention re-finding them, and each names the
specific invariants that were being violated — so a new model starts where the
last one finished instead of at zero.

The four failure shapes that audit kept hitting, worth knowing before you read
any of the briefs:

1. **A guard that blocks the thing it guards.** The append loop was entirely
   dead because a re-entry check tested a flag its own caller had just set.
2. **Fixes landing in a dead copy.** Three copies of the collab sanitizer exist;
   the fixes and the tests both went to the one that can never deploy.
3. **Silent degrade presented as success.** Empty AI results with no warning,
   share links that were local-only, chunk audio dropped before the request.
4. **Calibrating the new thing against the old thing.** A colour target set to
   the mean of the themes being replaced.

And the biggest lesson, which every brief repeats: **when you find a bug, grep
for its shape elsewhere.** Three of round three's six REDs were bugs fixed
earlier that same day, still alive on a sibling path.
