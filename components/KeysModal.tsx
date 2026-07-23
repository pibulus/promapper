/**
 * Keys Modal — the Keys door. Bring your own OpenRouter key and mapping
 * runs on it: your key, your costs, your data path. The key stays in this
 * browser (cookie), rides each request over HTTPS, and is never stored or
 * logged server-side.
 */

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import Modal from "./Modal.tsx";
import {
  clearByoKey,
  getByoKey,
  looksLikeOpenRouterKey,
  setByoKey,
} from "../utils/byoKey.ts";
import { showToast } from "../utils/toast.ts";

interface KeysModalProps {
  open: boolean;
  onClose: () => void;
}

export default function KeysModal({ open, onClose }: KeysModalProps) {
  const draft = useSignal("");
  const hasKey = useSignal(false);

  useEffect(() => {
    if (!open) return;
    const existing = getByoKey();
    hasKey.value = Boolean(existing);
    draft.value = existing ?? "";
  }, [open]);

  function save() {
    const key = draft.value.trim();
    if (!looksLikeOpenRouterKey(key)) {
      showToast(
        "That doesn't look like an OpenRouter key (they start with sk-or-).",
        "warning",
      );
      return;
    }
    setByoKey(key);
    hasKey.value = true;
    showToast("Key saved — mapping now runs on your key.", "success");
    onClose();
  }

  function remove() {
    clearByoKey();
    hasKey.value = false;
    draft.value = "";
    showToast("Key removed — back to the house key.", "info");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="keys-modal-title"
      panelClass="max-w-md"
    >
      <div class="modal-stack">
        <h3 id="keys-modal-title" class="modal-heading">
          Your key
        </h3>
        <p class="keys-modal-copy">
          Bring your own{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenRouter key
          </a>{" "}
          and mapping runs on it — your key, your costs, your data path. It
          stays in this browser and is never stored on our side.
        </p>
        <input
          type="password"
          class="keys-modal-input"
          placeholder="sk-or-…"
          autocomplete="off"
          value={draft.value}
          onInput={(e) => draft.value = (e.target as HTMLInputElement).value}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <div class="keys-modal-actions">
          {hasKey.value && (
            <button type="button" class="keys-modal-remove" onClick={remove}>
              remove key
            </button>
          )}
          <button type="button" class="keys-modal-save" onClick={save}>
            Save key
          </button>
        </div>
      </div>
    </Modal>
  );
}
