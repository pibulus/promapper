/**
 * ActionItemsCard Component
 * Manages and displays action items with full CRUD, drag-and-drop, and sorting
 */

import { Fragment } from "preact";
import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  clearCompletedActionItems,
  completeAllActionItems,
  toggleActionItemInList,
} from "@core/orchestration/conversation-ops.ts";
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
import { localDateISO } from "@core/storage/dates.ts";
import Confetti from "./Confetti.tsx";

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

/** Optional AI-attribution fields set by the server's append merge. */
type AIFlaggedItem = ActionItem & {
  ai_checked?: boolean;
  checked_reason?: string;
};

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
  const yearSuffix = date.getFullYear() !== new Date().getFullYear()
    ? ` ${date.getFullYear()}`
    : "";
  return `${days[date.getDay()]}, ${
    months[date.getMonth()]
  } ${date.getDate()}${yearSuffix}`;
}

/**
 * The inline-create draft row's id. The draft is LOCAL to this card — it is
 * never published to the store, so a reload/share/live-sync mid-draft can't
 * leak an empty ghost row (the old temp- items did exactly that).
 */
const DRAFT_ID = "draft-new";

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
  const triggerConfetti = useSignal(false);
  const searchQuery = useSignal("");
  const showAssigneeDropdown = useSignal(false);
  const activeAssigneeDropdown = useSignal<string | null>(null);
  // True while the inline-create draft row is showing (local only, see DRAFT_ID)
  const creatingDraft = useSignal(false);
  const quickAddText = useSignal("");
  // Transient "just checked off" id — drives a one-shot checkbox pop. Kept
  // separate from the persistent completed state so it never replays on
  // re-render (scroll/filter/append); cleared after the animation.
  const poppingId = useSignal<string | null>(null);
  // Which item's AI-reason line is expanded (one at a time).
  const expandedReasonId = useSignal<string | null>(null);

  // Refs
  const dropdownTimeoutRef = useRef<number | null>(null);
  const selectedItemIndex = useSignal<number>(-1);
  // Set when a mouse pointerdown already toggled a checkbox, so the click that
  // follows doesn't double-toggle. Touch/pen toggle on click only (a scroll
  // flick that starts on the checkbox must not check it).
  const checkboxHandledByPointer = useRef(false);
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

  const sortedActionItems = useComputed(() => {
    let processedItems = [...visibleItems.value];

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      processedItems = processedItems.filter((item) =>
        item.description.toLowerCase().includes(query) ||
        item.assignee?.toLowerCase().includes(query) ||
        item.due_date?.includes(query)
      );
    }

    if (filterMine.value) {
      processedItems = processedItems.filter((item) => item.assignee === "Me");
    }
    if (hideDone.value) {
      processedItems = processedItems.filter((item) =>
        item.status !== "completed"
      );
    }

    const completed = processedItems.filter((item) =>
      item.status === "completed"
    );
    const pending = processedItems.filter((item) => item.status === "pending");

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

    // While dragging, render the pending group in the live preview order
    const preview = previewOrder.value;
    let orderedPending = sortGroup(pending);
    if (preview) {
      const byId = new Map(pending.map((item) => [item.id, item]));
      const fromPreview = preview
        .map((id) => byId.get(id))
        .filter((item): item is ActionItem => Boolean(item));
      const seen = new Set(preview);
      const rest = pending.filter((item) => !seen.has(item.id));
      orderedPending = [...fromPreview, ...rest];
    }

    // The local inline-create draft renders at the absolute top (never stored)
    const draftRow: ActionItem[] = creatingDraft.value
      ? [{
        id: DRAFT_ID,
        conversation_id: conversationId,
        description: "",
        assignee: null,
        due_date: null,
        status: "pending",
        created_at: "",
        updated_at: "",
      }]
      : [];
    return [...draftRow, ...orderedPending, ...sortGroup(completed)];
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
      // bloom cue and trigger confetti instead of the per-item tick — a little payoff for clearing it.
      const wasLast = visibleItems.value.length > 0 &&
        visibleItems.value.every((i) =>
          i.id === itemId || i.status === "completed"
        );
      if (wasLast) {
        soundBloom();
        triggerConfetti.value = true;
        setTimeout(() => {
          triggerConfetti.value = false;
        }, 1000);
      } else {
        soundCheckoff();
      }
      // One-shot pop on the moment of completion (the rewarding beat).
      poppingId.value = itemId;
      setTimeout(() => {
        if (poppingId.value === itemId) poppingId.value = null;
      }, 240);
    }
    // The manual-override rule (strip AI flags + stamp updated_at) lives in
    // the shared pure op — same seam the store and tests use.
    publishItems(
      toggleActionItemInList(
        visibleItems.value,
        itemId,
        new Date().toISOString(),
      ),
    );
  }

  function startCreatingInline() {
    // Discard any in-progress edit before creating a new one
    if (editingItemId.value) {
      cancelEdit();
    }
    creatingDraft.value = true;
    editingItemId.value = DRAFT_ID;
    editingDescription.value = "";
    editingAssignee.value = "";
    editingDueDate.value = "";
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
    if (!editingDescription.value.trim()) {
      cancelEdit();
      return;
    }

    const isNew = editingItemId.value === DRAFT_ID;

    if (isNew) {
      // The draft was local — this is the moment it becomes a real item.
      const newItem: ActionItem = {
        id: crypto.randomUUID(),
        conversation_id: conversationId ||
          visibleItems.value[0]?.conversation_id || "",
        description: editingDescription.value.trim(),
        assignee: editingAssignee.value.trim() || null,
        due_date: editingDueDate.value || null,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      publishItems([newItem, ...visibleItems.value]);
      soundBloom();
    } else {
      publishItems(
        visibleItems.value.map((item) =>
          item.id === editingItemId.value
            ? {
              ...item,
              description: editingDescription.value.trim(),
              assignee: editingAssignee.value.trim() || null,
              due_date: editingDueDate.value || null,
              updated_at: new Date().toISOString(),
            }
            : item
        ),
      );
      soundTick();
    }

    cancelEdit();
  }

  function cancelEdit() {
    creatingDraft.value = false;
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

  // Delete immediately; the undo toast is the safety net (no confirm modal —
  // that's the app's danger law: calm recession + undo, not alarm friction).
  function deleteItem(itemId: string) {
    const removed = visibleItems.value.find((item) => item.id === itemId);
    publishItems(visibleItems.value.filter((item) => item.id !== itemId));
    if (canUndo()) {
      const label = removed?.description?.slice(0, 40) || "item";
      showUndoToast(`Deleted "${label}"`, undoLastMutation);
    }
  }

  // Bulk ops go through the same pure transforms as the back face, so both
  // faces stamp updated_at + strip AI flags identically.
  function completeAll() {
    publishItems(
      completeAllActionItems(visibleItems.value, new Date().toISOString()),
    );
    soundBloom();
  }

  function clearDone() {
    const clearedCount =
      visibleItems.value.filter((i) => i.status === "completed").length;
    if (clearedCount === 0) return;
    publishItems(clearCompletedActionItems(visibleItems.value));
    if (canUndo()) {
      showUndoToast(`Cleared ${clearedCount} done`, undoLastMutation);
    }
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
      <Confetti trigger={triggerConfetti.value} />
      <div class="w-full h-full">
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>
              Action Items
              {progress.value.total > 0 && (
                <span class="header-progress">
                  {progress.value.done} of {progress.value.total} done
                </span>
              )}
            </h3>
            <div class="flex gap-1 items-center">
              <button
                onClick={cycleSortMode}
                class="btn btn--ghost btn--compact"
                aria-label={`Sort: ${sortLabel.value}. Click to change.`}
                title={`Sort: ${sortLabel.value}`}
              >
                <i
                  class={`fa ${
                    sortMode.value === "manual"
                      ? "fa-arrow-up-wide-short"
                      : sortMode.value === "assignee"
                      ? "fa-user"
                      : "fa-calendar"
                  }`}
                  aria-hidden="true"
                >
                </i>
                <span class="hidden sm:inline">{sortLabel.value}</span>
              </button>
              <button
                onClick={startCreatingInline}
                class="btn btn--ghost btn--icon btn--compact"
                aria-label="Add action item"
                title="Add new item"
              >
                <i class="fa fa-plus" aria-hidden="true"></i>
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
              onInput={(e) => {
                searchQuery.value = (e.target as HTMLInputElement).value;
                soundTick(); // play typing sound
              }}
              placeholder="Search"
              aria-label="Search action items"
              // rounded-lg + py-1.5 — same corner family and input rhythm as
              // the quick-add bar (this was the card's one 4px-radius input)
              class="w-full rounded-lg px-2.5 py-1.5 focus:outline-none action-input--xs font-mono"
            />
            {
              /* One composed chrome row: filters left, bulk actions right —
                (was two stacked rows of small text) */
            }
            <div class="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <div class="flex gap-2">
                <button
                  onClick={() => {
                    filterMine.value = !filterMine.value;
                    soundToggle(filterMine.value);
                  }}
                  class="action-filter-pill"
                  aria-pressed={filterMine.value}
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
                >
                  Hide done
                </button>
              </div>
              {progress.value.total > 0 && (
                <div class="flex gap-3 font-mono">
                  {!hideDone.value &&
                    progress.value.total > progress.value.done && (
                    <button
                      onClick={completeAll}
                      class="action-bulk-btn action-bulk-btn--accent"
                    >
                      Complete all
                    </button>
                  )}
                  {!hideDone.value && progress.value.done > 0 && (
                    <button
                      onClick={clearDone}
                      class="action-bulk-btn"
                    >
                      Clear {progress.value.done} done
                    </button>
                  )}
                </div>
              )}
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
                      <div class="empty-state-icon">
                        <i class="fa fa-list-check" aria-hidden="true"></i>
                      </div>
                      <div class="empty-state-text font-mono">
                        It's quiet here.
                      </div>
                      <button
                        onClick={startCreatingInline}
                        class="action-header-btn px-3 py-1 rounded mt-2 font-mono"
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
                    <div class="empty-state font-mono">
                      <div class="empty-state-icon">
                        <i class="fa fa-circle-check" aria-hidden="true"></i>
                      </div>
                      <div class="empty-state-text">All done</div>
                    </div>
                  )
              )
              : (
                <div class="space-y-3">
                  {(() => {
                    // Local-midnight "today" — hoisted so overdue doesn't flip
                    // at the wrong hour in non-UTC timezones (and isn't
                    // recomputed per row).
                    const todayISO = localDateISO(0);
                    return sortedActionItems.value.map((item, index) => {
                      const isDragging = draggingId.value === item.id;
                      const isSettling = settlingId.value === item.id;
                      const isTemp = item.id === DRAFT_ID;
                      const canDrag = item.status === "pending" &&
                        sortMode.value === "manual" && !searchQuery.value &&
                        !isTemp;
                      const isSelected = selectedItemIndex.value === index;

                      const isOverdue = item.due_date &&
                        item.status === "pending" &&
                        item.due_date < todayISO;

                      return (
                        <Fragment key={item.id}>
                          {/* "Clear done" divider — shown once before the first completed item */}
                          {progress.value.done > 0 &&
                            index === firstCompletedIndex && (
                            <div class="action-done-divider font-mono">
                              <span
                                class="action-done-rule"
                                aria-hidden="true"
                              />
                              <span class="card-back-label action-done-label">
                                Done · {progress.value.done}
                              </span>
                              <span
                                class="action-done-rule"
                                aria-hidden="true"
                              />
                              <button
                                onClick={clearDone}
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
                            data-sortable-id={canDrag ? item.id : undefined}
                            onPointerDown={(e) =>
                              canDrag && onRowPointerDown(e, item.id)}
                            onClick={() => selectedItemIndex.value = index}
                            class={`action-item-card relative transition-all${
                              item.status === "completed" ? " is-completed" : ""
                            }${isSelected ? " is-selected" : ""}${
                              isDragging ? " is-dragging" : ""
                            }${isSettling ? " is-settling" : ""}`}
                            style={{
                              // pan-y keeps native vertical scroll on draggable
                              // rows; the long-press grab (usePointerSortable)
                              // takes over once it fires. Anything stricter
                              // would kill scrolling over the list on touch.
                              touchAction: canDrag ? "pan-y" : undefined,
                            }}
                          >
                            {/* Rotating conic ring while selected or editing */}
                            {(isSelected || editingItemId.value === item.id) &&
                              (
                                <div
                                  aria-hidden="true"
                                  class="border-beam-ring"
                                />
                              )}

                            <div class="grid grid-cols-[auto_auto_1fr] gap-3 items-start relative z-[2]">
                              {/* Drag Handle (mouse/pen: press to grab; touch: long-press the row) */}
                              <div class="flex items-center pt-1">
                                {canDrag
                                  ? (
                                    <i
                                      class="fa fa-grip-vertical drag-handle"
                                      title="Drag to reorder"
                                      onPointerDown={(e) =>
                                        onHandlePointerDown(e, item.id)}
                                    >
                                    </i>
                                  )
                                  : <div class="drag-handle-placeholder"></div>}
                              </div>

                              {/* Checkbox */}
                              <div class="flex items-center pt-1">
                                {isTemp
                                  ? (
                                    <div
                                      class="w-[1.4rem] h-[1.4rem] rounded-[0.45rem] flex items-center justify-center bg-cream"
                                      style={{
                                        border:
                                          "2px dashed var(--color-border)",
                                      }}
                                      title="Creating inline..."
                                    >
                                      <i
                                        class="fa fa-plus text-[10px]"
                                        style={{
                                          color: "var(--color-text-secondary)",
                                        }}
                                        aria-hidden="true"
                                      >
                                      </i>
                                    </div>
                                  )
                                  : (
                                    <button
                                      type="button"
                                      // Mouse toggles on pointerdown (snappy);
                                      // touch/pen wait for the click so a scroll
                                      // flick that lands here can't check it.
                                      onPointerDown={(event) => {
                                        event.stopPropagation();
                                        if (event.pointerType === "mouse") {
                                          event.preventDefault();
                                          checkboxHandledByPointer.current =
                                            true;
                                          toggleActionItem(item.id);
                                        }
                                      }}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (checkboxHandledByPointer.current) {
                                          checkboxHandledByPointer.current =
                                            false;
                                          return;
                                        }
                                        toggleActionItem(item.id);
                                      }}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key !== "Enter" &&
                                          event.key !== " "
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
                                        <i
                                          class="fa fa-check"
                                          aria-hidden="true"
                                        >
                                        </i>
                                      )}
                                    </button>
                                  )}
                              </div>

                              {/* Content */}
                              <div class="flex flex-col gap-3 min-w-0 w-full">
                                {editingItemId.value === item.id
                                  ? (
                                    <div class="space-y-3 font-mono">
                                      <textarea
                                        aria-label="Edit description"
                                        value={editingDescription.value}
                                        onInput={(e) => {
                                          editingDescription.value =
                                            (e.target as HTMLTextAreaElement)
                                              .value;
                                          soundTick(); // typing sound
                                        }}
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
                                          // Don't save if focus moved to controls inside the editing card
                                          if (
                                            related &&
                                            related.closest(".action-item-card")
                                          ) return;
                                          if (
                                            editingDescription.value.trim()
                                          ) {
                                            saveEdit();
                                          } else {
                                            cancelEdit();
                                          }
                                        }}
                                        placeholder="What needs doing?"
                                        class="w-full rounded px-2.5 py-1.5 text-sm action-input-border bg-white focus:ring-2 focus:ring-accent outline-none font-mono"
                                        style={{ minHeight: "70px" }}
                                        autoFocus
                                      />

                                      {/* Inline details fields */}
                                      <div class="flex flex-wrap gap-3 items-center">
                                        {/* Assignee pill editor */}
                                        <div class="relative inline-block assignee-dropdown-container">
                                          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cream border border-soft-black shadow-[2px_2px_0px_0px_var(--soft-black)]">
                                            <i class="fa fa-user text-xs"></i>
                                            <input
                                              type="text"
                                              value={editingAssignee.value}
                                              onInput={(e) => {
                                                editingAssignee.value =
                                                  (e.target as HTMLInputElement)
                                                    .value;
                                                soundTick();
                                              }}
                                              onFocus={() => {
                                                showAssigneeDropdown.value =
                                                  true;
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
                                                    showAssigneeDropdown.value =
                                                      false;
                                                    dropdownTimeoutRef.current =
                                                      null;
                                                  }, 200) as unknown as number;
                                              }}
                                              placeholder="Who?"
                                              class="w-20 bg-transparent border-none outline-none font-mono text-xs focus:ring-0 p-0"
                                            />
                                          </div>

                                          {showAssigneeDropdown.value && (
                                            <div class="action-dropdown-menu">
                                              {assigneeSuggestions.value.map((
                                                assignee,
                                              ) => (
                                                <button
                                                  type="button"
                                                  key={assignee}
                                                  onMouseDown={() => {
                                                    editingAssignee.value =
                                                      assignee;
                                                    showAssigneeDropdown.value =
                                                      false;
                                                  }}
                                                  class={`action-dropdown-option font-mono text-xs${
                                                    editingAssignee.value ===
                                                        assignee
                                                      ? " is-active"
                                                      : ""
                                                  }`}
                                                >
                                                  {assignee}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {/* Due date picker editor */}
                                        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cream border border-soft-black shadow-[2px_2px_0px_0px_var(--soft-black)]">
                                          <i class="fa fa-calendar text-xs"></i>
                                          <input
                                            type="date"
                                            value={editingDueDate.value}
                                            onInput={(e) => {
                                              editingDueDate.value =
                                                (e.target as HTMLInputElement)
                                                  .value;
                                              soundTick();
                                            }}
                                            class="bg-transparent border-none outline-none font-mono text-xs focus:ring-0 p-0 cursor-pointer"
                                          />
                                        </div>

                                        {/* Quick presets */}
                                        <div class="flex gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              editingDueDate.value =
                                                localDateISO(
                                                  0,
                                                );
                                              soundTick();
                                            }}
                                            class="action-filter-pill text-[10px] py-0.5 px-1.5"
                                          >
                                            Today
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              editingDueDate.value =
                                                localDateISO(
                                                  1,
                                                );
                                              soundTick();
                                            }}
                                            class="action-filter-pill text-[10px] py-0.5 px-1.5"
                                          >
                                            Tmrw
                                          </button>
                                        </div>
                                      </div>

                                      <div class="flex justify-between items-center pt-1 edit-actions">
                                        <span class="text-[10px] italic action-edit-hint">
                                          Ctrl+Enter to save · Esc to cancel
                                        </span>
                                        <div class="flex gap-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              saveEdit();
                                            }}
                                            disabled={!editingDescription.value
                                              .trim()}
                                            class="btn btn--accent btn--compact font-bold text-xs"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              cancelEdit();
                                            }}
                                            class="btn btn--secondary btn--compact font-bold text-xs"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                  : (
                                    <>
                                      <p
                                        class={`action-item-description leading-relaxed${
                                          item.status === "completed"
                                            ? " is-completed"
                                            : ""
                                        }`}
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

                                      {/* Metadata row - assignee & due date */}
                                      {(!item.assignee && !item.due_date)
                                        ? (
                                          <div class="action-item-meta flex items-center gap-2 flex-wrap">
                                            <button
                                              onClick={() =>
                                                startEditing(
                                                  item.id,
                                                  item.description,
                                                  item.assignee,
                                                  item.due_date,
                                                )}
                                              class="action-item-chip action-item-chip--add px-2.5 py-1 rounded text-xs font-mono"
                                            >
                                              + add details
                                            </button>
                                          </div>
                                        )
                                        : (
                                          <div class="action-item-meta flex items-center gap-2 flex-wrap">
                                            {/* Assignee selector */}
                                            <div class="relative assignee-dropdown-container">
                                              <button
                                                onClick={() =>
                                                  activeAssigneeDropdown.value =
                                                    activeAssigneeDropdown
                                                        .value ===
                                                        item.id
                                                      ? null
                                                      : item.id}
                                                class={`action-item-chip action-item-chip--btn flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors${
                                                  item.assignee
                                                    ? " has-value"
                                                    : ""
                                                }`}
                                              >
                                                <i class="fa fa-user text-xs">
                                                </i>
                                                <span class="font-mono">
                                                  {item.assignee || "None"}
                                                </span>
                                              </button>
                                              {activeAssigneeDropdown.value ===
                                                  item.id && (
                                                <div class="action-dropdown-menu font-mono">
                                                  {/* Custom name input */}
                                                  <div class="action-dropdown-input-wrapper">
                                                    <input
                                                      type="text"
                                                      aria-label="Assignee name"
                                                      defaultValue={item
                                                        .assignee || ""}
                                                      placeholder="Type a name…"
                                                      class="action-dropdown-input font-mono"
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
                                                          activeAssigneeDropdown
                                                            .value = null;
                                                        } else if (
                                                          e.key === "Escape"
                                                        ) {
                                                          activeAssigneeDropdown
                                                            .value = null;
                                                        }
                                                      }}
                                                      onBlur={() => {
                                                        if (
                                                          dropdownTimeoutRef
                                                            .current !==
                                                            null
                                                        ) {
                                                          clearTimeout(
                                                            dropdownTimeoutRef
                                                              .current,
                                                          );
                                                        }
                                                        dropdownTimeoutRef
                                                          .current = setTimeout(
                                                            () => {
                                                              activeAssigneeDropdown
                                                                .value = null;
                                                              dropdownTimeoutRef
                                                                .current = null;
                                                            },
                                                            200,
                                                          ) as unknown as number;
                                                      }}
                                                    />
                                                  </div>
                                                  {/* Clear option */}
                                                  <button
                                                    onClick={() => {
                                                      updateAssignee(
                                                        item.id,
                                                        null,
                                                      );
                                                      activeAssigneeDropdown
                                                        .value = null;
                                                    }}
                                                    class="action-dropdown-option font-mono"
                                                  >
                                                    None
                                                  </button>
                                                  {/* Suggestions */}
                                                  {assigneeSuggestions.value
                                                    .map(
                                                      (assignee) => (
                                                        <button
                                                          key={assignee}
                                                          onClick={() => {
                                                            updateAssignee(
                                                              item.id,
                                                              assignee,
                                                            );
                                                            activeAssigneeDropdown
                                                              .value = null;
                                                          }}
                                                          class={`action-dropdown-option font-mono${
                                                            item.assignee ===
                                                                assignee
                                                              ? " is-active"
                                                              : ""
                                                          }`}
                                                        >
                                                          {assignee}
                                                        </button>
                                                      ),
                                                    )}
                                                </div>
                                              )}
                                            </div>

                                            {/* Due date selector */}
                                            <div class="relative font-mono action-item-date-wrap">
                                              <input
                                                type="date"
                                                id={`date-${item.id}`}
                                                aria-label="Due date"
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
                                                  const input = document
                                                    .getElementById(
                                                      `date-${item.id}`,
                                                    ) as
                                                      | HTMLInputElement
                                                      | null;
                                                  try {
                                                    if (
                                                      input &&
                                                      "showPicker" in input
                                                    ) {
                                                      (input as any)
                                                        .showPicker();
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
                                                class={`action-item-chip action-item-chip--btn flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors${
                                                  item.due_date
                                                    ? " has-value"
                                                    : " is-empty"
                                                }${
                                                  isOverdue ? " is-overdue" : ""
                                                }`}
                                                title={item.due_date
                                                  ? "Change due date"
                                                  : "Set a due date"}
                                              >
                                                <i class="fa fa-calendar text-xs">
                                                </i>
                                                <span class="font-mono">
                                                  {item.due_date
                                                    ? formatFriendlyDate(
                                                      item.due_date,
                                                    )
                                                    : "date"}
                                                </span>
                                              </button>
                                              <div class="action-item-date-presets flex gap-1 mt-1 flex-wrap">
                                                <button
                                                  onClick={() =>
                                                    updateDueDate(
                                                      item.id,
                                                      localDateISO(0),
                                                    )}
                                                  class="action-filter-pill action-date-preset"
                                                >
                                                  Today
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    updateDueDate(
                                                      item.id,
                                                      localDateISO(1),
                                                    )}
                                                  class="action-filter-pill action-date-preset"
                                                >
                                                  Tmrw
                                                </button>
                                                {item.due_date && (
                                                  <button
                                                    onClick={() =>
                                                      updateDueDate(
                                                        item.id,
                                                        null,
                                                      )}
                                                    class="action-filter-pill is-danger action-date-preset"
                                                  >
                                                    Clear
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                      {
                                        /* AI self-checkoff — make the magic take
                                        a bow. Chip shows when the AI flipped
                                        this item; tap reveals what it heard.
                                        Fields vanish on manual toggle (by
                                        design) and the chip goes with them. */
                                      }
                                      {(item as AIFlaggedItem).ai_checked && (
                                        <div class="action-item-ai">
                                          <button
                                            type="button"
                                            class="action-item-chip action-item-chip--ai px-3 py-1 rounded text-xs"
                                            aria-expanded={expandedReasonId
                                              .value === item.id}
                                            onClick={() =>
                                              expandedReasonId.value =
                                                expandedReasonId.value ===
                                                    item.id
                                                  ? null
                                                  : item.id}
                                            title="The AI updated this item — tap for why"
                                          >
                                            ✨ AI {item.status === "completed"
                                              ? "checked this off"
                                              : "reopened this"}
                                          </button>
                                          {expandedReasonId.value === item.id &&
                                            (item as AIFlaggedItem)
                                              .checked_reason &&
                                            (
                                              <p class="action-item-ai-reason">
                                                "{(item as AIFlaggedItem)
                                                  .checked_reason}"
                                              </p>
                                            )}
                                        </div>
                                      )}
                                    </>
                                  )}
                              </div>
                            </div>

                            {/* Edit button — hover-reveal on desktop, always visible on touch */}
                            {!isTemp && (
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
                                <i
                                  class="fa fa-pencil text-xs"
                                  aria-hidden="true"
                                >
                                </i>
                              </button>
                            )}

                            {/* Delete button — immediate, undoable via toast */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteItem(item.id);
                              }}
                              class="action-item-delete action-item-delete-btn absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                              aria-label={`Delete "${item.description}"`}
                              title="Delete (undoable)"
                            >
                              <i class="fa fa-times text-xs" aria-hidden="true">
                              </i>
                            </button>
                          </div>
                        </Fragment>
                      );
                    });
                  })()}
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
              onInput={(e) => {
                quickAddText.value = (e.target as HTMLInputElement).value;
                soundTick(); // play typing sound
              }}
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
              class="action-quick-add w-full rounded px-3 py-2 action-input--sm font-mono"
            />
          </div>
        </div>
      </div>

      {
        /* Delete + clear-done confirm modals removed on purpose: destructive
          actions here are calm + immediately undoable via toast (the old
          clear-done modal even claimed "cannot be undone" while showing an
          Undo toast). Safety comes from the undo seam, not alarm friction. */
      }
    </>
  );
}
