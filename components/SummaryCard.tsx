/**
 * SummaryCard Component
 * Displays conversation summary with key points extraction
 */

import { copyToClipboard } from "../utils/toast.ts";
import { formatMarkdownSafe } from "../utils/sanitize.ts";
import { paragraphizeSummary } from "../utils/summaryFormat.ts";
import { openReader } from "../signals/readerStore.ts";

interface SummaryCardProps {
  summary: string | null;
}

// Extract key points from summary
function extractKeyPoints(text: string): string[] {
  if (!text) return [];

  // Split into paragraphs
  const paragraphs = text.split("\n\n");

  // Short text - extract sentences
  if (paragraphs.length <= 2) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    return sentences
      .slice(0, 3)
      .map((s) => s.trim())
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  }

  // Try to find bullet points
  const bulletPoints = text.match(/- (.+)/g);
  if (bulletPoints && bulletPoints.length >= 2) {
    return bulletPoints
      .slice(0, 3)
      .map((point) => point.replace(/^- /, ""));
  }

  // Extract key sentences from paragraphs
  return paragraphs
    .slice(0, 3)
    .map((p) => {
      const sentences = p.split(/[.!?]+/);
      return sentences[0].trim();
    })
    .filter((s) => s.length > 10)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

export default function SummaryCard(
  { summary }: SummaryCardProps,
) {
  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Summary</h3>
          <div class="card-header-actions">
            <button
              onClick={() =>
                summary && openReader({
                  title: "Summary",
                  html: formatMarkdownSafe(paragraphizeSummary(summary)),
                })}
              class="cursor-pointer"
              data-tip="Expand"
              aria-label="Expand summary"
              disabled={!summary}
            >
              <i class="fa fa-up-right-and-down-left-from-center text-sm"></i>
            </button>
            <button
              onClick={() => summary && copyToClipboard(summary)}
              class="cursor-pointer"
              data-tip="Copy"
              aria-label="Copy summary"
              disabled={!summary}
            >
              <i class="fa fa-copy text-sm"></i>
            </button>
          </div>
        </div>
        <div class="dashboard-card-body card-scroll">
          {!summary || summary === "No summary generated"
            ? (
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i class="fa fa-clipboard-list" aria-hidden="true"></i>
                </div>
                <div class="empty-state-text">Waiting here</div>
              </div>
            )
            : (
              <div>
                {
                  /* Main summary (XSS-safe) — sits directly on the card
                    surface, regrouped into short breathable paragraphs
                    (never a wall of text). */
                }
                <div
                  class="summary-content"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdownSafe(paragraphizeSummary(summary)),
                  }}
                />

                {
                  /* Key Points — a soft accent-tinted callout (the tint alone
                    sets it apart now; no heavy border box). */
                }
                {extractKeyPoints(summary).length > 0 && (
                  <div class="summary-key-points">
                    <h4 class="key-points-title">
                      Key Points
                    </h4>
                    <ul class="space-y-2">
                      {extractKeyPoints(summary).map((point, index) => (
                        <li key={index} class="flex items-start gap-2">
                          <span class="key-point-icon">
                            <i class="fa fa-check"></i>
                          </span>
                          <span class="key-point-text">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
