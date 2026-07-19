/**
 * Toast Notification Utility
 *
 * Provides user feedback for actions like copy, save, errors
 * Ported from SvelteKit version with improvements
 */

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

/**
 * Shows a toast notification with icon and styling
 */
export function showToast(
  message: string,
  type: ToastType = "success",
  duration: number = 3000,
): HTMLElement | null {
  if (typeof window === "undefined") return null;

  // Warm, on-brand colors per type (built inline so they survive Tailwind purge
  // — this file is outside the content glob).
  const config = {
    success: { icon: "fa-check-circle", bg: "#52A37F" },
    error: { icon: "fa-exclamation-circle", bg: "#c4607a" },
    info: { icon: "fa-info-circle", bg: "#5b8def" },
    warning: { icon: "fa-exclamation-triangle", bg: "#d4a01a" },
  };
  const { icon, bg } = config[type];

  const toast = buildToastShell(message, icon, bg, type);
  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => dismissToast(toast), duration);

  return toast;
}

/**
 * Shows a toast with a clickable "Undo" button. Used for reversible destructive
 * actions (delete conversation, merge topic, clear done, etc.). Clicking Undo
 * runs `onUndo`, cancels the auto-dismiss, and removes the toast immediately.
 * Returns a handle to dismiss it programmatically.
 *
 * Styled as "warning" so it reads as "heads up, this happened" rather than a
 * green success. Longer default lifetime (6s) since the user has to react.
 */
export function showUndoToast(
  message: string,
  onUndo: () => void,
  duration: number = 6000,
): { dismiss: () => void } {
  if (typeof window === "undefined") return { dismiss: () => {} };

  const { icon, bg } = {
    icon: "fa-rotate-left",
    bg: "#d4a01a", // warning amber
  };
  const toast = buildToastShell(message, icon, bg, "info");

  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  const close = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    dismissToast(toast);
  };

  // Real <button> element + addEventListener (no innerHTML) — keeps the
  // anti-XSS guarantee even though label text here is static.
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.textContent = "Undo";
  undoBtn.style.cssText =
    `margin-left:auto;flex-shrink:0;cursor:pointer;border:none;` +
    `background:rgba(255,255,255,0.22);color:#fff;font-weight:700;` +
    `font-size:0.8rem;padding:0.25rem 0.7rem;border-radius:8px;`;
  undoBtn.addEventListener("click", () => {
    try {
      onUndo();
    } catch (err) {
      console.error("Undo failed:", err);
    }
    close();
  });

  toast.appendChild(undoBtn);
  document.body.appendChild(toast);

  timer = setTimeout(() => {
    timer = 0;
    dismissToast(toast);
  }, duration);

  return { dismiss: close };
}

/**
 * Shows a toast with a clickable action button. Generic version of
 * showUndoToast — use for any toast that needs a user-triggered action
 * (e.g. "Reload" after a cross-tab edit). Same anti-XSS guarantee:
 * label is set via textContent, never innerHTML.
 */
export function showActionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  duration: number = 8000,
): { dismiss: () => void } {
  if (typeof window === "undefined") return { dismiss: () => {} };

  const { icon, bg } = {
    icon: "fa-info-circle",
    bg: "#5b8def", // info blue
  };
  const toast = buildToastShell(message, icon, bg, "info");

  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  const close = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    dismissToast(toast);
  };

  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.textContent = actionLabel;
  actionBtn.style.cssText =
    `margin-left:auto;flex-shrink:0;cursor:pointer;border:none;` +
    `background:rgba(255,255,255,0.22);color:#fff;font-weight:700;` +
    `font-size:0.8rem;padding:0.25rem 0.7rem;border-radius:8px;`;
  actionBtn.addEventListener("click", () => {
    try {
      onAction();
    } catch (err) {
      console.error("Action toast handler failed:", err);
    }
    close();
  });

  toast.appendChild(actionBtn);
  document.body.appendChild(toast);

  timer = setTimeout(() => {
    timer = 0;
    dismissToast(toast);
  }, duration);

  return { dismiss: close };
}

/** Build the shared toast div (pill, icon, message). No timers attached. */
function buildToastShell(
  message: string,
  icon: string,
  bg: string,
  type: ToastType,
): HTMLElement {
  const toast = document.createElement("div");
  toast.className = "toast-pop";
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.style.cssText =
    `position:fixed;right:1rem;bottom:1rem;z-index:9999;max-width:min(360px,calc(100vw - 2rem));` +
    `display:flex;align-items:center;gap:0.5rem;padding:0.6rem 0.9rem;border-radius:12px;` +
    `background:${bg};color:#fff;font-weight:600;font-size:0.875rem;` +
    `box-shadow:0 8px 24px rgba(30,23,20,0.18);`;

  // Icon (decorative) — safe static markup.
  const iconEl = document.createElement("i");
  iconEl.className = `fas ${icon}`;
  iconEl.setAttribute("aria-hidden", "true");

  // Message via textContent — NEVER innerHTML. Remote-controlled strings (live
  // collab display names) would otherwise be a stored-XSS vector.
  const msgEl = document.createElement("span");
  msgEl.textContent = message;

  toast.append(iconEl, msgEl);
  return toast;
}

/** Slide-out + remove a toast element (idempotent). */
function dismissToast(toast: HTMLElement): void {
  if (!toast.isConnected) return;
  toast.classList.add("animate-slide-out-right");
  setTimeout(() => toast.remove(), 300);
}

/**
 * Copies text to clipboard with toast feedback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text?.trim()) {
    console.warn("No content to copy to clipboard");
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
    return true;
  } catch (err) {
    console.error("Error copying to clipboard:", err);
    showToast("Failed to copy to clipboard", "error");
    return false;
  }
}

/**
 * Format a date with standard options
 */
export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  const dateObj = date instanceof Date ? date : new Date(date);

  try {
    return dateObj.toLocaleString("en-US", { ...defaultOptions, ...options });
  } catch (err) {
    console.error("Error formatting date:", err);
    return "Unknown date";
  }
}
