/**
 * SummaryBack — the flip side of the Summary card: the project's PULSE.
 *
 * The living-document story: when it started, how much talk became how much
 * summary, and every recorded take with its append receipt ("+2 topics · 3
 * new tasks"). Presentational; takes + backup callback come from the
 * dashboard so this stays on the store/undo seam like every other back.
 */

import { formatAppendReceipt } from "@core/orchestration/append-receipt.ts";
import { transcriptWordCount } from "@core/orchestration/talk-share.ts";
import type { StoredRecording } from "@core/storage/recordingsDB.ts";
import { copyToClipboard } from "../utils/toast.ts";

interface SummaryBackProps {
  summary: string;
  transcriptText: string;
  topicCount: number;
  taskCount: number;
  createdAt?: string;
  takes: StoredRecording[];
  onBackup: () => void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function SummaryBack(
  {
    summary,
    transcriptText,
    topicCount,
    taskCount,
    createdAt,
    takes,
    onBackup,
  }: SummaryBackProps,
) {
  const talkWords = transcriptWordCount(transcriptText);
  const summaryWords = transcriptWordCount(summary);
  const started = createdAt ? shortDate(createdAt) : null;
  // Newest take first — the pulse reads top-down like a feed.
  const recentTakes = [...takes].reverse().slice(0, 6);

  return (
    <div class="dashboard-card">
      <div class="dashboard-card-header">
        <h3>Pulse</h3>
        <div class="card-header-actions">
          <button
            onClick={() => summary && copyToClipboard(summary)}
            class="cursor-pointer"
            title="Copy summary"
            aria-label="Copy summary"
            disabled={!summary}
          >
            <i class="fa fa-copy text-sm"></i>
          </button>
          <button
            onClick={onBackup}
            class="cursor-pointer"
            title="Back up all projects"
            aria-label="Back up all projects"
          >
            <i class="fa fa-download text-sm"></i>
          </button>
        </div>
      </div>
      <div class="dashboard-card-body">
        <div class="card-back-sections">
          {/* The shape of the project */}
          <div>
            {started && (
              <div class="card-back-stat">
                <span class="card-back-label">Started</span>
                <span class="card-back-stat-value">{started}</span>
              </div>
            )}
            <div class="card-back-stat">
              <span class="card-back-label">Topics</span>
              <span class="card-back-stat-value">{topicCount}</span>
            </div>
            <div class="card-back-stat">
              <span class="card-back-label">Tasks</span>
              <span class="card-back-stat-value">{taskCount}</span>
            </div>
            {talkWords > 0 && summaryWords > 0 && (
              <div class="card-back-stat">
                <span class="card-back-label">Distilled</span>
                <span class="card-back-stat-value">
                  {talkWords.toLocaleString()} → {summaryWords.toLocaleString()}
                  {" "}
                  words
                </span>
              </div>
            )}
          </div>

          {/* The append story — each take and what it changed */}
          <div>
            <div class="card-back-label" style={{ marginBottom: "0.5rem" }}>
              Takes
            </div>
            {recentTakes.length === 0
              ? (
                <p
                  style={{
                    fontSize: "var(--small-size)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  No recorded takes yet — the map grows every time you talk.
                </p>
              )
              : (
                <div class="flex flex-col gap-1.5">
                  {recentTakes.map((take) => {
                    const line = take.receipt
                      ? formatAppendReceipt(take.receipt)
                      : "";
                    return (
                      <div key={take.id} class="card-back-stat">
                        <span class="truncate">
                          {take.fileName} · {shortDate(take.createdAt)}
                        </span>
                        <span class="card-back-stat-value">
                          {line || "mapped"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
