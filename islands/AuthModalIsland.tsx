/**
 * Auth Modal Island — renders Modal when requestAuthToken() is called.
 * Replaces the native window.prompt() that was in utils/apiAuth.ts.
 */

import { useComputed, useSignal } from "@preact/signals";
import { authPromptSignal } from "@signals/authModal.ts";
import Modal from "../components/Modal.tsx";

export default function AuthModalIsland() {
  const token = useSignal("");

  const open = useComputed(() => authPromptSignal.value !== null);

  function dismiss() {
    authPromptSignal.value?.reject(
      new Error("API auth token is required to continue."),
    );
    authPromptSignal.value = null;
    token.value = "";
  }

  function handleSubmit() {
    const trimmed = token.value.trim();
    if (!trimmed) return;
    authPromptSignal.value?.resolve(trimmed);
    authPromptSignal.value = null;
    token.value = "";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <Modal
      open={open.value}
      onClose={dismiss}
      titleId="auth-modal-title"
    >
      <div class="modal-stack">
        <h3
          id="auth-modal-title"
          style={{
            margin: 0,
            fontSize: "var(--heading-size)",
            fontWeight: 700,
            color: "var(--color-text)",
          }}
        >
          Auth token needed
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "var(--small-size)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Enter your API auth token to keep going.
        </p>
        <input
          type="password"
          value={token.value}
          onInput={(e) => token.value = (e.target as HTMLInputElement).value}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          autoFocus
          style={{
            minHeight: "2.75rem",
            border: "2px solid var(--color-border)",
            borderRadius: "8px",
            background: "var(--surface-cream)",
            padding: "0.55rem 0.7rem",
            fontSize: "var(--text-size)",
            color: "var(--color-text)",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        <div class="modal-actions">
          <button
            class="btn btn--secondary"
            style={{ flex: 1 }}
            onClick={dismiss}
            type="button"
          >
            Cancel
          </button>
          <button
            class="btn btn--primary"
            style={{ flex: 1 }}
            onClick={handleSubmit}
            disabled={!token.value.trim()}
            type="button"
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
}
