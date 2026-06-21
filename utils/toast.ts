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
  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add("animate-slide-out-right");
    setTimeout(() => toast.remove(), 300);
  }, duration);

  return toast;
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
