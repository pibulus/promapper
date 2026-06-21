/**
 * ActionItemsCard Component
 * Manages and displays action items with full CRUD, drag-and-drop, and sorting
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { usePointerSortable } from "@utils/usePointerSortable.ts";
import { hapticBump, hapticTap } from "@utils/haptics.ts";
import {
  soundBloom,
  soundCheckoff,
  soundSettle,
  soundTick,
  soundToggle,
} from "@utils/sound.ts";
import { showUndoToast } from "@utils/toast.ts";
import { canUndo, undoLastMutation } from "@signals/conversationStore.ts";
import Modal from "./Modal.tsx";

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
  conversationId: string;
  onUpdateItems: (items: ActionItem[]) => void;
}

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

// Compute a local YYYY-MM-DD for today + offsetDays, no UTC shift
function localDateISO(offsetDays: number): string {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export default function ActionItemsCard(
  { actionItems, conversationId, onUpdateItems }: ActionItemsCardProps,
) {
  // State
  const visibleItems = useSignal<ActionItem[]>(actionItems);
  const sortMode = useSignal<"manual" | "assignee" | "date">("manual");
  // Filters: reduce the list (sort only reorders). Two booleans cover ~90% of
  // "what's mine / what's still open" without a heavy filter UI.
  const filterMine = useSignal(false);
  const hideDone = useSignal(false);

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
      soundSettle(); // warm thunk on drop (hook already fires the haptic)
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
  const showClearDoneConfirm = useSignal(false);
  const quickAddText = useSignal("");
  // Transient "just checked off" id — drives a one-shot checkbox pop. Kept
  // separate from the persistent completed state so it never replays on
  // re-render (scroll/filter/append); cleared after the animation.
  const poppingId = useSignal<string | null>(null);

  // Refs
  const dropdownTimeoutRef = useRef<number | null>(null);
  const dropdownSelectedIndex = useSignal(0);
  const selectedItemIndex = useSignal<number>(-1);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);

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

  // Header progress count: "N of M done" (the emotional payoff of a list).
  const progress = useComputed(() => {
    const total = visibleItems.value.length;
    const done = visibleItems.value.filter((i) => i.status === "completed")
      .length;
    return { total, done };
  });

  const sortLabel = useComputed(() =>
    sortMode.value === "manual"
      ? "Manual"
      : sortMode.value === "assignee"
      ? "By person"
      : "By date"
  );

  // Self-populating assignee suggestions from existing items + "Me" always first
  const assigneeSuggestions = useComputed(() => {
    const existing = [
      ...new Set(
        visibleItems.value
          .map((i) => i.assignee)
          .filter((a): a is string => Boolean(a) && a !== "Me"),
      ),
    ];
    return ["Me", ...existing];
  });

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

    if (filterMine.value) {
      filteredItems = filteredItems.filter((item) => item.assignee === "Me");
    }
    if (hideDone.value) {
      filteredItems = filteredItems.filter((item) =>
        item.status !== "completed"
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
    } else if (
      (e.key === "e" || e.key === "F2") && selectedItemIndex.value >= 0
    ) {
      e.preventDefault();
      const item = sortedActionItems.value[selectedItemIndex.value];
      if (item) {
        startEditing(item.id, item.description, item.assignee, item.due_date);
      }
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
    // Completing is the rewarding beat (warm chime + firm buzz); un-completing
    // is a quiet tick.
    if (target?.status === "completed") {
      hapticTap();
      soundTick();
    } else {
      hapticBump();
      // Escalation: if THIS checkoff finishes the whole list, play the warmer
      // bloom cue instead of the per-item tick — a little payoff for clearing it.
      const wasLast = visibleItems.value.length > 1 &&
        visibleItems.value.every((i) =>
          i.id === itemId || i.status === "completed"
        );
      if (wasLast) soundBloom();
      else soundCheckoff();
      // One-shot pop on the moment of completion (the rewarding beat).
      poppingId.value = itemId;
      setTimeout(() => {
        if (poppingId.value === itemId) poppingId.value = null;
      }, 240);
    }
    const updatedItems = visibleItems.value.map((item) => {
      if (item.id !== itemId) return item;
      // Manual toggle overrides the AI: drop ai_checked/checked_reason so a
      // later append's status reconciliation can't silently re-flip it. Stamp
      // updated_at so merge ordering treats this as the latest word.
      const { ai_checked: _ai, checked_reason: _reason, ...rest } = item as
        & ActionItem
        & { ai_checked?: boolean; checked_reason?: string };
      return {
        ...rest,
        status:
          (item.status === "completed" ? "pending" : "completed") as ActionItem[
            "status"
          ],
        updated_at: new Date().toISOString(),
      };
    });
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
    const removed = visibleItems.value.find((item) =>
      item.id === confirmDeleteItemId.value
    );
    publishItems(
      visibleItems.value.filter((item) =>
        item.id !== confirmDeleteItemId.value
      ),
    );
    confirmDeleteItemId.value = null;
    if (canUndo()) {
      const label = removed?.description?.slice(0, 40) || "item";
      showUndoToast(`Deleted "${label}"`, undoLastMutation);
    }
  }

  function addNewItem() {
    if (!newItemDescription.value.trim()) return;

    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      conversation_id: conversationId ||
        visibleItems.value[0]?.conversation_id || "",
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

  function quickAddItem(description: string) {
    if (!description.trim()) return;
    hapticTap();
    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      conversation_id: conversationId ||
        visibleItems.value[0]?.conversation_id || "",
      description: description.trim(),
      assignee: null,
      due_date: null,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    publishItems([...visibleItems.value, newItem]);
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

  // Find where completed items begin in the sorted list for "Clear done" divider
  const firstCompletedIndex = sortedActionItems.value.findIndex((i) =>
    i.status === "completed"
  );

  return (
    <>
      <div class="w-full">
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>
              Action Items
              {progress.value.total > 0 && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "var(--tiny-size)",
                    fontWeight: "500",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {progress.value.done} of {progress.value.total} done
                </span>
              )}
            </h3>
            <div class="flex gap-2">
              <button
                onClick={cycleSortMode}
                class="px-2 py-1 rounded cursor-pointer action-header-btn flex items-center gap-1"
                style={{
                  background: "var(--surface-cream)",
                  fontSize: "var(--tiny-size)",
                  transition: "var(--transition-fast)",
                }}
                aria-label={`Sort: ${sortLabel.value}. Click to change.`}
                title={`Sort: ${sortLabel.value}`}
              >
                <span aria-hidden="true">
                  {sortMode.value === "manual"
                    ? "🤚"
                    : sortMode.value === "assignee"
                    ? "👤"
                    : "📅"}
                </span>
                <span class="hidden sm:inline">{sortLabel.value}</span>
              </button>
              <button
                onClick={() => showAddModal.value = true}
                class="px-2 py-1 rounded cursor-pointer action-header-btn"
                style={{
                  background: "var(--surface-cream)",
                  fontSize: "var(--tiny-size)",
                  transition: "var(--transition-fast)",
                }}
                aria-label="Add action item"
                title="Add new item"
              >
                <span aria-hidden="true">➕</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div
            class="action-items-search"
            style={{ padding: "0.75rem var(--card-padding) 0.25rem" }}
          >
            <input
              type="text"
              value={searchQuery.value}
              onInput={(e) =>
                searchQuery.value = (e.target as HTMLInputElement).value}
              placeholder="Search"
              aria-label="Search action items"
              class="w-full rounded px-2 py-1 focus:outline-none"
              style={{
                fontSize: "var(--tiny-size)",
                border: "2px solid var(--color-border)",
                transition: "var(--transition-fast)",
              }}
            />
            {/* Filter pills — reduce the list (sort only reorders) */}
            <div class="flex gap-2 mt-2">
              <button
                onClick={() => {
                  filterMine.value = !filterMine.value;
                  soundToggle(filterMine.value);
                }}
                class="action-filter-pill"
                aria-pressed={filterMine.value}
                style={{
                  background: filterMine.value
                    ? "var(--color-accent)"
                    : "var(--surface-cream)",
                  color: filterMine.value ? "#fff" : "var(--color-text)",
                }}
              >
                Mine
              </button>
              <button
                onClick={() => {
                  hideDone.value = !hideDone.value;
                  soundToggle(hideDone.value);
                }}
                class="action-filter-pill"
                aria-pressed={hideDone.value}
                style={{
                  background: hideDone.value
                    ? "var(--color-accent)"
                    : "var(--surface-cream)",
                  color: hideDone.value ? "#fff" : "var(--color-text)",
                }}
              >
                Hide done
              </button>
            </div>
          </div>

          {/* List */}
          <div
            ref={listContainerRef}
            tabIndex={0}
            class="action-items-scroll max-h-96 overflow-y-auto focus-visible:outline-none"
            style={{
              padding: "0.5rem var(--card-padding) 0",
            }}
          >
            {sortedActionItems.value.length === 0
              ? (
                visibleItems.value.length === 0
                  ? (
                    <div class="empty-state">
                      <div class="empty-state-icon">📋</div>
                      <div class="empty-state-text">It's quiet here.</div>
                      <button
                        onClick={() => showAddModal.value = true}
                        class="action-header-btn px-3 py-1 rounded mt-2"
                        style={{
                          fontSize: "var(--small-size)",
                          border: "2px solid var(--color-border)",
                        }}
                      >
                        + Add one
                      </button>
                    </div>
                  )
                  : (
                    <div class="empty-state">
                      <div class="empty-state-icon">✓</div>
                      <div class="empty-state-text">All done</div>
                    </div>
                  )
              )
              : (
                <div class="space-y-3">
                  {sortedActionItems.value.map((item, index) => {
                    const isDragging = draggingId.value === item.id;
                    const isSettling = settlingId.value === item.id;
                    const canDrag = item.status === "pending" &&
                      sortMode.value === "manual" && !searchQuery.value;
                    const isSelected = selectedItemIndex.value === index;

                    // Overdue detection
                    const todayISO = new Date().toISOString().slice(0, 10);
                    const isOverdue = item.due_date &&
                      item.status === "pending" &&
                      item.due_date < todayISO;

                    return (
                      <>
                        {/* "Clear done" divider — shown once before the first completed item */}
                        {progress.value.done > 0 &&
                          index === firstCompletedIndex && (
                          <div class="action-done-divider">
                            <span class="action-done-rule" aria-hidden="true" />
                            <span class="card-back-label action-done-label">
                              Done · {progress.value.done}
                            </span>
                            <span class="action-done-rule" aria-hidden="true" />
                            <button
                              onClick={() => showClearDoneConfirm.value = true}
                              class="action-filter-pill"
                              style={{
                                fontSize: "var(--tiny-size)",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                        <div
                          key={item.id}
                          data-sortable-id={canDrag ? item.id : undefined}
                          onPointerDown={(e) =>
                            canDrag && onRowPointerDown(e, item.id)}
                          onClick={() => selectedItemIndex.value = index}
                          class={`action-item-card relative p-4 transition-all${
                            item.status === "completed" ? " is-completed" : ""
                          }${isSelected ? " is-selected" : ""}${
                            isDragging ? " is-dragging" : ""
                          }${isSettling ? " is-settling" : ""}`}
                          style={{
                            borderRadius: "var(--border-radius-sm)",
                            background: "var(--surface-cream)",
                            border: `2px solid ${
                              isSelected
                                ? "var(--color-accent)"
                                : "var(--color-border)"
                            }`,
                            boxShadow: item.status === "completed"
                              ? "none"
                              : "2px 2px 0 rgba(30,23,20,0.12)",
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
                                  item.status === "completed"
                                    ? " is-checked"
                                    : ""
                                }${
                                  poppingId.value === item.id
                                    ? " is-popping"
                                    : ""
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

                            {
                              /* Content — min-w-0 lets the 1fr grid track shrink
                                below its intrinsic width so the description wraps
                                instead of overflowing/clipping on narrow screens. */
                            }
                            <div class="flex flex-col gap-3 min-w-0">
                              {/* Description */}
                              {editingItemId.value === item.id
                                ? (
                                  <div class="space-y-2">
                                    <textarea
                                      value={editingDescription.value}
                                      onInput={(e) =>
                                        editingDescription.value =
                                          (e.target as HTMLTextAreaElement)
                                            .value}
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
                                      onBlur={(e) => {
                                        const related = (e as FocusEvent)
                                          .relatedTarget as
                                            | HTMLElement
                                            | null;
                                        // Don't save if focus moved to Save/Cancel buttons
                                        if (
                                          related &&
                                          related.closest(".edit-actions")
                                        ) return;
                                        if (
                                          editingDescription.value.trim()
                                        ) {
                                          saveEdit();
                                        } else {
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
                                    <div class="flex gap-2 edit-actions">
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
                                          border:
                                            "2px solid var(--color-border)",
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
                              {(!item.assignee && !item.due_date)
                                ? (
                                  <div class="action-item-meta flex items-center gap-3 flex-wrap">
                                    <button
                                      onClick={() =>
                                        startEditing(
                                          item.id,
                                          item.description,
                                          item.assignee,
                                          item.due_date,
                                        )}
                                      class="action-item-chip px-3 py-1.5 rounded text-xs"
                                      style={{
                                        border:
                                          "2px dashed var(--color-border)",
                                        color: "var(--color-text-secondary)",
                                      }}
                                    >
                                      + add details
                                    </button>
                                  </div>
                                )
                                : (
                                  <div class="action-item-meta flex items-center gap-3 flex-wrap">
                                    {/* Assignee selector */}
                                    <div class="relative assignee-dropdown-container">
                                      <button
                                        onClick={() =>
                                          activeAssigneeDropdown.value =
                                            activeAssigneeDropdown.value ===
                                                item.id
                                              ? null
                                              : item.id}
                                        class="action-item-chip action-item-chip-btn flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors"
                                        style={{
                                          border:
                                            "2px solid var(--color-border)",
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
                                      {activeAssigneeDropdown.value ===
                                          item.id && (
                                        <div
                                          class="absolute z-10 mt-1 rounded shadow-lg"
                                          style={{
                                            background: "var(--surface-cream)",
                                            border:
                                              "2px solid var(--color-border)",
                                            minWidth: "170px",
                                          }}
                                        >
                                          {/* Custom name input */}
                                          <div
                                            style={{
                                              padding: "0.375rem 0.5rem",
                                              borderBottom:
                                                "1px solid var(--color-border)",
                                            }}
                                          >
                                            <input
                                              type="text"
                                              defaultValue={item.assignee || ""}
                                              placeholder="Type a name…"
                                              class="w-full rounded px-2 py-1 text-xs"
                                              style={{
                                                border:
                                                  "2px solid var(--color-border)",
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  const val =
                                                    (e.target as HTMLInputElement)
                                                      .value.trim();
                                                  if (val) {
                                                    updateAssignee(
                                                      item.id,
                                                      val,
                                                    );
                                                  }
                                                  activeAssigneeDropdown.value =
                                                    null;
                                                } else if (
                                                  e.key === "Escape"
                                                ) {
                                                  activeAssigneeDropdown.value =
                                                    null;
                                                }
                                              }}
                                              onBlur={() => {
                                                if (
                                                  dropdownTimeoutRef.current !==
                                                    null
                                                ) {
                                                  clearTimeout(
                                                    dropdownTimeoutRef.current,
                                                  );
                                                }
                                                dropdownTimeoutRef.current =
                                                  setTimeout(() => {
                                                    activeAssigneeDropdown
                                                      .value = null;
                                                    dropdownTimeoutRef.current =
                                                      null;
                                                  }, 200) as unknown as number;
                                              }}
                                            />
                                          </div>
                                          {/* Clear option */}
                                          <button
                                            onClick={() => {
                                              updateAssignee(item.id, null);
                                              activeAssigneeDropdown.value =
                                                null;
                                            }}
                                            class="w-full text-left px-3 py-2 text-xs action-dropdown-option"
                                            style={{
                                              borderBottom:
                                                "1px solid var(--color-border)",
                                            }}
                                          >
                                            None
                                          </button>
                                          {/* Suggestions */}
                                          {assigneeSuggestions.value.map(
                                            (assignee) => (
                                              <button
                                                key={assignee}
                                                onClick={() => {
                                                  updateAssignee(
                                                    item.id,
                                                    assignee,
                                                  );
                                                  activeAssigneeDropdown.value =
                                                    null;
                                                }}
                                                class="w-full text-left px-3 py-2 text-xs action-dropdown-option"
                                                style={{
                                                  borderBottom:
                                                    "1px solid var(--color-border)",
                                                  background:
                                                    item.assignee === assignee
                                                      ? "var(--color-accent)"
                                                      : "transparent",
                                                  color:
                                                    item.assignee === assignee
                                                      ? "white"
                                                      : "var(--color-text)",
                                                }}
                                              >
                                                {assignee}
                                              </button>
                                            ),
                                          )}
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
                                            (e.target as HTMLInputElement)
                                              .value || null,
                                          )}
                                        class="absolute opacity-0 pointer-events-none"
                                      />
                                      <button
                                        onClick={() => {
                                          const input = document.getElementById(
                                            `date-${item.id}`,
                                          ) as HTMLInputElement | null;
                                          try {
                                            if (
                                              input && "showPicker" in input
                                            ) {
                                              (input as any).showPicker();
                                            } else if (input) {
                                              input.focus();
                                              input.click();
                                            }
                                          } catch {
                                            if (input) {
                                              input.focus();
                                              input.click();
                                            }
                                          }
                                        }}
                                        class="action-item-chip action-item-chip-btn flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors"
                                        style={{
                                          border:
                                            "2px solid var(--color-border)",
                                        }}
                                      >
                                        <i class="fa fa-calendar text-xs">
                                        </i>
                                        <span
                                          class={isOverdue ? "is-overdue" : ""}
                                          style={{
                                            color: isOverdue
                                              ? "var(--soft-brown)"
                                              : item.due_date
                                              ? "var(--color-text)"
                                              : "var(--color-text-secondary)",
                                            fontWeight: isOverdue
                                              ? "700"
                                              : "400",
                                          }}
                                        >
                                          {item.due_date
                                            ? formatFriendlyDate(item.due_date)
                                            : "None"}
                                        </span>
                                      </button>
                                      {
                                        /* Date presets — quiet until the row is
                                          hovered/focused (always-on for touch),
                                          so rows aren't crammed with editor UI. */
                                      }
                                      <div
                                        class="action-item-date-presets flex gap-1 mt-1 flex-wrap"
                                        style={{ fontSize: "var(--tiny-size)" }}
                                      >
                                        <button
                                          onClick={() =>
                                            updateDueDate(
                                              item.id,
                                              localDateISO(0),
                                            )}
                                          class="action-filter-pill"
                                          style={{
                                            padding: "0.1rem 0.45rem",
                                            fontSize: "var(--tiny-size)",
                                          }}
                                        >
                                          Today
                                        </button>
                                        <button
                                          onClick={() =>
                                            updateDueDate(
                                              item.id,
                                              localDateISO(1),
                                            )}
                                          class="action-filter-pill"
                                          style={{
                                            padding: "0.1rem 0.45rem",
                                            fontSize: "var(--tiny-size)",
                                          }}
                                        >
                                          Tmrw
                                        </button>
                                        {item.due_date && (
                                          <button
                                            onClick={() =>
                                              updateDueDate(item.id, null)}
                                            class="action-filter-pill is-danger"
                                            style={{
                                              padding: "0.1rem 0.45rem",
                                              fontSize: "var(--tiny-size)",
                                            }}
                                          >
                                            Clear
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Edit button — hover-reveal on desktop, always visible on touch */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(
                                item.id,
                                item.description,
                                item.assignee,
                                item.due_date,
                              );
                            }}
                            class="action-item-edit-btn absolute top-2 right-9 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                            aria-label={`Edit "${item.description}"`}
                            title="Edit"
                          >
                            <i class="fa fa-pencil text-xs" aria-hidden="true">
                            </i>
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => requestDeleteItem(item.id)}
                            class="action-item-delete action-item-delete-btn absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                            aria-label={`Delete "${item.description}"`}
                            title="Delete"
                          >
                            <i class="fa fa-times text-xs" aria-hidden="true">
                            </i>
                          </button>
                        </div>
                      </>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Quick-add bar */}
          <div
            style={{
              padding: "0.5rem var(--card-padding) var(--card-padding)",
            }}
          >
            <input
              ref={quickAddRef}
              type="text"
              value={quickAddText.value}
              onInput={(e) =>
                quickAddText.value = (e.target as HTMLInputElement).value}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (quickAddText.value.trim()) {
                    quickAddItem(quickAddText.value);
                    quickAddText.value = "";
                    (e.target as HTMLInputElement).value = "";
                    quickAddRef.current?.focus();
                  }
                }
              }}
              placeholder="Add a task…"
              aria-label="Quick add task"
              class="action-quick-add w-full rounded px-3 py-2"
              style={{
                fontSize: "var(--small-size)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!confirmDeleteItemId.value}
        onClose={() => confirmDeleteItemId.value = null}
        titleId="delete-item-modal-title"
        panelClass="max-w-sm"
      >
        <h3
          id="delete-item-modal-title"
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
          {visibleItems.value.find((i) => i.id === confirmDeleteItemId.value)
            ?.description}
        </p>
        <div class="flex gap-2">
          <button
            onClick={confirmDelete}
            class="flex-1 py-2 px-4 rounded font-bold text-white"
            style={{
              background: "var(--soft-black)",
              border: "2px solid var(--border-cream-strong)",
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
      </Modal>

      {/* Clear Done Confirmation Modal */}
      <Modal
        open={showClearDoneConfirm.value}
        onClose={() => showClearDoneConfirm.value = false}
        titleId="clear-done-modal-title"
        panelClass="max-w-sm"
      >
        <h3
          id="clear-done-modal-title"
          style={{
            fontSize: "var(--heading-size)",
            fontWeight: "var(--heading-weight)",
            color: "var(--color-text)",
            marginBottom: "0.5rem",
          }}
        >
          Clear {progress.value.done} completed item
          {progress.value.done !== 1 ? "s" : ""}?
        </h3>
        <p
          style={{
            fontSize: "var(--small-size)",
            color: "var(--color-text-secondary)",
            marginBottom: "1.25rem",
            lineHeight: "var(--line-height)",
          }}
        >
          This will remove all completed items from the list. This cannot be
          undone.
        </p>
        <div class="flex gap-2">
          <button
            onClick={() => {
              const clearedCount =
                visibleItems.value.filter((i) => i.status === "completed")
                  .length;
              publishItems(
                visibleItems.value.filter((i) => i.status !== "completed"),
              );
              showClearDoneConfirm.value = false;
              if (canUndo()) {
                showUndoToast(
                  `Cleared ${clearedCount} done`,
                  undoLastMutation,
                );
              }
            }}
            class="flex-1 py-2 px-4 rounded font-bold text-white"
            style={{
              background: "var(--soft-black)",
              border: "2px solid var(--border-cream-strong)",
              fontSize: "var(--small-size)",
              transition: "var(--transition-fast)",
            }}
          >
            Clear done
          </button>
          <button
            onClick={() => showClearDoneConfirm.value = false}
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
      </Modal>

      {/* Add New Item Modal */}
      <Modal
        open={showAddModal.value}
        onClose={() => {
          showAddModal.value = false;
          newItemDescription.value = "";
          newItemAssignee.value = "";
          newItemDueDate.value = "";
        }}
        titleId="add-item-modal-title"
      >
        <h3
          id="add-item-modal-title"
          style={{
            fontSize: "var(--font-size-xl)",
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
              htmlFor="new-item-description"
              style={{
                fontSize: "var(--text-size)",
                fontWeight: "600",
                color: "var(--color-text)",
              }}
            >
              Description *
            </label>
            <input
              id="new-item-description"
              type="text"
              value={newItemDescription.value}
              onInput={(e) =>
                newItemDescription.value = (e.target as HTMLInputElement).value}
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
              htmlFor="new-item-assignee"
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
                id="new-item-assignee"
                type="text"
                value={newItemAssignee.value}
                onInput={(e) =>
                  newItemAssignee.value = (e.target as HTMLInputElement).value}
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
                      assigneeSuggestions.value.length - 1,
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
                      assigneeSuggestions.value[dropdownSelectedIndex.value];
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
                {assigneeSuggestions.value.map((assignee, index) => (
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
              htmlFor="new-item-due-date"
              style={{
                fontSize: "var(--text-size)",
                fontWeight: "600",
                color: "var(--color-text)",
              }}
            >
              Due Date
            </label>
            <input
              id="new-item-due-date"
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
            {/* Date presets */}
            <div class="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => newItemDueDate.value = localDateISO(0)}
                class="action-filter-pill"
                style={{
                  padding: "0.15rem 0.55rem",
                  fontSize: "var(--tiny-size)",
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => newItemDueDate.value = localDateISO(1)}
                class="action-filter-pill"
                style={{
                  padding: "0.15rem 0.55rem",
                  fontSize: "var(--tiny-size)",
                }}
              >
                Tomorrow
              </button>
              {newItemDueDate.value && (
                <button
                  type="button"
                  onClick={() => newItemDueDate.value = ""}
                  class="action-filter-pill is-danger"
                  style={{
                    padding: "0.15rem 0.55rem",
                    fontSize: "var(--tiny-size)",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
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
      </Modal>
    </>
  );
}
