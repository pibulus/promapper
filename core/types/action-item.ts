/**
 * Action Item Types
 */

export interface ActionItem {
  id: string;
  conversation_id: string;
  description: string;
  assignee: string | null;
  /** Human words ("friday", "before the gig"). AI extraction may emit
   * YYYY-MM-DD — ISO strings render as friendly dates in the UI.
   * No longer editable in the UI as of Sept 30 2026 (replaced by `color`,
   * a user-picked dot with no fixed meaning) — kept on the type so old
   * saved items don't lose the field, and AI extraction/exports are
   * untouched. */
  due_date: string | null;
  /** One of DOT_COLORS (utils/actionTags.ts), or null. No fixed meaning —
   * people invent their own rules for what a color means, same idea as
   * NibNab's capture-bucket dots. */
  color?: string | null;
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
  ai_checked?: boolean; // Was this updated by AI?
  checked_reason?: string; // Why AI updated it
}

export interface ActionItemStatusUpdate {
  id: string;
  description: string;
  status: "completed" | "pending";
  reason: string; // AI's explanation for the change
}

export interface ActionItemInput {
  description: string;
  assignee: string | null;
  due_date: string | null;
}
