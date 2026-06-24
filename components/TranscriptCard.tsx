/**
 * TranscriptCard Component
 * Displays conversation transcript with speaker highlighting
 */

import { copyToClipboard } from "../utils/toast.ts";
import { formatTranscriptSafe } from "../utils/sanitize.ts";
import { useSignal } from "@preact/signals";
import { openReader } from "../signals/readerStore.ts";

interface TranscriptCardProps {
  transcript: {
    text: string;
    speakers?: string[];
  } | null;
  onRenameSpeaker?: (oldName: string, newName: string) => void;
}

export default function TranscriptCard(
  { transcript, onRenameSpeaker }: TranscriptCardProps,
) {
  const editingSpeaker = useSignal<string | null>(null);
  const speakerName = useSignal("");

  function startRename(speaker: string) {
    editingSpeaker.value = speaker;
    speakerName.value = speaker;
  }

  function cancelRename() {
    editingSpeaker.value = null;
    speakerName.value = "";
  }

  function saveRename() {
    const oldName = editingSpeaker.value;
    const newName = speakerName.value.trim();

    if (!oldName || !newName || newName === oldName) {
      cancelRename();
      return;
    }

    onRenameSpeaker?.(oldName, newName);
    cancelRename();
  }

  return (
    <div class="w-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Transcript</h3>
          <div class="card-header-actions">
            <button
              onClick={() =>
                transcript?.text && openReader({
                  title: "Transcript",
                  html: formatTranscriptSafe(transcript.text),
                  mono: true,
                })}
              class="cursor-pointer"
              title="Open transcript full-screen"
              aria-label="Expand transcript"
              disabled={!transcript?.text}
            >
              <i class="fa fa-up-right-and-down-left-from-center text-sm"></i>
            </button>
            <button
              onClick={() =>
                transcript?.text && copyToClipboard(transcript.text)}
              class="cursor-pointer"
              title="Copy transcript"
              aria-label="Copy transcript"
              disabled={!transcript?.text}
            >
              <i class="fa fa-copy text-sm"></i>
            </button>
          </div>
        </div>
        <div class="dashboard-card-body card-scroll">
          {!transcript?.text || transcript.text.trim() === ""
            ? (
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i class="fa fa-file-lines" aria-hidden="true"></i>
                </div>
                <div class="empty-state-text">Quiet here</div>
              </div>
            )
            : (
              <div class="relative">
                {/* Format transcript with speaker highlighting (XSS-safe). */}
                <div
                  class="whitespace-pre-wrap leading-relaxed transcript-content"
                  dangerouslySetInnerHTML={{
                    __html: formatTranscriptSafe(transcript.text),
                  }}
                />

                {/* Speaker list if available */}
                {transcript.speakers && transcript.speakers.length > 0 && (
                  <div class="transcript-speakers-section">
                    <div class="speakers-label">
                      Speakers:
                    </div>
                    <div class="flex flex-wrap gap-2">
                      {transcript.speakers.map((speaker) =>
                        editingSpeaker.value === speaker
                          ? (
                            <span
                              key={speaker}
                              class="speaker-edit-container"
                            >
                              <input
                                value={speakerName.value}
                                onInput={(e) =>
                                  speakerName.value =
                                    (e.target as HTMLInputElement).value}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveRename();
                                  if (e.key === "Escape") {
                                    cancelRename();
                                  }
                                }}
                                class="speaker-edit-input"
                                aria-label={`Rename ${speaker}`}
                                autoFocus
                              />
                              <button
                                onClick={saveRename}
                                class="speaker-btn speaker-btn--save"
                                aria-label={`Save ${speaker} name`}
                                title="Save speaker name"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelRename}
                                class="speaker-btn speaker-btn--cancel"
                                aria-label="Cancel speaker rename"
                                title="Cancel"
                              >
                                ×
                              </button>
                            </span>
                          )
                          : (
                            <button
                              key={speaker}
                              onClick={() => startRename(speaker)}
                              class="speaker-badge-btn"
                              title={`Rename ${speaker}`}
                              aria-label={`Rename ${speaker}`}
                              disabled={!onRenameSpeaker}
                            >
                              {speaker}
                            </button>
                          )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
