/**
 * TranscriptBack — the flip side of the Transcript card: "who held the floor".
 *
 * Talk-share bars per speaker + a small stats row. Presentational, composes
 * from the shared .card-back-* vocabulary (same rules as ActionItemsBack).
 */

import {
  computeTalkShare,
  transcriptWordCount,
} from "@core/orchestration/talk-share.ts";
import { copyToClipboard } from "../utils/toast.ts";

interface TranscriptBackProps {
  text: string;
  speakers: string[];
}

export default function TranscriptBack(
  { text, speakers }: TranscriptBackProps,
) {
  const shares = computeTalkShare(text, speakers);
  const words = transcriptWordCount(text);
  // ~200 wpm reading speed, floor at 1 min for anything non-trivial.
  const readMinutes = words > 0 ? Math.max(1, Math.round(words / 200)) : 0;
  const maxWords = shares.reduce((m, s) => Math.max(m, s.words), 0);

  return (
    <div class="dashboard-card">
      <div class="dashboard-card-header">
        <h3>Voices</h3>
      </div>
      <div class="dashboard-card-body">
        {words === 0
          ? (
            <div class="empty-state">
              <div class="empty-state-icon">
                <i class="fa fa-comment-slash" aria-hidden="true"></i>
              </div>
              <div class="empty-state-text">Nothing said yet</div>
            </div>
          )
          : (
            <div class="card-back-sections">
              {/* Stats */}
              <div>
                <div class="card-back-stat">
                  <span class="card-back-label">Words</span>
                  <span class="card-back-stat-value">
                    {words.toLocaleString()}
                  </span>
                </div>
                <div class="card-back-stat">
                  <span class="card-back-label">Speakers</span>
                  <span class="card-back-stat-value">{speakers.length}</span>
                </div>
                <div class="card-back-stat">
                  <span class="card-back-label">Read time</span>
                  <span class="card-back-stat-value">~{readMinutes} min</span>
                </div>
              </div>

              {/* Who held the floor */}
              {shares.length > 0 && (
                <div>
                  <div
                    class="card-back-label"
                    style={{ marginBottom: "0.5rem" }}
                  >
                    Who held the floor
                  </div>
                  <div class="flex flex-col gap-2">
                    {shares.map((s) => (
                      <div key={s.speaker}>
                        <div
                          class="card-back-stat"
                          style={{ marginBottom: "0.2rem" }}
                        >
                          <span class="truncate">{s.speaker}</span>
                          <span class="card-back-stat-value">
                            {Math.round(s.share * 100)}%
                          </span>
                        </div>
                        <div class="card-back-bar">
                          <div
                            class="card-back-bar-fill"
                            style={{
                              "--fill": `${
                                maxWords === 0
                                  ? 0
                                  : Math.round((s.words / maxWords) * 100)
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div class="card-back-actions">
                <button
                  type="button"
                  onClick={() => copyToClipboard(text)}
                  class="card-back-btn"
                >
                  <i class="fa fa-clipboard" aria-hidden="true"></i>{" "}
                  Copy transcript
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
