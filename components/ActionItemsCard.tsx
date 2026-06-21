/**
 * ActionItemsCard Component
 * Manages and displays action items with full CRUD, drag-and-drop, and sorting
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { usePointerSortable } from "@utils/usePointerSortable.ts";
import { hapticBump, hapticTap } from "@utils/haptics.ts";

interface ActionItem {
  id: string;
  conversation_id: string;
  description: string;
  assignee: string | null;
  due_date: string | null;
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
}

interface ActionItemsCardProps {
  actionItems: ActionItem[];
  onUpdateItems: (items: ActionItem[]) => void;
}

// Static — no need to recreate on every render
const COMMON_ASSIGNEES = [
  "Me",
  "Team Lead",
  "Developer",
  "Designer",
  "QA",
  "Product Manager",
  "Client",
];

/**
 * Parse a YYYY-MM-DD date string at local midnight to avoid UTC offset shifting
 * the displayed day (e.g. "2025-12-01" showing as "Nov 30" in UTC-5 timezones).
 */
function formatFriendlyDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day); // local midnight, no TZ shift
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export default function ActionItemsCard(
  { actionItems, onUpdateItems }: ActionItemsCardProps,
) {
  // State
  const visibleItems = useSignal<ActionItem[]>(actionItems);
  const sortMode = useSignal<"manual" | "assignee" | "date">("manual");

  // Pointer-based drag-to-reorder (mouse + touch + pen). Declared here, above
  // the sortedActionItems computed that reads previewOrder, so there's no
  // temporal-dead-zone on previewOrder. publishItems is hoisted, so the
  // forward reference in onReorder is safe. Only pending items in manual sort
  // are reorderable; the new order is spliced back (pending then completed).
  const {
    draggingId,
    settlingId,
    previewOrder,
    onHandlePointerDown,
    onRowPointerDown,
  } = usePointerSortable({
    orderedIds: () =>
      visibleItems.value
        .filter((item) => item.status === "pending")
        .map((item) => item.id),
    onReorder: (orderedPendingIds) => {
      const byId = new Map(visibleItems.value.map((item) => [item.id, item]));
      const reorderedPending = orderedPendingIds
        .map((id) => byId.get(id))
        .filter((item): item is ActionItem => Boolean(item));
      const completed = visibleItems.value.filter(
        (item) => item.status === "completed",
      );
      publishItems([...reorderedPending, ...completed]);
    },
  });
  const editingItemId = useSignal<string | null>(null);
  const editingDescription = useSignal("");
  const editingAssignee = useSignal("");
  const editingDueDate = useSignal("");
  const showAddModal = useSignal(false);
  const newItemDescription = useSignal("");
  const newItemAssignee = useSignal("");
  const newItemDueDate = useSignal("");
  const searchQuery = useSignal("");
  const showAssigneeDropdown = useSignal(false);
  const activeAssigneeDropdown = useSignal<string | null>(null);
  const confirmDeleteItemId = useSignal<string | null>(null);

  // Refs
  const dropdownTimeoutRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dropdownSelectedIndex = useSignal(0);
  const selectedItemIndex = useSignal<number>(-1);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Arrow key handler ref — always points to the current closure so the effect
  // only registers once but never goes stale.
  const arrowKeyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Cleanup dropdown timeout on unmount
  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current !== null) {
        clearTimeout(dropdownTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    visibleItems.value = actionItems;
  }, [actionItems]);

  // Click outside to close item-level assignee dropdown.
  // Store the timeout so we can cancel it on cleanup and avoid a listener leak.
  useEffect(() => {
    if (activeAssigneeDropdown.value === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".assignee-dropdown-container")) {
        activeAssigneeDropdown.value = null;
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeAssigneeDropdown.value]);

  // ESC closes the add modal
  useEffect(() => {
    if (!showAddModal.value) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        showAddModal.value = false;
        newItemDescription.value = "";
        newItemAssignee.value = "";
        newItemDueDate.value = "";
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showAddModal.value]);

  // Focus trap inside add modal
  useEffect(() => {
    if (!showAddModal.value || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    }

    modal.addEventListener("keydown", handleTab);
    firstElement?.focus();
    return () => modal.removeEventListener("keydown", handleTab);
  }, [showAddModal.value]);

  // Filter and sort action items
  const sortedActionItems = useComputed(() => {
    let filteredItems = [...visibleItems.value];

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      filteredItems = filteredItems.filter((item) =>
        item.description.toLowerCase().includes(query) ||
        item.assignee?.toLowerCase().includes(query) ||
        item.due_date?.includes(query)
      );
    }

    const completed = filteredItems.filter((item) =>
      item.status === "completed"
    );
    const pending = filteredItems.filter((item) => item.status === "pending");

    const sortGroup = (items: ActionItem[]) => {
      if (sortMode.value === "assignee") {
        return [...items].sort((a, b) => {
          if (!a.assignee && !b.assignee) return 0;
          if (!a.assignee) return 1;
          if (!b.assignee) return -1;
          return a.assignee.localeCompare(b.assignee);
        });
      } else if (sortMode.value === "date") {
        return [...items].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        });
      }
      return items;
    };

    // While dragging, render the pending group in the live preview order so
    // Preact owns the DOM (the sortable hook never moves nodes by hand).
    const preview = previewOrder.value;
    let orderedPending = sortGroup(pending);
    if (preview) {
      const byId = new Map(pending.map((item) => [item.id, item]));
      const fromPreview = preview
        .map((id) => byId.get(id))
        .filter((item): item is ActionItem => Boolean(item));
      // append any pending items not in the preview (safety)
      const seen = new Set(preview);
      const rest = pending.filter((item) => !seen.has(item.id));
      orderedPending = [...fromPreview, ...rest];
    }

    return [...orderedPending, ...sortGroup(completed)];
  });

  // Reset keyboard selection when list length changes
  useEffect(() => {
    selectedItemIndex.value = -1;
  }, [sortedActionItems.value.length]);

  // Keep the arrow key handler ref current on every render — this avoids the
  // stale closure problem without re-registering the event listener.
  arrowKeyHandlerRef.current = (e: KeyboardEvent) => {
    if (sortedActionItems.value.length === 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedItemIndex.value = Math.min(
        selectedItemIndex.value + 1,
        sortedActionItems.value.length - 1,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedItemIndex.value = Math.max(selectedItemIndex.value - 1, 0);
    } else if (e.key === "Enter" && selectedItemIndex.value >= 0) {
      e.preventDefault();
      const item = sortedActionItems.value[selectedItemIndex.value];
      if (item) toggleActionItem(item.id);
    }
  };

  // Register the arrow key listener once — the ref keeps the handler current
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;
    const handler = (e: KeyboardEvent) => arrowKeyHandlerRef.current(e);
    container.addEventListener("keydown", handler);
    return () => container.removeEventListener("keydown", handler);
  }, []);

  // ===================================================================
  // HANDLERS
  // ===================================================================

  function publishItems(items: ActionItem[]) {
    visibleItems.value = items;
    onUpdateItems(items);
  }

  function toggleActionItem(itemId: string) {
    const target = visibleItems.value.find((item) => item.id === itemId);
    // A firmer buzz when completing, a light tick when un-completing.
    if (target?.status === "completed") hapticTap();
    else hapticBump();
    const updatedItems = visibleItems.value.map((item) =>
      item.id === itemId
        ? {
          ...item,
          status:
            (item.status === "completed"
              ? "pending"
              : "completed") as ActionItem["status"],
        }
        : item
    );
    publishItems(updatedItems);
  }

  function startEditing(
    itemId: string,
    currentDescription: string,
    currentAssignee: string | null,
    currentDueDate: string | null,
  ) {
    // Discard any in-progress edit before starting a new one
    if (editingItemId.value && editingItemId.value !== itemId) {
      cancelEdit();
    }
    editingItemId.value = itemId;
    editingDescription.value = currentDescription;
    editingAssignee.value = currentAssignee || "";
    editingDueDate.value = currentDueDate || "";
  }

  function saveEdit() {
    if (!editingItemId.value) return;
    if (!editingDescription.value.trim()) return; // don't save empty descriptions

    const updatedItems = visibleItems.value.map((item) =>
      item.id === editingItemId.value
        ? {
          ...item,
          description: editingDescription.value.trim(),
          assignee: editingAssignee.value.trim() || null,
          due_date: editingDueDate.value || null,
          updated_at: new Date().toISOString(),
        }
        : item
    );

    publishItems(updatedItems);
    cancelEdit();
  }

  function cancelEdit() {
    editingItemId.value = null;
    editingDescription.value = "";
    editingAssignee.value = "";
    editingDueDate.value = "";
  }

  function updateAssignee(itemId: string, assignee: string | null) {
    const updatedItems = visibleItems.value.map((item) =>
      item.id === itemId
        ? { ...item, assignee, updated_at: new Date().toISOString() }
        : item
    );
    publishItems(updatedItems);
  }

  function updateDueDate(itemId: string, due_date: string | null) {
    const updatedItems = visibleItems.value.map((item) =>
      item.id === itemId
        ? { ...item, due_date, updated_at: new Date().toISOString() }
        : item
    );
    publishItems(updatedItems);
  }

  function requestDeleteItem(itemId: string) {
    confirmDeleteItemId.value = itemId;
  }

  function confirmDelete() {
    if (!confirmDeleteItemId.value) return;
    publishItems(
      visibleItems.value.filter((item) =>
        item.id !== confirmDeleteItemId.value
      ),
    );
    confirmDeleteItemId.value = null;
  }

  function addNewItem() {
    if (!newItemDescription.value.trim()) return;

    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      conversation_id: visibleItems.value[0]?.conversation_id || "",
      description: newItemDescription.value.trim(),
      assignee: newItemAssignee.value.trim() || null,
      due_date: newItemDueDate.value || null,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    publishItems([...visibleItems.value, newItem]);
    newItemDescription.value = "";
    newItemAssignee.value = "";
    newItemDueDate.value = "";
    showAddModal.value = false;
  }

  function cycleSortMode() {
    const modes: Array<"manual" | "assignee" | "date"> = [
      "manual",
      "assignee",
      "date",
    ];
    const currentIndex = modes.indexOf(sortMode.value);
    sortMode.value = modes[(currentIndex + 1) % modes.length];
  }

  // ===================================================================
  // RENDER
  // ===================================================================

  return (
    <>
      <div class="w-full">
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>Action Items</h3>
            <div class="flex gap-2">
              <button
                onClick={cycleSortMode}
                class="px-2 py-1 rounded cursor-pointer action-header-btn"
                style={{
                  background: "var(--surface-cream)",
                  fontSize: "var(--tiny-size)",
                  transition: "var(--transition-fast)",
                }}
                title={sortMode.value === "manual"
                  ? "Sort: Manual (drag to reorder)"
                  : sortMode.value === "assignee"
                  ? "Sort: By assignee"
                  : "Sort: By due date"}
              >
                {sortMode.value === "manual"
                  ? "🤚"
                  : sortMode.value === "assignee"
                  ? "👤"
                  : "📅"}
              </button>
              <button
                onClick={() => showAddModal.value = true}
                class="px-2 py-1 rounded cursor-pointer action-header-btn"
                style={{
                  background: "var(--surface-cream)",
                  fontSize: "var(--tiny-size)",
                  transition: "var(--transition-fast)",
                }}
                title="Add new item"
              >
                ➕
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div
            class="action-items-search"
            style={{ padding: "0.75rem 1rem 0.25rem" }}
          >
            <input
              type="text"
              value={searchQuery.value}
              onInput={(e) =>
                searchQuery.value = (e.target as HTMLInputElement).value}
              placeholder="Search"
              class="w-full rounded px-2 py-1 focus:outline-none"
              style={{
                fontSize: "var(--tiny-size)",
                border: "2px solid var(--color-border)",
                transition: "var(--transition-fast)",
              }}
            />
            {sortMode.value === "manual" && (
              <p
                class="text-xs mt-1 italic"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Drag to reorder
              </p>
            )}
          </div>

          {/* List */}
          <div
            ref={listContainerRef}
            tabIndex={0}
            class="action-items-scroll max-h-96 overflow-y-auto focus:outline-none"
            style={{
              padding: "0.5rem var(--card-padding) var(--card-padding)",
            }}
          >
            {sortedActionItems.value.length === 0
              ? (
                <div class="empty-state">
                  <div class="empty-state-icon">✓</div>
                  <div class="empty-state-text">All clear</div>
                </div>
              )
              : (
                <div class="space-y-3">
                  {sortedActionItems.value.map((item, index) => {
                    const isDragging = draggingId.value === item.id;
                    const isSettling = settlingId.value === item.id;
                    const canDrag = item.status === "pending" &&
                      sortMode.value === "manual";
                    const isSelected = selectedItemIndex.value === index;

                    return (
                      <div
                        key={item.id}
                        data-sortable-id={canDrag ? item.id : undefined}
                        onPointerDown={(e) =>
                          canDrag && onRowPointerDown(e, item.id)}
                        onClick={() => selectedItemIndex.value = index}
                        class={`action-item-card relative p-4 rounded-lg transition-all${
                          item.status === "completed" ? " is-completed" : ""
                        }${isSelected ? " is-selected" : ""}${
                          isDragging ? " is-dragging" : ""
                        }${isSettling ? " is-settling" : ""}`}
                        style={{
                          background: "var(--surface-cream)",
                          border: `2px solid ${
                            isSelected
                              ? "var(--color-accent)"
                              : "var(--color-border)"
                          }`,
                          boxShadow: item.status === "completed"
                            ? "none"
                            : "2px 2px 0 rgba(0,0,0,0.1)",
                          // touch-action none on draggable rows lets long-press
                          // grab take over from scrolling without the browser
                          // hijacking the gesture.
                          touchAction: canDrag ? "pan-y" : undefined,
                          outline: isSelected
                            ? `2px solid var(--color-accent)`
                            : "none",
                          outlineOffset: "2px",
                        }}
                      >
                        <div class="grid grid-cols-[auto_auto_1fr] gap-3 items-start">
                          {/* Drag Handle (mouse/pen: press to grab; touch: long-press the row) */}
                          <div class="flex items-center pt-1">
                            {canDrag
                              ? (
                                <i
                                  class="fa fa-grip-vertical drag-handle"
                                  style={{
                                    color: "var(--color-text-secondary)",
                                    fontSize: "var(--heading-size)",
                                    cursor: "grab",
                                    touchAction: "none",
                                  }}
                                  title="Drag to reorder"
                                  onPointerDown={(e) =>
                                    onHandlePointerDown(e, item.id)}
                                >
                                </i>
                              )
                              : <div style={{ width: "16px" }}></div>}
                          </div>

                          {/* Checkbox */}
                          <div class="flex items-center pt-1">
                            <button
                              type="button"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleActionItem(item.id);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (
                                  event.key !== "Enter" && event.key !== " "
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                toggleActionItem(item.id);
                              }}
                              class={`action-item-checkbox-button${
                                item.status === "completed" ? " is-checked" : ""
                              }`}
                              role="checkbox"
                              aria-checked={item.status === "completed"}
                              aria-label={`Mark ${item.description} as ${
                                item.status === "completed"
                                  ? "pending"
                                  : "completed"
                              }`}
                            >
                              {item.status === "completed" && (
                                <i class="fa fa-check" aria-hidden="true"></i>
                              )}
                            </button>
                          </div>

                          {/* Content */}
                          <div class="flex flex-col gap-3">
                            {/* Description */}
                            {editingItemId.value === item.id
                              ? (
                                <div class="space-y-2">
                                  <textarea
                                    value={editingDescription.value}
                                    onInput={(e) =>
                                      editingDescription.value =
                                        (e.target as HTMLTextAreaElement).value}
                                    onKeyDown={(e) => {
                                      if (
                                        (e.ctrlKey || e.metaKey) &&
                                        e.key === "Enter"
                                      ) {
                                        e.preventDefault();
                                        saveEdit();
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        cancelEdit();
                                      }
                                    }}
                                    class="w-full rounded px-2 py-1 text-sm"
                                    style={{
                                      border: "2px solid var(--color-border)",
                                      minHeight: "60px",
                                    }}
                                    autoFocus
                                  />
                                  <p
                                    class="text-xs italic"
                                    style={{
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    Ctrl+Enter to save · Esc to cancel
                                  </p>
                                  <div class="flex gap-2">
                                    <button
                                      onClick={saveEdit}
                                      disabled={!editingDescription.value
                                        .trim()}
                                      class="px-3 py-1 rounded text-xs font-bold text-white disabled:opacity-40"
                                      style={{
                                        background: "var(--color-accent)",
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      class="px-3 py-1 rounded text-xs font-bold"
                                      style={{
                                        border: "2px solid var(--color-border)",
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )
                              : (
                                <p
                                  class={`action-item-description leading-relaxed${
                                    item.status === "completed"
                                      ? " is-completed"
                                      : ""
                                  }`}
                                  style={{
                                    fontSize: "var(--text-size)",
                                    color: "var(--color-text)",
                                  }}
                                  onDblClick={() =>
                                    startEditing(
                                      item.id,
                                      item.description,
                                      item.assignee,
                                      item.due_date,
                                    )}
                                  title="Double-click to edit"
                                >
                                  {item.description}
                                </p>
                              )}

                            {/* Metadata row - assignee & due date */}
                            <div class="action-item-meta flex items-center gap-3 flex-wrap">
                              {/* Assignee selector */}
                              <div class="relative assignee-dropdown-container">
                                <button
                                  onClick={() =>
                                    activeAssigneeDropdown.value =
                                      activeAssigneeDropdown.value === item.id
                                        ? null
                                        : item.id}
                                  class="action-item-chip action-item-chip-btn flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors"
                                  style={{
                                    border: "2px solid var(--color-border)",
                                  }}
                                >
                                  <i class="fa fa-user text-xs"></i>
                                  <span
                                    style={{
                                      color: item.assignee
                                        ? "var(--color-text)"
                                        : "var(--color-text-secondary)",
                                    }}
                                  >
                                    {item.assignee || "None"}
                                  </span>
                                </button>
                                {activeAssigneeDropdown.value === item.id && (
                                  <div
                                    class="absolute z-10 mt-1 rounded shadow-lg"
                                    style={{
                                      background: "var(--surface-cream)",
                                      border: "2px solid var(--color-border)",
                                      minWidth: "150px",
                                    }}
                                  >
                                    <button
                                      onClick={() => {
                                        updateAssignee(item.id, null);
                                        activeAssigneeDropdown.value = null;
                                      }}
                                      class="w-full text-left px-3 py-2 text-xs action-dropdown-option"
                                      style={{
                                        borderBottom:
                                          "1px solid var(--color-border)",
                                      }}
                                    >
                                      None
                                    </button>
                                    {COMMON_ASSIGNEES.map((assignee) => (
                                      <button
                                        key={assignee}
                                        onClick={() => {
                                          updateAssignee(item.id, assignee);
                                          activeAssigneeDropdown.value = null;
                                        }}
                                        class="w-full text-left px-3 py-2 text-xs action-dropdown-option"
                                        style={{
                                          borderBottom:
                                            "1px solid var(--color-border)",
                                          background: item.assignee === assignee
                                            ? "var(--color-accent)"
                                            : "transparent",
                                          color: item.assignee === assignee
                                            ? "white"
                                            : "var(--color-text)",
                                        }}
                                      >
                                        {assignee}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Due date selector */}
                              <div class="relative">
                                <input
                                  type="date"
                                  id={`date-${item.id}`}
                                  value={item.due_date || ""}
                                  onChange={(e) =>
                                    updateDueDate(
                                      item.id,
                                      (e.target as HTMLInputElement).value ||
                                        null,
                                    )}
                                  class="absolute opacity-0 pointer-events-none"
                                />
                                <button
                                  onClick={() => {
                                    const input = document.getElementById(
                                      `date-${item.id}`,
                                    ) as HTMLInputElement | null;
                                    if (input && "showPicker" in input) {
                                      (input as any).showPicker();
                                    }
                                  }}
                                  class="action-item-chip action-item-chip-btn flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors"
                                  style={{
                                    border: "2px solid var(--color-border)",
                                  }}
                                >
                                  <i class="fa fa-calendar text-xs"></i>
                                  <span
                                    style={{
                                      color: item.due_date
                                        ? "var(--color-text)"
                                        : "var(--color-text-secondary)",
                                    }}
                                  >
                                    {item.due_date
                                      ? formatFriendlyDate(item.due_date)
                                      : "None"}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={() => requestDeleteItem(item.id)}
                          class="action-item-delete action-item-delete-btn absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                          title="Delete"
                        >
                          <i class="fa fa-times text-xs"></i>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteItemId.value && (
        <div
          class="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(30,23,20,0.5)" }}
        >
          <div
            class="dashboard-card max-w-sm w-full mx-4"
            style={{ padding: "var(--card-padding)" }}
          >
            <h3
              style={{
                fontSize: "var(--heading-size)",
                fontWeight: "var(--heading-weight)",
                color: "var(--color-text)",
                marginBottom: "0.5rem",
              }}
            >
              Delete this item?
            </h3>
            <p
              style={{
                fontSize: "var(--small-size)",
                color: "var(--color-text-secondary)",
                marginBottom: "1.25rem",
                lineHeight: "var(--line-height)",
              }}
            >
              {visibleItems.value.find((i) =>
                i.id === confirmDeleteItemId.value
              )
                ?.description}
            </p>
            <div class="flex gap-2">
              <button
                onClick={confirmDelete}
                class="flex-1 py-2 px-4 rounded font-bold text-white"
                style={{
                  background: "var(--color-danger)",
                  border: "none",
                  fontSize: "var(--small-size)",
                  transition: "var(--transition-fast)",
                }}
              >
                Delete
              </button>
              <button
                onClick={() => confirmDeleteItemId.value = null}
                class="flex-1 py-2 px-4 rounded"
                style={{
                  border: "2px solid var(--color-border)",
                  fontSize: "var(--small-size)",
                  transition: "var(--transition-fast)",
                  color: "var(--color-text)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showAddModal.value && (
        <div
          class="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(30,23,20,0.5)" }}
        >
          <div
            ref={modalRef}
            class="dashboard-card max-w-md w-full mx-4"
            style={{ padding: "var(--card-padding)" }}
          >
            <h3
              style={{
                fontSize: "calc(var(--heading-size) * 1.2)",
                fontWeight: "var(--heading-weight)",
                color: "var(--color-text)",
                marginBottom: "1rem",
              }}
            >
              Add Item
            </h3>

            <div class="space-y-3">
              <div>
                <label
                  style={{
                    fontSize: "var(--text-size)",
                    fontWeight: "600",
                    color: "var(--color-text)",
                  }}
                >
                  Description *
                </label>
                <input
                  type="text"
                  value={newItemDescription.value}
                  onInput={(e) =>
                    newItemDescription.value =
                      (e.target as HTMLInputElement).value}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newItemDescription.value.trim()) {
                      e.preventDefault();
                      addNewItem();
                    }
                  }}
                  placeholder="What's the move?"
                  class="w-full rounded px-3 py-2"
                  style={{
                    fontSize: "var(--text-size)",
                    border: "2px solid var(--color-border)",
                  }}
                  autoFocus
                />
              </div>

              <div class="relative">
                <label
                  style={{
                    fontSize: "var(--text-size)",
                    fontWeight: "600",
                    color: "var(--color-text)",
                  }}
                >
                  Assignee
                </label>
                <div class="relative">
                  <input
                    type="text"
                    value={newItemAssignee.value}
                    onInput={(e) =>
                      newItemAssignee.value =
                        (e.target as HTMLInputElement).value}
                    onFocus={() => {
                      showAssigneeDropdown.value = true;
                      dropdownSelectedIndex.value = 0;
                    }}
                    onBlur={() => {
                      if (dropdownTimeoutRef.current !== null) {
                        clearTimeout(dropdownTimeoutRef.current);
                      }
                      dropdownTimeoutRef.current = setTimeout(() => {
                        showAssigneeDropdown.value = false;
                        dropdownTimeoutRef.current = null;
                      }, 200) as unknown as number;
                    }}
                    onKeyDown={(e) => {
                      if (!showAssigneeDropdown.value) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        dropdownSelectedIndex.value = Math.min(
                          dropdownSelectedIndex.value + 1,
                          COMMON_ASSIGNEES.length - 1,
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        dropdownSelectedIndex.value = Math.max(
                          dropdownSelectedIndex.value - 1,
                          0,
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        newItemAssignee.value =
                          COMMON_ASSIGNEES[dropdownSelectedIndex.value];
                        showAssigneeDropdown.value = false;
                      }
                    }}
                    placeholder="Who's on it?"
                    class="w-full rounded px-3 py-2 pr-8"
                    style={{
                      fontSize: "var(--text-size)",
                      border: "2px solid var(--color-border)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      showAssigneeDropdown.value = !showAssigneeDropdown.value}
                    class="absolute right-2 top-1/2 transform -translate-y-1/2 action-chevron-btn"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    ▼
                  </button>
                </div>
                {showAssigneeDropdown.value && (
                  <div
                    class="absolute z-10 w-full mt-1 rounded shadow-lg max-h-40 overflow-y-auto"
                    style={{
                      background: "var(--surface-cream)",
                      border: "2px solid var(--border-cream-medium)",
                    }}
                  >
                    {COMMON_ASSIGNEES.map((assignee, index) => (
                      <button
                        type="button"
                        key={assignee}
                        onClick={() => {
                          newItemAssignee.value = assignee;
                          showAssigneeDropdown.value = false;
                        }}
                        class="w-full text-left px-3 py-2 text-sm action-dropdown-option last:border-none"
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          background: index === dropdownSelectedIndex.value
                            ? "var(--color-accent)"
                            : "transparent",
                          color: index === dropdownSelectedIndex.value
                            ? "white"
                            : "var(--color-text)",
                        }}
                      >
                        {assignee}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    fontSize: "var(--text-size)",
                    fontWeight: "600",
                    color: "var(--color-text)",
                  }}
                >
                  Due Date
                </label>
                <input
                  type="date"
                  value={newItemDueDate.value}
                  onInput={(e) =>
                    newItemDueDate.value = (e.target as HTMLInputElement).value}
                  class="w-full rounded px-3 py-2"
                  style={{
                    fontSize: "var(--text-size)",
                    border: "2px solid var(--color-border)",
                  }}
                />
              </div>
            </div>

            <div class="flex gap-2 mt-6">
              <button
                onClick={addNewItem}
                disabled={!newItemDescription.value.trim()}
                class="flex-1 py-2 px-4 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--color-accent)",
                  color: "white",
                  border: `2px solid var(--color-border)`,
                  fontSize: "var(--text-size)",
                  transition: "var(--transition-fast)",
                }}
              >
                Add Item
              </button>
              <button
                onClick={() => {
                  showAddModal.value = false;
                  newItemDescription.value = "";
                  newItemAssignee.value = "";
                  newItemDueDate.value = "";
                }}
                class="px-4 py-2 rounded action-header-btn"
                style={{
                  border: `2px solid var(--color-border)`,
                  fontSize: "var(--text-size)",
                  transition: "var(--transition-fast)",
                  color: "var(--color-text)",
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
