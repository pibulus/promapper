/**
 * SummaryCard Component
 * Displays conversation summary with key points extraction
 */

import { copyToClipboard } from "../utils/toast.ts";
import { formatMarkdownSafe } from "../utils/sanitize.ts";
import { openReader } from "../signals/readerStore.ts";

interface SummaryCardProps {
  summary: string | null;
  nodes: Array<any>;
  conversationSource: string;
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
  { summary, nodes, conversationSource }: SummaryCardProps,
) {
  return (
    <div class="w-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Summary</h3>
          <div class="card-header-actions">
            <button
              onClick={() =>
                summary && openReader({
                  title: "Summary",
                  html: formatMarkdownSafe(summary),
                })}
              class="cursor-pointer"
              title="Open summary full-screen"
              aria-label="Expand summary"
              disabled={!summary}
            >
              <i class="fa fa-up-right-and-down-left-from-center text-sm"></i>
            </button>
            <button
              onClick={() => summary && copyToClipboard(summary)}
              class="cursor-pointer"
              title="Copy summary"
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
                {/* Main summary (XSS-safe) — sits directly on the card surface. */}
                <div
                  style={{
                    fontSize: "var(--text-size)",
                    color: "var(--color-text)",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdownSafe(summary),
                  }}
                />

                {
                  /* Key Points — a soft accent-tinted callout (the tint alone
                    sets it apart now; no heavy border box). */
                }
                {extractKeyPoints(summary).length > 0 && (
                  <div
                    class="mt-4 p-3 rounded-lg"
                    style={{
                      background:
                        "color-mix(in srgb, var(--color-accent) 7%, transparent)",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "var(--text-size)",
                        fontWeight: "700",
                        color: "var(--color-accent)",
                        marginBottom: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Key Points
                    </h4>
                    <ul class="space-y-2">
                      {extractKeyPoints(summary).map((point, index) => (
                        <li key={index} class="flex items-start gap-2">
                          <span
                            class="flex items-center justify-center rounded"
                            style={{
                              minWidth: "1.25rem",
                              height: "1.25rem",
                              background: "var(--color-accent)",
                              color: "white",
                              fontSize: "0.65rem",
                              marginTop: "0.125rem",
                            }}
                          >
                            <i class="fa fa-check"></i>
                          </span>
                          <span
                            style={{
                              fontSize: "var(--text-size)",
                              color: "var(--color-text)",
                              flex: 1,
                            }}
                          >
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Metadata */}
                <div
                  class="mt-4 pt-3 flex items-center gap-3"
                  style={{
                    borderTop: `1px solid var(--color-border)`,
                    fontSize: "var(--tiny-size)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span class="inline-flex items-center gap-1.5">
                    <i class="fa fa-diagram-project" aria-hidden="true"></i>
                    {nodes.length} topics
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <i class="fa fa-file-lines" aria-hidden="true"></i>
                    {conversationSource}
                  </span>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
