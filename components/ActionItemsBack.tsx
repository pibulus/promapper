/**
 * ActionItemsBack — the flip side of the Action Items card.
 *
 * Calm at-a-glance utility: progress, per-person load, an overdue/due-soon
 * nudge, and bulk actions. Presentational — the front card owns the data +
 * mutations; this composes from the shared `.card-back-*` vocabulary so all
 * card backs stay consistent (no per-card style reinvention).
 */

import { copyToClipboard, showToast } from "../utils/toast.ts";
import { localDateISO } from "@core/storage/dates.ts";
import { conversationData } from "@signals/conversationStore.ts";
import { createBestShareLink } from "@core/storage/shareService.ts";

interface ActionItem {
  id: string;
  description: string;
  assignee: string | null;
  due_date: string | null;
  status: "pending" | "completed";
}

interface ActionItemsBackProps {
  items: ActionItem[];
  onMarkAllDone: () => void;
  onClearDone: () => void;
}

/** Plain-text summary for sharing/pasting (open grouped by person, then done). */
function buildSummary(items: ActionItem[]): string {
  const open = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "completed");
  const lines: string[] = [
    `Action items — ${done.length}/${items.length} done`,
    "",
  ];
  if (open.length) {
    lines.push("Open:");
    for (const i of open) {
      const who = i.assignee?.trim() ? ` (@${i.assignee.trim()})` : "";
      const due = i.due_date ? ` [due ${i.due_date}]` : "";
      lines.push(`- ${i.description}${who}${due}`);
    }
    lines.push("");
  }
  if (done.length) {
    lines.push("Done:");
    for (const i of done) lines.push(`- ${i.description}`);
  }
  return lines.join("\n").trim();
}

/**
 * Share just one person's slice: a snapshot share whose actionItems are
 * filtered to that assignee, with filter metadata so the shared view says so.
 */
async function shareAssigneeItems(who: string) {
  const data = conversationData.value;
  if (!data) return;
  const matches = (assignee: string | null | undefined) =>
    (assignee?.trim() || "Unassigned") === who;
  const filtered = {
    ...data,
    actionItems: data.actionItems.filter((i) => matches(i.assignee)),
  };
  try {
    const result = await createBestShareLink(filtered, 30, {
      filter: { assignee: who },
    });
    if (result.mode === "local-only") {
      showToast(
        result.warning ?? "Couldn't create a portable link right now",
        "warning",
      );
      return;
    }
    const copied = await copyToClipboard(result.url);
    if (copied) {
      showToast(`That's ${who}'s items — link ready to paste`, "info");
    }
  } catch (error) {
    console.error("Assignee share failed:", error);
    showToast("Couldn't create that share — try again", "error");
  }
}

export default function ActionItemsBack(
  { items, onMarkAllDone, onClearDone }: ActionItemsBackProps,
) {
  const total = items.length;
  const done = items.filter((i) => i.status === "completed").length;
  const pending = total - done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Per-person open load (pending only — "who still owes what"), most-loaded first.
  const byPerson = new Map<string, number>();
  for (const i of items) {
    if (i.status !== "pending") continue;
    const who = i.assignee?.trim() || "Unassigned";
    byPerson.set(who, (byPerson.get(who) ?? 0) + 1);
  }
  const people = [...byPerson.entries()].sort((a, b) => b[1] - a[1]);
  const maxLoad = people.reduce((m, [, n]) => Math.max(m, n), 0);

  // Timeliness nudge (pending only).
  const todayISO = localDateISO(0);
  const soonISO = localDateISO(2);
  const overdue =
    items.filter((i) =>
      i.status === "pending" && i.due_date && i.due_date < todayISO
    ).length;
  const dueSoon =
    items.filter((i) =>
      i.status === "pending" && i.due_date && i.due_date >= todayISO &&
      i.due_date <= soonISO
    ).length;

  return (
    <div class="dashboard-card">
      <div class="dashboard-card-header">
        <h3>Overview</h3>
        <div class="card-header-actions">
          <button
            onClick={onMarkAllDone}
            class="cursor-pointer"
            title="Mark all done"
            aria-label="Mark all done"
            disabled={pending === 0}
          >
            <i class="fa fa-check-double text-sm"></i>
          </button>
          <button
            onClick={() => copyToClipboard(buildSummary(items))}
            class="cursor-pointer"
            title="Copy task summary"
            aria-label="Copy task summary"
            disabled={total === 0}
          >
            <i class="fa fa-copy text-sm"></i>
          </button>
          <button
            onClick={onClearDone}
            class="cursor-pointer"
            title="Clear done"
            aria-label="Clear done"
            disabled={done === 0}
          >
            <i class="fa fa-broom text-sm"></i>
          </button>
        </div>
      </div>
      <div class="dashboard-card-body">
        {total === 0
          ? (
            <div class="empty-state">
              <div class="empty-state-icon">
                <i class="fa fa-chart-simple" aria-hidden="true"></i>
              </div>
              <div class="empty-state-text">Nothing to summarize yet</div>
            </div>
          )
          : (
            <div class="card-back-sections">
              {/* Progress */}
              <div>
                <div class="card-back-stat" style={{ marginBottom: "0.4rem" }}>
                  <span class="card-back-label">Progress</span>
                  <span
                    class="card-back-stat-value"
                    style={{ color: "var(--color-text)" }}
                  >
                    {done} / {total} · {pct}%
                  </span>
                </div>
                <div class="card-back-bar">
                  <div
                    class="card-back-bar-fill"
                    style={{ "--fill": `${pct}%` }}
                  />
                </div>
              </div>

              {/* Timeliness nudge — only when there's something to flag. */}
              {(overdue > 0 || dueSoon > 0) && (
                <div class="flex flex-wrap gap-2">
                  {overdue > 0 && (
                    <span class="action-status-pill">
                      {overdue} overdue
                    </span>
                  )}
                  {dueSoon > 0 && (
                    <span class="action-status-pill">
                      {dueSoon} due soon
                    </span>
                  )}
                </div>
              )}

              {/* Per-person open load, as proportion bars. */}
              <div>
                <div class="card-back-label" style={{ marginBottom: "0.5rem" }}>
                  Open by person
                </div>
                {people.length === 0
                  ? (
                    <p
                      style={{
                        fontSize: "var(--small-size)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      All clear — nothing pending{" "}
                      <i class="fa fa-champagne-glasses" aria-hidden="true"></i>
                    </p>
                  )
                  : (
                    <div class="flex flex-col gap-2">
                      {people.map(([who, count]) => (
                        <div key={who}>
                          <div
                            class="card-back-stat"
                            style={{ marginBottom: "0.2rem" }}
                          >
                            <span class="truncate">{who}</span>
                            <span class="flex items-center gap-1">
                              <button
                                type="button"
                                class="card-back-person-share"
                                aria-label={`Share ${who}'s items as a link`}
                                title={`Share ${who}'s items`}
                                onClick={() => shareAssigneeItems(who)}
                              >
                                <i class="fa fa-link" aria-hidden="true" />
                              </button>
                              <span class="card-back-stat-value">{count}</span>
                            </span>
                          </div>
                          <div class="card-back-bar">
                            <div
                              class="card-back-bar-fill"
                              style={{
                                "--fill": `${
                                  maxLoad === 0
                                    ? 0
                                    : Math.round((count / maxLoad) * 100)
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
