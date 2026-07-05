/**
 * ActionItemsBack — the flip side of the Action Items card.
 *
 * Calm at-a-glance utility: progress, per-person load, an overdue/due-soon
 * nudge, and bulk actions. Presentational — the front card owns the data +
 * mutations; this composes from the shared `.card-back-*` vocabulary so all
 * card backs stay consistent (no per-card style reinvention).
 */

import { copyToClipboard } from "../utils/toast.ts";
import { localDateISO } from "@core/storage/dates.ts";

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
      </div>
      <div class="dashboard-card-body">
        {total === 0
          ? (
            <div class="empty-state">
              <div class="empty-state-icon">📊</div>
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
                      All clear — nothing pending. 🎉
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
                            <span class="card-back-stat-value">{count}</span>
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

              {/* Bulk actions */}
              <div class="card-back-actions">
                <button
                  type="button"
                  onClick={onMarkAllDone}
                  disabled={pending === 0}
                  class="card-back-btn"
                >
                  ✓ Mark all done{pending > 0 ? ` (${pending})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(buildSummary(items))}
                  class="card-back-btn"
                >
                  <i class="fa fa-clipboard" aria-hidden="true"></i>{" "}
                  Copy summary
                </button>
                <button
                  type="button"
                  onClick={onClearDone}
                  disabled={done === 0}
                  class="card-back-btn is-danger"
                >
                  🧹 Clear done{done > 0 ? ` (${done})` : ""}
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
