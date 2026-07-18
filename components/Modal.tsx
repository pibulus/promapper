/**
 * Modal — Reusable accessible dialog wrapper
 * Handles: ESC close, focus trap, focus restore, backdrop click dismiss
 */

import { ComponentChildren } from "preact";
import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  panelClass?: string;
  initialFocusRef?: RefObject<HTMLElement>;
  children: ComponentChildren;
}

export default function Modal(
  {
    open,
    onClose,
    titleId,
    panelClass = "max-w-md",
    initialFocusRef,
    children,
  }: ModalProps,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Save trigger element to restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  // Focus first focusable element or initialFocusRef on open
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const target = initialFocusRef?.current ??
      dialogRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
    target?.focus();
  }, [open]);

  // Lock body scroll while open — same pattern as the drawers/ReaderModal.
  // Without it the page scrolls (and iOS rubber-bands) behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", handleTab);
    return () => dialog.removeEventListener("keydown", handleTab);
  }, [open]);

  // Restore focus on close
  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(30,23,20,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        class={`dashboard-card ${panelClass} w-full mx-4`}
        style={{ padding: "var(--card-padding)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
