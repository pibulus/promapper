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
  loadConversation,
  replaceAllConversations,
  type StoredConversation,
  toggleConversationStarred,
} from "../core/storage/localStorage.ts";
import {
  mergeBackup,
  parseBackup,
  serializeBackup,
} from "../core/storage/backup.ts";
import { conversationData } from "@signals/conversationStore.ts";
import { showToast } from "../utils/toast.ts";

// Cache date formatter outside component to avoid recreating
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type FilterMode = "all" | "starred";

export default function MobileHistoryMenu() {
  const refreshTrigger = useSignal(0);
  const isOpen = useSignal(false);
  const showConfirmDelete = useSignal<string | null>(null);
  const filterMode = useSignal<FilterMode>("all");
  const importInputRef = useRef<HTMLInputElement>(null);

  // Memoize conversations list - only recalculates when refreshTrigger changes
  const conversations = useComputed<StoredConversation[]>(() => {
    refreshTrigger.value; // Depend on this to trigger refresh
    return getConversationList();
  });

  // Filtered view
  const visibleConversations = useComputed<StoredConversation[]>(() =>
    filterMode.value === "starred"
      ? conversations.value.filter((c) => c.starred)
      : conversations.value
  );

  // Load conversations on mount
  useEffect(() => {
    refreshTrigger.value++;
  }, []);

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
      deleteConversation(showConfirmDelete.value);

      // Clear active conversation if it was deleted
      if (conversationData.value?.conversation.id === showConfirmDelete.value) {
        conversationData.value = null;
      }

      refreshList();
      showConfirmDelete.value = null;
    }
  }

  function cancelDelete() {
    showConfirmDelete.value = null;
  }

  function handleNew() {
    conversationData.value = null;
    isOpen.value = false;
  }

  function toggleMenu() {
    isOpen.value = !isOpen.value;
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
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
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
      const count = Object.keys(parsed).length;
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
      {/* Floating Menu Button - Now works on all screens! */}
      <button
        onClick={toggleMenu}
        class="history-drawer-trigger fixed bottom-6 right-6 flex items-center justify-center z-40 transition-all"
        style={{
          background: "rgba(255, 252, 248, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "2px solid rgba(0, 0, 0, 0.15)",
          borderRadius: "var(--border-radius)",
          padding: "14px 18px",
          boxShadow: "4px 4px 0 0 rgba(0, 0, 0, 0.1)",
          cursor: "pointer",
          fontWeight: "700",
          fontSize: "var(--text-size)",
          color: "var(--color-text)",
          gap: "8px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translate(-2px, -2px)";
          e.currentTarget.style.boxShadow = "6px 6px 0 0 rgba(0, 0, 0, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translate(0, 0)";
          e.currentTarget.style.boxShadow = "4px 4px 0 0 rgba(0, 0, 0, 0.1)";
        }}
        aria-label="Open conversation history"
        title="View saved conversations"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span class="hidden sm:inline">History</span>
      </button>

      {/* Backdrop */}
      {isOpen.value && (
        <div
          class="fixed inset-0 z-30"
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={() => (isOpen.value = false)}
        />
      )}

      {/* Slide-out Drawer */}
      <div
        class={`history-drawer fixed inset-y-0 right-0 w-96 max-w-[85vw] z-40 ${
          isOpen.value ? "is-open" : "is-closed"
        }`}
        style={{
          background: "rgba(255, 252, 248, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderLeft: "2px solid rgba(0, 0, 0, 0.1)",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          class="history-drawer__header"
          style={{
            background: "rgba(232, 131, 156, 0.15)",
            borderBottom: "2px solid rgba(232, 131, 156, 0.3)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontWeight: "700",
              fontSize: "var(--font-size-lg)",
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Your Conversations
          </h2>
          <button
            onClick={() => (isOpen.value = false)}
            style={{
              background: "rgba(0, 0, 0, 0.05)",
              border: "2px solid rgba(0, 0, 0, 0.1)",
              borderRadius: "var(--border-radius-sm)",
              width: "44px",
              height: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all var(--transition-medium)",
              color: "var(--color-text)",
              fontSize: "var(--heading-size)",
              fontWeight: "600",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            ✕
          </button>
        </div>

        {/* New Conversation Button */}
        <div
          class="history-drawer__new"
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleNew}
            style={{
              width: "100%",
              padding: "14px 20px",
              fontSize: "var(--heading-size)",
              fontWeight: "700",
              border: "2px solid #1A1A1A",
              borderRadius: "12px",
              background: "#1A1A1A",
              color: "white",
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "4px 4px 0 0 rgba(0, 0, 0, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translate(-2px, -2px)";
              e.currentTarget.style.boxShadow =
                "6px 6px 0 0 rgba(0, 0, 0, 0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translate(0, 0)";
              e.currentTarget.style.boxShadow =
                "4px 4px 0 0 rgba(0, 0, 0, 0.12)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "translate(2px, 2px)";
              e.currentTarget.style.boxShadow =
                "2px 2px 0 0 rgba(0, 0, 0, 0.12)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translate(-2px, -2px)";
              e.currentTarget.style.boxShadow =
                "6px 6px 0 0 rgba(0, 0, 0, 0.12)";
            }}
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
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            flexShrink: 0,
          }}
        >
          {(["all", "starred"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => (filterMode.value = mode)}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: "var(--tiny-size)",
                fontWeight: "600",
                borderRadius: "8px",
                border: filterMode.value === mode
                  ? "2px solid #1A1A1A"
                  : "2px solid rgba(0,0,0,0.1)",
                background: filterMode.value === mode
                  ? "#1A1A1A"
                  : "rgba(0,0,0,0.03)",
                color: filterMode.value === mode
                  ? "white"
                  : "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              {mode === "all" ? "All" : "★ Starred"}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div
          class="history-drawer__list overflow-y-auto space-y-3"
          style={{ padding: "1.25rem 1.5rem", flex: 1 }}
        >
          {visibleConversations.value.length === 0
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
                        Tap ☆ on any conversation to pin it here.
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
              visibleConversations.value.map((conv) => {
                const isActive = activeId === conv.id;
                const truncatedTitle =
                  conv.conversation.title?.substring(0, 35) || "Untitled";
                // Use cached date formatter for better performance
                const dateStr = dateFormatter.format(new Date(conv.updatedAt));

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
                        style={{
                          flex: 1,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <h3
                          style={{
                            fontWeight: "700",
                            color: "var(--color-text)",
                            fontSize: "var(--text-size)",
                            marginBottom: "0.5rem",
                            lineHeight: "1.3",
                          }}
                        >
                          {truncatedTitle}
                        </h3>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginTop: "0.5rem",
                            fontSize: "var(--tiny-size)",
                          }}
                        >
                          <span
                            style={{
                              background: "rgba(59, 130, 246, 0.12)",
                              color: "#2563EB",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: "600",
                            }}
                          >
                            {conv.nodes.length} topics
                          </span>
                          <span
                            style={{
                              background: "rgba(34, 197, 94, 0.12)",
                              color: "#16A34A",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: "600",
                            }}
                          >
                            {conv.actionItems.length} items
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: "var(--tiny-size)",
                            color: "#8B7F77",
                            marginTop: "0.5rem",
                            fontWeight: "500",
                          }}
                        >
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
                          title={conv.starred ? "Unstar" : "Star conversation"}
                          style={{
                            background: conv.starred
                              ? "rgba(245, 158, 11, 0.12)"
                              : "rgba(0, 0, 0, 0.04)",
                            border: conv.starred
                              ? "2px solid rgba(245, 158, 11, 0.35)"
                              : "2px solid rgba(0, 0, 0, 0.08)",
                            borderRadius: "var(--border-radius-sm)",
                            padding: "6px",
                            cursor: "pointer",
                            transition: "all var(--transition-medium)",
                            fontSize: "var(--heading-size)",
                            width: "36px",
                            height: "36px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: conv.starred
                              ? "#d97706"
                              : "var(--color-text-secondary)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(245, 158, 11, 0.18)";
                            e.currentTarget.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = conv.starred
                              ? "rgba(245, 158, 11, 0.12)"
                              : "rgba(0, 0, 0, 0.04)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          {conv.starred ? "★" : "☆"}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(conv.id);
                          }}
                          style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            border: `2px solid rgba(239, 68, 68, 0.2)`,
                            borderRadius: "var(--border-radius-sm)",
                            padding: "8px",
                            cursor: "pointer",
                            transition: "all var(--transition-medium)",
                            fontSize: "var(--heading-size)",
                            width: "36px",
                            height: "36px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(239, 68, 68, 0.15)";
                            e.currentTarget.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              "rgba(239, 68, 68, 0.1)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                          title="Delete conversation"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
        </div>

        {/* Backup / Restore footer */}
        <div
          style={{
            padding: "0.75rem 1.5rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            background: "rgba(0, 0, 0, 0.02)",
            display: "flex",
            gap: "0.625rem",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontSize: "var(--tiny-size)",
              color: "#8B7F77",
              fontWeight: "500",
              flex: 1,
            }}
          >
            {conversations.value.length} saved
          </p>

          <button
            onClick={handleExport}
            style={{
              padding: "7px 14px",
              fontSize: "var(--tiny-size)",
              fontWeight: "600",
              border: "2px solid rgba(232, 131, 156, 0.3)",
              borderRadius: "8px",
              background: "rgba(232, 131, 156, 0.1)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(232, 131, 156, 0.2)";
              e.currentTarget.style.color = "#111";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(232, 131, 156, 0.1)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            title="Download all conversations as a JSON backup"
          >
            ↓ Export
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            style={{
              padding: "7px 14px",
              fontSize: "var(--tiny-size)",
              fontWeight: "600",
              border: "2px solid rgba(134, 197, 166, 0.3)",
              borderRadius: "8px",
              background: "rgba(134, 197, 166, 0.1)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(134, 197, 166, 0.2)";
              e.currentTarget.style.color = "#111";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(134, 197, 166, 0.1)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            title="Import conversations from a backup file (merges, never overwrites newer)"
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

      {/* Delete Confirmation Modal */}
      {showConfirmDelete.value && (
        <div
          class="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
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
              This will permanently delete this conversation and all its data.
              This action cannot be undone.
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
