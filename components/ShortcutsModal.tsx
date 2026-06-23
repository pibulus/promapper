/**
 * Keyboard Shortcuts Modal — shows available shortcuts when `?` is pressed.
 * Accessible via the overlay: `/`, `Shift+/`, or whatever produces `?`.
 */

import Modal from "../components/Modal.tsx";

interface Shortcut {
  keys: string;
  action: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: "?", action: "Show this cheat sheet" },
  { keys: "Ctrl+Z / ⌘Z", action: "Undo last map or action-item change" },
  { keys: "Esc", action: "Close panel / cancel edit / exit focus" },
  { keys: "E or F2", action: "Edit selected action item" },
  { keys: "↑ ↓", action: "Move through action-item list" },
  { keys: "Enter", action: "Toggle / confirm action item" },
  { keys: "Ctrl+Enter / ⌘Enter", action: "Save inline edit" },
];

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="shortcuts-modal-title"
      panelClass="max-w-sm"
    >
      <div class="modal-stack">
        <h3
          id="shortcuts-modal-title"
          class="modal-heading"
          style={{ marginBottom: 0 }}
        >
          Keyboard shortcuts
        </h3>
        <div class="space-y-2">
          {SHORTCUTS.map((sc) => (
            <div
              key={sc.keys}
              class="flex items-center justify-between gap-3"
            >
              <kbd
                style={{
                  fontSize: "var(--tiny-size)",
                  fontWeight: 700,
                  background: "var(--surface-cream)",
                  border: "2px solid var(--color-border)",
                  borderRadius: "var(--border-radius-sm)",
                  padding: "0.2rem 0.5rem",
                  whiteSpace: "nowrap",
                }}
              >
                {sc.keys}
              </kbd>
              <span
                style={{
                  fontSize: "var(--small-size)",
                  color: "var(--color-text-secondary)",
                  textAlign: "right",
                }}
              >
                {sc.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
