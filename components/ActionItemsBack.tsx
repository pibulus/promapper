/**
 * ActionItemsBack — the flip side of the Action Items card.
 *
 * Calm at-a-glance utility for the list: progress, a per-person breakdown, and
 * bulk actions that would otherwise clutter the front. Presentational — it takes
 * the items + callbacks and renders; the front card owns the data + mutations.
 */

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

export default function ActionItemsBack(
  { items, onMarkAllDone, onClearDone }: ActionItemsBackProps,
) {
  const total = items.length;
  const done = items.filter((i) => i.status === "completed").length;
  const pending = total - done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Per-person open counts (pending only — "who still owes what").
  const byPerson = new Map<string, number>();
  for (const i of items) {
    if (i.status !== "pending") continue;
    const who = i.assignee?.trim() || "Unassigned";
    byPerson.set(who, (byPerson.get(who) ?? 0) + 1);
  }
  const people = [...byPerson.entries()].sort((a, b) => b[1] - a[1]);

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
            <div class="flex flex-col gap-4">
              {/* Progress */}
              <div>
                <div
                  class="flex items-baseline justify-between"
                  style={{ marginBottom: "0.4rem" }}
                >
                  <span
                    style={{
                      fontSize: "var(--small-size)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Progress
                  </span>
                  <span
                    style={{
                      fontSize: "var(--small-size)",
                      fontWeight: "700",
                      color: "var(--color-text)",
                    }}
                  >
                    {done} / {total} done · {pct}%
                  </span>
                </div>
                <div
                  style={{
                    height: "0.5rem",
                    borderRadius: "999px",
                    background: "var(--soft-cream-dark)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: "999px",
                      background: "var(--color-accent)",
                      transition: "width var(--transition-slow)",
                    }}
                  />
                </div>
              </div>

              {/* Per-person open counts */}
              <div>
                <div
                  style={{
                    fontSize: "var(--tiny-size)",
                    fontWeight: "600",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--color-text-secondary)",
                    marginBottom: "0.5rem",
                  }}
                >
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
                    <div class="flex flex-col gap-1.5">
                      {people.map(([who, count]) => (
                        <div
                          key={who}
                          class="flex items-center justify-between"
                          style={{
                            fontSize: "var(--small-size)",
                            color: "var(--color-text)",
                          }}
                        >
                          <span class="truncate">{who}</span>
                          <span
                            style={{
                              flexShrink: 0,
                              marginLeft: "0.5rem",
                              fontWeight: "700",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Bulk actions */}
              <div
                class="flex flex-col gap-2"
                style={{
                  paddingTop: "0.75rem",
                  borderTop: "var(--border-width) solid var(--color-border)",
                }}
              >
                <button
                  type="button"
                  onClick={onMarkAllDone}
                  disabled={pending === 0}
                  class="action-header-btn px-3 py-2 rounded font-bold disabled:opacity-40"
                  style={{
                    fontSize: "var(--small-size)",
                    border: "2px solid var(--color-border)",
                    background: "var(--surface-cream)",
                  }}
                >
                  ✓ Mark all done{pending > 0 ? ` (${pending})` : ""}
                </button>
                <button
                  type="button"
                  onClick={onClearDone}
                  disabled={done === 0}
                  class="action-header-btn px-3 py-2 rounded font-bold disabled:opacity-40"
                  style={{
                    fontSize: "var(--small-size)",
                    border: "2px solid var(--color-danger-border)",
                    background: "var(--color-danger-bg)",
                    color: "var(--color-danger-text)",
                  }}
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
