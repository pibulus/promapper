/**
 * Conversation List Island - History Sidebar
 *
 * Shows all saved conversations with load/delete actions
 * Auto-updates when conversations change
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

type FilterMode = "all" | "starred";

export default function ConversationList() {
  const conversations = useSignal<StoredConversation[]>([]);
  const showConfirmDelete = useSignal<string | null>(null);
  const filterMode = useSignal<FilterMode>("all");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshList();
  }, []);

  useEffect(() => {
    if (conversationData.value) {
      refreshList();
    }
  }, [conversationData.value]);

  function refreshList() {
    conversations.value = getConversationList();
  }

  function handleLoad(id: string) {
    const conv = loadConversation(id);
    if (conv) {
      conversationData.value = conv;
    }
  }

  function handleDelete(id: string) {
    showConfirmDelete.value = id;
  }

  function confirmDelete() {
    if (showConfirmDelete.value) {
      deleteConversation(showConfirmDelete.value);
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

  const activeId = useComputed(() => conversationData.value?.conversation.id);

  const visibleConversations = useComputed(() =>
    filterMode.value === "starred"
      ? conversations.value.filter((c) => c.starred)
      : conversations.value
  );

  return (
    <div
      class="flex flex-col h-full"
      style={{
        background: "rgba(255, 255, 255, 0.5)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRight: "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--heading-size)",
            fontWeight: "var(--heading-weight)",
            color: "var(--color-text)",
          }}
        >
          Conversations
        </h2>
      </div>

      {/* New Conversation Button */}
      <div
        class="p-3"
        style={{
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        <button
          onClick={handleNew}
          class="w-full py-2 px-4 rounded-lg"
          style={{
            background: "#111",
            color: "white",
            border: "none",
            fontSize: "var(--small-size)",
            fontWeight: "500",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#333"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#111"}
        >
          New Conversation
        </button>
      </div>

      {/* All / Starred filter */}
      <div
        class="flex gap-1 px-3 pt-3 pb-2"
        style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.06)" }}
      >
        {(["all", "starred"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => (filterMode.value = mode)}
            class="flex-1 py-1 rounded-md"
            style={{
              fontSize: "var(--tiny-size)",
              fontWeight: "600",
              border: filterMode.value === mode
                ? "1px solid #111"
                : "1px solid rgba(0,0,0,0.1)",
              background: filterMode.value === mode
                ? "#111"
                : "rgba(0,0,0,0.03)",
              color: filterMode.value === mode
                ? "white"
                : "var(--color-text-secondary)",
              transition: "all var(--transition-fast)",
              cursor: "pointer",
            }}
          >
            {mode === "all" ? "All" : "★ Starred"}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        {visibleConversations.value.length === 0
          ? (
            <p
              class="text-center py-8"
              style={{
                fontSize: "var(--small-size)",
                color: "var(--color-text-secondary)",
                lineHeight: "var(--line-height)",
              }}
            >
              {filterMode.value === "starred"
                ? "No starred conversations yet.\nStar one to pin it here."
                : "No saved conversations yet.\nUpload audio or text to begin."}
            </p>
          )
          : (
            visibleConversations.value.map((conv) => {
              const isActive = activeId.value === conv.id;
              const truncatedTitle =
                conv.conversation.title?.substring(0, 40) || "Untitled";

              return (
                <div
                  key={conv.id}
                  class="p-3 rounded-lg"
                  style={{
                    border: `1px solid ${
                      isActive ? "#111" : "rgba(0, 0, 0, 0.08)"
                    }`,
                    background: isActive
                      ? "rgba(0, 0, 0, 0.03)"
                      : "rgba(255, 255, 255, 0.6)",
                    transition: "all var(--transition-fast)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.9)";
                      e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.15)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.6)";
                      e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
                    }
                  }}
                >
                  <div class="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleLoad(conv.id)}
                      class="flex-1 text-left"
                    >
                      <h3
                        class="truncate"
                        style={{
                          fontSize: "var(--small-size)",
                          fontWeight: "600",
                          color: "#111",
                          marginBottom: "4px",
                        }}
                      >
                        {truncatedTitle}
                      </h3>
                      <div
                        class="flex items-center gap-2"
                        style={{
                          fontSize: "var(--tiny-size)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <span>{conv.nodes.length} topics</span>
                        <span>•</span>
                        <span>{conv.actionItems.length} items</span>
                      </div>
                      <p
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "#999",
                          marginTop: "4px",
                        }}
                      >
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </button>

                    <div class="flex items-center gap-1">
                      {/* Star toggle */}
                      <button
                        onClick={(e) => handleToggleStar(e, conv.id)}
                        class="p-1"
                        title={conv.starred ? "Unstar" : "Star conversation"}
                        style={{
                          fontSize: "var(--small-size)",
                          color: conv.starred
                            ? "#f59e0b"
                            : "var(--color-text-secondary)",
                          opacity: conv.starred ? 1 : 0.45,
                          transition:
                            "opacity var(--transition-fast), color var(--transition-fast)",
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = conv.starred
                            ? "1"
                            : "0.45";
                        }}
                      >
                        {conv.starred ? "★" : "☆"}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(conv.id)}
                        class="p-1"
                        style={{
                          color: "var(--color-danger)",
                          fontSize: "var(--small-size)",
                          transition: "opacity var(--transition-fast)",
                          opacity: 0.5,
                        }}
                        onMouseEnter={(e) =>
                          e.currentTarget.style.opacity = "1"}
                        onMouseLeave={(e) =>
                          e.currentTarget.style.opacity = "0.5"}
                        title="Delete conversation"
                      >
                        <i class="fa fa-trash"></i>
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
        class="flex gap-2 px-3 py-3"
        style={{ borderTop: "1px solid rgba(0, 0, 0, 0.06)" }}
      >
        <button
          onClick={handleExport}
          class="flex-1 py-1 rounded-md"
          style={{
            fontSize: "var(--tiny-size)",
            fontWeight: "500",
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(232,131,156,0.08)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(232,131,156,0.18)";
            e.currentTarget.style.color = "#111";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(232,131,156,0.08)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          title="Download all conversations as a JSON backup"
        >
          ↓ Export
        </button>

        <button
          onClick={() => importInputRef.current?.click()}
          class="flex-1 py-1 rounded-md"
          style={{
            fontSize: "var(--tiny-size)",
            fontWeight: "500",
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(134,197,166,0.08)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(134,197,166,0.18)";
            e.currentTarget.style.color = "#111";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(134,197,166,0.08)";
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

      {/* Delete Confirmation Modal */}
      {showConfirmDelete.value && (
        <div
          class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={cancelDelete}
        >
          <div
            class="rounded-lg p-6 max-w-sm mx-4"
            style={{
              background: "white",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              class="mb-3"
              style={{
                fontSize: "var(--heading-size)",
                fontWeight: "var(--heading-weight)",
                color: "var(--color-text)",
              }}
            >
              Delete Conversation?
            </h3>
            <p
              class="mb-6"
              style={{
                fontSize: "var(--small-size)",
                color: "var(--color-text-secondary)",
                lineHeight: "var(--line-height)",
              }}
            >
              This will permanently delete this conversation and all its data.
              This action cannot be undone.
            </p>
            <div class="flex gap-2">
              <button
                onClick={confirmDelete}
                class="flex-1 py-2 px-4 rounded-lg"
                style={{
                  background: "var(--color-danger)",
                  color: "white",
                  border: "none",
                  fontSize: "var(--small-size)",
                  fontWeight: "500",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) =>
                  e.currentTarget.style.background = "var(--color-danger-dark)"}
                onMouseLeave={(e) =>
                  e.currentTarget.style.background = "var(--color-danger)"}
              >
                Delete
              </button>
              <button
                onClick={cancelDelete}
                class="flex-1 py-2 px-4 rounded-lg"
                style={{
                  background: "rgba(0, 0, 0, 0.05)",
                  color: "var(--color-text)",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  fontSize: "var(--small-size)",
                  fontWeight: "500",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) =>
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.08)"}
                onMouseLeave={(e) =>
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)"}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
