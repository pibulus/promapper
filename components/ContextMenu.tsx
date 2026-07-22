/**
 * Context Menu Component
 *
 * Right-click menu for graph interactions
 */

import { useEffect } from "preact/hooks";
import BodyPortal from "./BodyPortal.tsx";

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: Array<{
    label: string;
    icon?: string;
    onClick: () => void;
  }>;
  onClose: () => void;
}

export default function ContextMenu(
  { visible, x, y, items, onClose }: ContextMenuProps,
) {
  // Close on click outside or escape
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = () => onClose();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Small delay to prevent immediate close from the right-click event
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("contextmenu", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 10);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  // Portaled: x/y are viewport coords (clientX/Y) — rendered inside a
  // transformed flip card, position:fixed resolves against the card and the
  // menu lands offset from the cursor.
  return (
    <BodyPortal>
      <div
        class="context-menu"
        style={{
          left: `${x}px`,
          top: `${y}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, index) => (
          <button
            key={index}
            class="context-menu__item"
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <i class={`fa ${item.icon}`} aria-hidden="true"></i>}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </BodyPortal>
  );
}
