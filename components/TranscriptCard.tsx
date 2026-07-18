/**
 * TranscriptCard Component
 * Displays conversation transcript with speaker highlighting
 */

import { copyToClipboard } from "../utils/toast.ts";
import { formatTranscriptSafe } from "../utils/sanitize.ts";
import { useSignal } from "@preact/signals";
import { openReader } from "../signals/readerStore.ts";
import Modal from "./Modal.tsx";

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
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Transcript</h3>
          <div class="card-header-actions">
            <button
              onClick={() =>
                transcript?.text && openReader({
                  title: "Transcript",
                  html: formatTranscriptSafe(
                    transcript.text,
                    transcript.speakers ?? [],
                  ),
                  mono: true,
                })}
              class="cursor-pointer"
              data-tip="Read full-screen"
              aria-label="Expand transcript"
              disabled={!transcript?.text}
            >
              <i class="fa fa-up-right-and-down-left-from-center text-sm"></i>
            </button>
            <button
              onClick={() =>
                transcript?.text && copyToClipboard(transcript.text)}
              class="cursor-pointer"
              data-tip="Copy transcript"
              data-tip-align="right"
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
                {
                  /* Speaker highlighting is XSS-safe (formatTranscriptSafe).
                    Names are clickable IN PLACE: tap one to rename that
                    speaker everywhere (the old bottom speaker strip is gone —
                    it duplicated what the text already shows). */
                }
                <div
                  class="whitespace-pre-wrap leading-relaxed transcript-content"
                  onClick={(e) => {
                    const el = (e.target as HTMLElement).closest(
                      "[data-speaker]",
                    ) as HTMLElement | null;
                    if (el?.dataset.speaker && onRenameSpeaker) {
                      startRename(el.dataset.speaker);
                    }
                  }}
                  dangerouslySetInnerHTML={{
                    __html: formatTranscriptSafe(
                      transcript.text,
                      transcript.speakers ?? [],
                    ),
                  }}
                />
              </div>
            )}
        </div>
      </div>

      {/* Rename speaker — opened by tapping a name in the transcript */}
      <Modal
        open={editingSpeaker.value !== null}
        onClose={cancelRename}
        titleId="rename-speaker-title"
        panelClass="max-w-sm"
      >
        <h3 id="rename-speaker-title" class="modal-heading">
          Rename {editingSpeaker.value}
        </h3>
        <input
          type="text"
          value={speakerName.value}
          onInput={(e) =>
            speakerName.value = (e.target as HTMLInputElement).value}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRename();
          }}
          class="export-textarea"
          aria-label={`New name for ${editingSpeaker.value}`}
          autoFocus
        />
        <div class="flex gap-2 mt-3">
          <button
            onClick={saveRename}
            class="btn btn--accent flex-1"
            disabled={!speakerName.value.trim()}
          >
            Rename everywhere
          </button>
          <button onClick={cancelRename} class="btn btn--secondary flex-1">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
