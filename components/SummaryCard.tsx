/**
 * SummaryCard Component
 * Displays conversation summary with key points extraction
 */

import { copyToClipboard } from "../utils/toast.ts";
import { formatMarkdownSafe } from "../utils/sanitize.ts";
import { paragraphizeSummary, splitSentences } from "../utils/summaryFormat.ts";
import { openReader } from "@signals/readerStore.ts";

interface SummaryCardProps {
  summary: string | null;
}

function cleanKeyPoint(s: string): string {
  let cleaned = s.trim().replace(/^[-*•]\s+/, "");
  // Clean trailing punctuation or orphan commas/conjunctions
  cleaned = cleaned.replace(/[,;:\-\s]+$/, "");
  if (!/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Extract key points from summary without breaking decimals or leaving trailing fragments
function extractKeyPoints(text: string): string[] {
  if (!text) return [];

  // Try to find explicit markdown bullet points first
  const bulletMatches = text.match(/^[-*•]\s+(.+)$/gm);
  if (bulletMatches && bulletMatches.length >= 2) {
    return bulletMatches
      .slice(0, 4)
      .map(cleanKeyPoint)
      .filter((s) => s.length > 12);
  }

  // Otherwise extract clean sentences using splitSentences (which protects decimals & abbreviations)
  const sentences = splitSentences(text)
    .map(cleanKeyPoint)
    .filter((s) => s.length > 18);

  return sentences.slice(0, 3);
}

export default function SummaryCard(
  { summary }: SummaryCardProps,
) {
  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <div class="inline-flex items-center gap-2">
            <span class="stamped-tab stamped-tab--pink">02 // SUMMARY</span>
          </div>
          <div class="card-header-actions">
            <button
              type="button"
              onClick={() =>
                summary && openReader({
                  title: "Summary",
                  html: formatMarkdownSafe(paragraphizeSummary(summary)),
                })}
              class="cursor-pointer"
              data-tip="Read full-screen"
              aria-label="Read summary full-screen"
              disabled={!summary}
            >
              <i class="fa fa-up-right-and-down-left-from-center text-sm"></i>
            </button>
            <button
              type="button"
              onClick={() => summary && copyToClipboard(summary)}
              class="cursor-pointer"
              data-tip="Copy summary"
              data-tip-align="right"
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
