/**
 * Mobile History Menu Island - Slide-out Drawer
 *
 * Mobile-optimized conversation history with touch-friendly controls
 *
 * Features: starring, All/Starred filter, backup export & import
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  deleteConversation,
  getAllConversations,
  getConversationList,
  getStorageStats,
  loadConversation,
  replaceAllConversations,
  restoreConversation,
  type StoredConversation,
  toggleConversationStarred,
} from "../core/storage/localStorage.ts";
import {
  mergeBackup,
  parseBackup,
  serializeBackup,
} from "../core/storage/backup.ts";
import {
  conversationData,
  historyDrawerOpen as isOpen,
} from "@signals/conversationStore.ts";
import { showToast, showUndoToast } from "../utils/toast.ts";

// Cache date formatter outside component to avoid recreating
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Compact human size for the storage meter (e.g. "734 KB", "1.2 MB").
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

type FilterMode = "all" | "starred";

export default function MobileHistoryMenu() {
  const refreshTrigger = useSignal(0);
  const showConfirmDelete = useSignal<string | null>(null);
  const filterMode = useSignal<FilterMode>("all");
  const searchQuery = useSignal("");
  const importInputRef = useRef<HTMLInputElement>(null);

  // Memoize conversations list - only recalculates when refreshTrigger changes
  const conversations = useComputed<StoredConversation[]>(() => {
    refreshTrigger.value; // Depend on this to trigger refresh
    return getConversationList();
  });

  // Filtered view — star + search
  const visibleConversations = useComputed<StoredConversation[]>(() => {
    let list = filterMode.value === "starred"
      ? conversations.value.filter((c) => c.starred)
      : conversations.value;

    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.conversation.title || "").toLowerCase().includes(q)
      );
    }
    return list;
  });

  // Date-grouped conversations for the list. Groups: Today / Yesterday /
  // This Week / Older. Each group is { label, items }.
  const groupedConversations = useComputed(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    // This Monday (or today if it's Monday)
    const dow = today.getDay(); // 0=Sun
    const monday = new Date(
      today.getTime() - (dow === 0 ? 6 : dow - 1) * 86400000,
    );

    const groups: { label: string; items: StoredConversation[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "This Week", items: [] },
      { label: "Older", items: [] },
    ];

    for (const conv of visibleConversations.value) {
      const d = new Date(conv.updatedAt);
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (dateOnly.getTime() >= today.getTime()) {
        groups[0].items.push(conv);
      } else if (dateOnly.getTime() >= yesterday.getTime()) {
        groups[1].items.push(conv);
      } else if (dateOnly.getTime() >= monday.getTime()) {
        groups[2].items.push(conv);
      } else {
        groups[3].items.push(conv);
      }
    }

    return groups.filter((g) => g.items.length > 0);
  });

  // Local-storage usage, recomputed whenever the saved set changes. Surfacing
  // this makes the 5MB localStorage ceiling observable — the signal that tells
  // us (later) whether an IndexedDB migration is actually warranted.
  const storage = useComputed(() => {
    refreshTrigger.value; // re-read after any save/delete/import
    return getStorageStats();
  });

  // Load conversations on mount
  useEffect(() => {
    refreshTrigger.value++;
  }, []);

  // Lock body scroll while the drawer is open so iOS momentum scroll inside
  // the list doesn't chain through to the page behind it.
  useEffect(() => {
    if (!isOpen.value) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen.value]);

  // Escape closes the delete confirmation (keyboard parity with the buttons).
  useEffect(() => {
    if (!showConfirmDelete.value) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDelete();
      }
    }
    globalThis.addEventListener("keydown", onKeydown);
    return () => globalThis.removeEventListener("keydown", onKeydown);
  }, [showConfirmDelete.value]);

  // Refresh list when conversationData changes (debounced)
  useEffect(() => {
    if (conversationData.value) {
      const timeout = setTimeout(() => {
        refreshTrigger.value++;
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [conversationData.value]);

  function refreshList() {
    refreshTrigger.value++;
  }

  function handleLoad(id: string) {
    const conv = loadConversation(id);
    if (conv) {
      conversationData.value = conv;
      isOpen.value = false; // Close drawer after loading
    }
  }

  function handleDelete(id: string) {
    showConfirmDelete.value = id;
  }

  function confirmDelete() {
    if (showConfirmDelete.value) {
      const id = showConfirmDelete.value;
      // Snapshot the full record BEFORE deleting so undo can restore it
      // byte-for-byte — a deleted conversation is otherwise gone forever.
      const removed = loadConversation(id);
      const wasActive = conversationData.value?.conversation.id === id;

      deleteConversation(id);
      if (wasActive) conversationData.value = null;

      refreshList();
      showConfirmDelete.value = null;

      if (removed) {
        const title = removed.conversation.title?.slice(0, 40) ||
          "conversation";
        showUndoToast(`Deleted "${title}"`, () => {
          restoreConversation(removed);
          if (wasActive) conversationData.value = removed;
          refreshList();
        });
      }
    }
  }

  function cancelDelete() {
    showConfirmDelete.value = null;
  }

  function handleNew() {
    conversationData.value = null;
    isOpen.value = false;
  }

  function handleToggleStar(e: MouseEvent, id: string) {
    e.stopPropagation();
    toggleConversationStarred(id);
    refreshList();
  }

  // ===================================================================
  // BACKUP — EXPORT
  // ===================================================================
  function handleExport() {
    try {
      const json = serializeBackup(
        getAllConversations(),
        new Date().toISOString(),
      );
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const dateTag = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `promapper-backup-${dateTag}.json`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast("Backup downloaded", "success");
    } catch (err) {
      console.error("Backup export failed:", err);
      showToast("Export failed — check the console", "error");
    }
  }

  // ===================================================================
  // BACKUP — IMPORT
  // ===================================================================
  async function handleImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    // Size guard: a backup is text/JSON, never huge. Decoding a fat-fingered
    // 200MB video on the main thread would freeze the tab. accept=".json" is
    // trivially bypassed, so guard here.
    const MAX_IMPORT = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_IMPORT) {
      showToast(
        "That file's too big to be a backup (max 10MB).",
        "error",
      );
      if (importInputRef.current) importInputRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      const count = Object.keys(parsed).length;
      // A non-empty file that yields zero conversations isn't a success — it's
      // the wrong file (different app, or not a backup). Don't show green.
      if (count === 0) {
        showToast(
          "No conversations found — is this a ProMapper backup?",
          "error",
        );
        if (importInputRef.current) importInputRef.current.value = "";
        return;
      }
      const merged = mergeBackup(getAllConversations(), parsed);
      replaceAllConversations(merged);
      // Reconcile the open conversation: if the import brought a newer copy of
      // it, refresh the in-memory signal so a later autosave can't clobber the
      // freshly-imported data with the stale version still held in memory.
      const openId = conversationData.value?.conversation.id;
      if (openId && merged[openId]) {
        conversationData.value = merged[openId];
      }
      refreshList();
      showToast(
        `Imported ${count} conversation${count !== 1 ? "s" : ""}`,
        "success",
      );
    } catch (err) {
      console.error("Backup import failed:", err);
      showToast("Import failed — file may be corrupt", "error");
    }
    // Reset so the same file can be re-imported if needed
    if (importInputRef.current) importInputRef.current.value = "";
  }

  const activeId = conversationData.value?.conversation.id;

  return (
    <>
      {
        /* The drawer opens from the header History icon (both landing and
          conversation headers) — the old floating trigger pill collided
          with the footer dials. */
      }

      {/* Backdrop */}
      {isOpen.value && (
        <div
          class="fixed inset-0 z-30 history-drawer-backdrop"
          onClick={() => (isOpen.value = false)}
        />
      )}

      {
        /* Slide-out Drawer. inert while closed — it's only translated
          off-screen, so without this its whole content stays in the Tab
          order and screen-reader tree while invisible. */
      }
      <div
        class={`history-drawer history-drawer-panel fixed inset-y-0 right-0 w-96 max-w-[85vw] z-40 ${
          isOpen.value ? "is-open" : "is-closed"
        }`}
        aria-hidden={!isOpen.value}
        // @ts-ignore inert is valid HTML; Preact's types lag behind
        inert={!isOpen.value ? true : undefined}
      >
        {/* Header */}
        <div class="history-drawer-header">
          <h2 class="history-drawer-title">Your Conversations</h2>
          <button
            onClick={() => (isOpen.value = false)}
            class="history-drawer-close"
            aria-label="Close history"
          >
            <i class="fa fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {/* New Conversation Button */}
        <div class="history-drawer__new">
          <button
            onClick={handleNew}
            class="history-drawer-new-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Conversation
          </button>
        </div>

        {/* All / Starred filter */}
        <div class="history-filter-row">
          {(["all", "starred"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                filterMode.value = mode;
                searchQuery.value = "";
              }}
              class={`history-filter-btn${
                filterMode.value === mode ? " is-active" : ""
              }`}
            >
              {mode === "all" ? "All" : "★ Starred"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div class="history-search">
          <input
            type="text"
            value={searchQuery.value}
            onInput={(e) =>
              searchQuery.value = (e.target as HTMLInputElement).value}
            placeholder="Search conversations"
            aria-label="Search conversations"
            class="w-full rounded px-2 py-1.5 focus:outline-none action-input--xs"
          />
        </div>

        {/* Conversation List */}
        <div
          class="history-drawer__list overflow-y-auto space-y-3"
          style={{ padding: "1rem 1.5rem", flex: 1 }}
        >
          {groupedConversations.value.length === 0
            ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                <div
                  style={{
                    fontSize: "3rem",
                    marginBottom: "1rem",
                    opacity: 0.4,
                  }}
                >
                  {filterMode.value === "starred" ? "★" : "✨"}
                </div>
                <p
                  style={{
                    fontSize: "var(--text-size)",
                    fontWeight: "500",
                    lineHeight: "var(--line-height)",
                  }}
                >
                  {filterMode.value === "starred"
                    ? (
                      <>
                        No starred conversations yet.<br />
                        Tap the{" "}
                        <i class="fa-regular fa-star" aria-hidden="true"></i>
                        {" "}
                        on any conversation to pin it here.
                      </>
                    )
                    : (
                      <>
                        No conversations yet.<br />
                        Start creating some magic!
                      </>
                    )}
                </p>
              </div>
            )
            : (
              groupedConversations.value.map((group) => (
                <div key={group.label}>
                  <div class="history-date-group">{group.label}</div>
                  {group.items.map((conv) => {
                    const isActive = activeId === conv.id;
                    const fullTitle = conv.conversation.title || "Untitled";
                    const truncatedTitle = fullTitle.length > 35
                      ? `${fullTitle.substring(0, 35)}…`
                      : fullTitle;
                    // Use cached date formatter for better performance
                    const dateStr = dateFormatter.format(
                      new Date(conv.updatedAt),
                    );

                    return (
                      <div
                        key={conv.id}
                        class={`history-item history-drawer__item${
                          isActive ? " active" : ""
                        }`}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "start",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                          }}
                        >
                          <button
                            onClick={() => handleLoad(conv.id)}
                            class="flex-1 text-left bg-transparent border-none cursor-pointer p-0"
                          >
                            <h3
                              title={fullTitle}
                              class="history-item-heading"
                            >
                              {truncatedTitle}
                            </h3>
                            <div
                              class="flex flex-wrap items-center gap-2 mt-2"
                              style={{ fontSize: "var(--tiny-size)" }}
                            >
                              <span class="history-item-badge history-item-badge--accent">
                                {conv.nodes.length} topics
                              </span>
                              <span class="history-item-badge history-item-badge--soft">
                                {conv.actionItems.length} items
                              </span>
                            </div>
                            <p class="history-item-date">
                              {dateStr}
                            </p>
                          </button>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            {/* Star toggle */}
                            <button
                              onClick={(e) => handleToggleStar(e, conv.id)}
                              title={conv.starred
                                ? "Unstar"
                                : "Star conversation"}
                              class={`history-action-btn history-star-btn${
                                conv.starred ? " is-starred" : ""
                              }`}
                            >
                              <i
                                class={conv.starred
                                  ? "fa-solid fa-star"
                                  : "fa-regular fa-star"}
                                aria-hidden="true"
                              >
                              </i>
                            </button>

                            {/* Delete */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(conv.id);
                              }}
                              class="history-action-btn history-delete-btn"
                              data-tip="Delete"
                              data-tip-align="right"
                            >
                              <i
                                class="fa-regular fa-trash-can"
                                aria-hidden="true"
                              >
                              </i>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
        </div>

        {/* Backup / Restore footer */}
        <div
          style={{
            padding: "0.75rem 1.5rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            background: "rgba(0, 0, 0, 0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "0.625rem",
            flexShrink: 0,
          }}
        >
          {/* Storage meter — makes the local-space ceiling visible */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: "var(--tiny-size)",
                color: "var(--color-text-secondary)",
                fontWeight: "500",
              }}
            >
              <span>
                {conversations.value.length} saved
              </span>
              <span title="Conversations are stored in this browser's local storage (about 5MB). Export a backup to keep them safe.">
                {formatBytes(storage.value.used)} ·{" "}
                {Math.round(storage.value.percentage)}%
              </span>
            </div>
            {
              /* Track + fill. Fill uses the theme accent; as it nears full it
                recedes (desaturates/dims) rather than turning red — per the
                visual contract, warning = recession, never alarm. */
            }
            <div
              style={{
                height: "5px",
                borderRadius: "var(--btn-radius-pill)",
                background: "rgba(0, 0, 0, 0.06)",
                overflow: "hidden",
              }}
              role="progressbar"
              aria-valuenow={Math.round(storage.value.percentage)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Local storage used"
            >
              <div
                style={{
                  height: "100%",
                  width: `${
                    Math.min(100, Math.max(2, storage.value.percentage))
                  }%`,
                  borderRadius: "var(--btn-radius-pill)",
                  background: storage.value.percentage >= 80
                    ? "color-mix(in srgb, var(--color-accent) 45%, var(--color-text-secondary))"
                    : "var(--color-accent)",
                  opacity: storage.value.percentage >= 80 ? 0.85 : 1,
                  transition: "width var(--transition-fast)",
                }}
              />
            </div>
          </div>

          {/* Backup actions */}
          <div
            style={{
              display: "flex",
              gap: "0.625rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleExport}
              class="history-backup-btn history-backup-btn--export"
              data-tip="Save a JSON backup"
            >
              ↓ Export
            </button>

            <button
              onClick={() => importInputRef.current?.click()}
              class="history-backup-btn history-backup-btn--import"
              data-tip="Merge from a backup file"
            >
              ↑ Import
            </button>

            {/* Hidden file input */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete.value && (
        <div
          class="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelDelete();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete this conversation?"
            style={{
              background: "rgba(255, 255, 255, 0.98)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: "var(--border-radius-xl)",
              border: `3px solid var(--color-danger-border)`,
              boxShadow: "var(--shadow-xl)",
              padding: "2rem",
              maxWidth: "400px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: "700",
                marginBottom: "0.75rem",
                color: "var(--color-text)",
                lineHeight: "1.2",
              }}
            >
              Delete this conversation?
            </h3>
            <p
              style={{
                fontSize: "var(--text-size)",
                color: "var(--color-text-secondary)",
                marginBottom: "1.5rem",
                lineHeight: "var(--line-height)",
              }}
            >
              This removes the conversation and all its data. You'll have a few
              seconds to undo if you change your mind.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  fontSize: "var(--heading-size)",
                  fontWeight: "700",
                  border: `3px solid var(--color-danger-dark)`,
                  borderRadius: "12px",
                  background: "var(--color-danger)",
                  color: "white",
                  cursor: "pointer",
                  transition: "all var(--transition-medium)",
                  boxShadow: "0 4px 0 0 rgba(220, 38, 38, 0.3)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 0 0 rgba(220, 38, 38, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 0 0 rgba(220, 38, 38, 0.3)";
                }}
              >
                Delete
              </button>
              <button
                onClick={cancelDelete}
                // Focus lands on the safe action when the dialog opens.
                autofocus
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  fontSize: "var(--heading-size)",
                  fontWeight: "700",
                  border: "3px solid rgba(0, 0, 0, 0.15)",
                  borderRadius: "12px",
                  background: "rgba(0, 0, 0, 0.05)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  transition: "all var(--transition-medium)",
                  boxShadow: "0 4px 0 0 rgba(0, 0, 0, 0.08)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 0 0 rgba(0, 0, 0, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 0 0 rgba(0, 0, 0, 0.08)";
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
