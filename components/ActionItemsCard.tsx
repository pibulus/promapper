/**
 * ActionItemsCard Component
 * Manages and displays action items with full CRUD, drag-and-drop, and sorting
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { toggleActionItemInList } from "@core/orchestration/conversation-ops.ts";
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
import { speakerColor } from "@core/theme/speakerColors.ts";
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
  /** Conversation speakers — anchors each assignee's stable dot color. */
  speakers?: string[];
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
  { actionItems, conversationId, speakers = [], onUpdateItems }:
    ActionItemsCardProps,
) {
  // State
  const visibleItems = useSignal<ActionItem[]>(actionItems);
  const sortMode = useSignal<"manual" | "assignee" | "date">("manual");
  // Filter: reduce the list (sort only reorders). "Mine" covers ~90% of
  // list-narrowing without a heavy filter UI.
  const filterMine = useSignal(false);
  // Done items live behind a collapsed drawer at the list's tail — a visible
  // graveyard was crowding the card's bottom. Search auto-opens it.
  const doneOpen = useSignal(false);

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
  // Search lives behind a header button — the input only exists while open,
  // and closing it clears the filter (no stale invisible query).
  const searchOpen = useSignal(false);
  // One pulldown for sort + filters (side-by-side pills were chrome bloat).
  const optionsOpen = useSignal(false);
  // A just-checked item lingers in place briefly — the checkbox pop and the
  // strikethrough get their beat — before tucking into the done drawer.
  const recentlyCompletedId = useSignal<string | null>(null);
  // One-shot bump on the done-drawer toggle when an item tucks in.
  const doneBump = useSignal(false);
  const showAssigneeDropdown = useSignal(false);
  // True while the inline-create draft row is showing (local only, see DRAFT_ID)
  const creatingDraft = useSignal(false);
  // Transient "just checked off" id — drives a one-shot checkbox pop. Kept
  // separate from the persistent completed state so it never replays on
  // re-render (scroll/filter/append); cleared after the animation.
  const poppingId = useSignal<string | null>(null);
  // Which item's AI-reason line is expanded (one at a time).
  const expandedReasonId = useSignal<string | null>(null);

  // Refs
  const dropdownTimeoutRef = useRef<number | null>(null);
  const lingerTimeoutRef = useRef<number | null>(null);
  const selectedItemIndex = useSignal<number>(-1);
  // Set when a mouse pointerdown already toggled a checkbox, so the click that
  // follows doesn't double-toggle. Touch/pen toggle on click only (a scroll
  // flick that starts on the checkbox must not check it).
  const checkboxHandledByPointer = useRef(false);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Arrow key handler ref — always points to the current closure so the effect
  // only registers once but never goes stale.
  const arrowKeyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current !== null) {
        clearTimeout(dropdownTimeoutRef.current);
      }
      if (lingerTimeoutRef.current !== null) {
        clearTimeout(lingerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    visibleItems.value = actionItems;
  }, [actionItems]);

  // Click outside closes the sort/filter pulldown.
  useEffect(() => {
    if (!optionsOpen.value) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".action-options-wrap")) {
        optionsOpen.value = false;
      }
    };
    const t = setTimeout(
      () => document.addEventListener("mousedown", close),
      10,
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, [optionsOpen.value]);

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

    // The just-checked lingering item counts as pending so it holds its spot
    // in the list while its checkoff animation plays.
    const lingerId = recentlyCompletedId.value;
    const completed = processedItems.filter((item) =>
      item.status === "completed" && item.id !== lingerId
    );
    const pending = processedItems.filter((item) =>
      item.status === "pending" || item.id === lingerId
    );

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
    // Draft sits where the ghost add-row lives: after pending, before done.
    return [...orderedPending, ...draftRow, ...sortGroup(completed)];
  });

  // Rows actually on screen — the done drawer may be closed, and keyboard
  // nav/selection must never land on a hidden row. Search auto-opens done
  // (you're looking for something; don't make it a two-step find).
  const doneShown = useComputed(() =>
    doneOpen.value || Boolean(searchQuery.value)
  );
  const renderedItems = useComputed(() =>
    doneShown.value ? sortedActionItems.value : sortedActionItems.value.filter(
      (item) =>
        item.status !== "completed" || item.id === recentlyCompletedId.value,
    )
  );

  // Reset keyboard selection when list length changes
  useEffect(() => {
    selectedItemIndex.value = -1;
  }, [renderedItems.value.length]);

  // Keep the arrow key handler ref current on every render — this avoids the
  // stale closure problem without re-registering the event listener.
  arrowKeyHandlerRef.current = (e: KeyboardEvent) => {
    if (renderedItems.value.length === 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedItemIndex.value = Math.min(
        selectedItemIndex.value + 1,
        renderedItems.value.length - 1,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedItemIndex.value = Math.max(selectedItemIndex.value - 1, 0);
    } else if (e.key === "Enter" && selectedItemIndex.value >= 0) {
      e.preventDefault();
      const item = renderedItems.value[selectedItemIndex.value];
      if (item) toggleActionItem(item.id);
    } else if (
      (e.key === "e" || e.key === "F2") && selectedItemIndex.value >= 0
    ) {
      e.preventDefault();
      const item = renderedItems.value[selectedItemIndex.value];
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
      // Un-checking during the linger = a changed mind; cancel the tuck.
      if (recentlyCompletedId.value === itemId) {
        if (lingerTimeoutRef.current !== null) {
          clearTimeout(lingerTimeoutRef.current);
          lingerTimeoutRef.current = null;
        }
        recentlyCompletedId.value = null;
      }
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
      // Hold the checked row in place while the pop + strikethrough play,
      // then tuck it into the done drawer and bump the drawer toggle.
      if (lingerTimeoutRef.current !== null) {
        clearTimeout(lingerTimeoutRef.current);
      }
      recentlyCompletedId.value = itemId;
      lingerTimeoutRef.current = setTimeout(() => {
        lingerTimeoutRef.current = null;
        if (recentlyCompletedId.value !== itemId) return;
        recentlyCompletedId.value = null;
        doneBump.value = true;
        setTimeout(() => {
          doneBump.value = false;
        }, 450);
      }, 900) as unknown as number;
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
      publishItems([...visibleItems.value, newItem]);
      soundBloom();
    } else {
      // No-change guard: click-to-edit means rows open casually — a look
      // around that touches nothing must not stamp updated_at or push a sync.
      const existing = visibleItems.value.find(
        (item) => item.id === editingItemId.value,
      );
      const description = editingDescription.value.trim();
      const assignee = editingAssignee.value.trim() || null;
      const due_date = editingDueDate.value || null;
      if (
        existing && existing.description === description &&
        (existing.assignee || null) === assignee &&
        (existing.due_date || null) === due_date
      ) {
        cancelEdit();
        return;
      }
      publishItems(
        visibleItems.value.map((item) =>
          item.id === editingItemId.value
            ? {
              ...item,
              description,
              assignee,
              due_date,
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

  function updateDueDate(itemId: string, due_date: string | null) {
    const updatedItems = visibleItems.value.map((item) =>
      item.id === itemId
        ? { ...item, due_date, updated_at: new Date().toISOString() }
        : item
    );
    publishItems(updatedItems);
  }

  // Open a (visually hidden) native date input's picker. showPicker() needs
  // a user gesture and isn't everywhere; fall back to focus+click.
  function openDatePicker(inputId: string) {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.focus();
        input.click();
      }
    } catch {
      input.focus();
      input.click();
    }
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

  function toggleSearch() {
    searchOpen.value = !searchOpen.value;
    if (!searchOpen.value) searchQuery.value = "";
  }

  // Bulk complete/clear live on the flip side (Overview back) only — done
  // items fade hard on the front, no divider chrome between the groups.

  // ===================================================================
  // RENDER
  // ===================================================================

  // Ghost add-row: sits at the end of the pending items and BECOMES the task
  // when clicked (the inline draft opens in its place). Hidden while a draft
  // is open or a search is filtering the list.
  const addGhostRow = !creatingDraft.value && !searchQuery.value && (
    <button
      type="button"
      class="action-add-row"
      onClick={startCreatingInline}
      aria-label="Add a task"
      data-tip="Add a task"
    >
      <i class="fa fa-plus" aria-hidden="true"></i>
    </button>
  );

  return (
    <>
      <Confetti trigger={triggerConfetti.value} />
      <div class="w-full h-full">
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>Action Items</h3>
            <div class="flex gap-1 items-center">
              <button
                onClick={toggleSearch}
                class="btn btn--ghost btn--icon btn--compact"
                aria-label={searchOpen.value ? "Close search" : "Search tasks"}
                aria-pressed={searchOpen.value}
                data-tip="Search"
                data-tip-align="right"
              >
                <i class="fa fa-magnifying-glass" aria-hidden="true"></i>
              </button>
              {
                /* ONE pulldown for sort + filters — same-context options
                  never sit side by side */
              }
              <div class="relative action-options-wrap">
                <button
                  onClick={() => optionsOpen.value = !optionsOpen.value}
                  class="btn btn--ghost btn--icon btn--compact"
                  aria-label="Sort and filter"
                  aria-expanded={optionsOpen.value}
                  data-tip="Sort & filter"
                  data-tip-align="right"
                >
                  <i class="fa fa-sliders" aria-hidden="true"></i>
                </button>
                {optionsOpen.value && (
                  <div class="action-dropdown-menu action-options-menu font-mono">
                    <div class="action-options-label">Sort</div>
                    {([
                      ["manual", "Manual"],
                      ["assignee", "By person"],
                      ["date", "By date"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        class={`action-dropdown-option${
                          sortMode.value === mode ? " is-active" : ""
                        }`}
                        onClick={() => {
                          sortMode.value = mode;
                          optionsOpen.value = false;
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <div class="action-options-label">Show</div>
                    <button
                      type="button"
                      class={`action-dropdown-option${
                        filterMine.value ? " is-active" : ""
                      }`}
                      onClick={() => {
                        filterMine.value = !filterMine.value;
                        soundToggle(filterMine.value);
                      }}
                    >
                      Mine only
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {
            /* Search input — only exists while open (filters + sort live in
              the header pulldown; no permanent chrome row at all) */
          }
          {searchOpen.value && (
            <div
              class="action-items-search"
              style={{ padding: "0.6rem var(--card-padding) 0.25rem" }}
            >
              <input
                type="text"
                value={searchQuery.value}
                onInput={(e) => {
                  searchQuery.value = (e.target as HTMLInputElement).value;
                  soundTick(); // play typing sound
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") toggleSearch();
                }}
                placeholder="Search tasks…"
                aria-label="Search action items"
                autoFocus
                class="w-full rounded-lg px-2.5 py-1.5 focus:outline-none action-input--xs font-mono"
              />
            </div>
          )}

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
                      <div class="empty-state-face" aria-hidden="true">
                        ( • ᴗ • )
                      </div>
                      <div class="empty-state-text font-mono">
                        Nothing to do. Lovely.
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
                        <i class="fa fa-magnifying-glass" aria-hidden="true">
                        </i>
                      </div>
                      <div class="empty-state-text">Nothing matches</div>
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
                    const lingerId = recentlyCompletedId.value;
                    const isPendingRow = (row: ActionItem) =>
                      row.status === "pending" || row.id === lingerId;
                    const pendingRows = sortedActionItems.value.filter(
                      isPendingRow,
                    );
                    const completedRows = sortedActionItems.value.filter(
                      (row) => !isPendingRow(row),
                    );
                    // doneIndex >= 0 marks a row inside the done drawer — it
                    // gets the staggered reveal when the drawer opens.
                    const renderRow = (
                      item: ActionItem,
                      index: number,
                      doneIndex = -1,
                    ) => {
                      const isDragging = draggingId.value === item.id;
                      const isSettling = settlingId.value === item.id;
                      const isTemp = item.id === DRAFT_ID;
                      const isEditing = editingItemId.value === item.id;
                      const canDrag = item.status === "pending" &&
                        sortMode.value === "manual" && !searchQuery.value &&
                        !isTemp && !isEditing;
                      const isSelected = selectedItemIndex.value === index;

                      const isOverdue = item.due_date &&
                        item.status === "pending" &&
                        item.due_date < todayISO;

                      return (
                        <div
                          key={item.id}
                          data-sortable-id={canDrag ? item.id : undefined}
                          onPointerDown={(e) =>
                            canDrag && onRowPointerDown(e, item.id)}
                          onClick={() => selectedItemIndex.value = index}
                          class={`action-item-card relative transition-all${
                            item.status === "completed" ? " is-completed" : ""
                          }${isSelected ? " is-selected" : ""}${
                            isDragging ? " is-dragging" : ""
                          }${isSettling ? " is-settling" : ""}${
                            doneIndex >= 0 ? " done-enter" : ""
                          }`}
                          style={{
                            // pan-y keeps native vertical scroll on draggable
                            // rows; the long-press grab (usePointerSortable)
                            // takes over once it fires. Anything stricter
                            // would kill scrolling over the list on touch.
                            touchAction: canDrag ? "pan-y" : undefined,
                            ...(doneIndex >= 0
                              ? { "--stagger": String(doneIndex) }
                              : {}),
                          }}
                        >
                          {
                            /* THE EDITOR IS THE ROW, GROWN: same card, same
                              spine — the textarea holds the words where they
                              already were and the extras unfold underneath
                              (no second box, no jump-cut). */
                          }
                          {isEditing && (
                            <div class="action-edit relative z-[2] font-mono">
                              <textarea
                                aria-label="Edit description"
                                value={editingDescription.value}
                                ref={(el) => {
                                  if (!el) return;
                                  // Auto-grow to fit the words (no scrollbar,
                                  // no resize nub)
                                  el.style.height = "auto";
                                  el.style.height = `${el.scrollHeight}px`;
                                  // First mount: focus with the caret at the
                                  // END (autoFocus lands it at the start)
                                  if (el.dataset.focused !== "true") {
                                    el.dataset.focused = "true";
                                    el.focus();
                                    el.setSelectionRange(
                                      el.value.length,
                                      el.value.length,
                                    );
                                  }
                                }}
                                onInput={(e) => {
                                  const field = e
                                    .target as HTMLTextAreaElement;
                                  editingDescription.value = field.value;
                                  field.style.height = "auto";
                                  field.style.height =
                                    `${field.scrollHeight}px`;
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
                                    .relatedTarget as HTMLElement | null;
                                  // Don't save if focus moved to controls
                                  // inside the editing card
                                  if (
                                    related &&
                                    related.closest(".action-item-card")
                                  ) return;
                                  if (editingDescription.value.trim()) {
                                    saveEdit();
                                  } else {
                                    cancelEdit();
                                  }
                                }}
                                placeholder="What needs doing?"
                                class="action-edit-text"
                              />

                              {
                                /* Everything below the words unfolds in —
                                  who + when chips, then the actions. */
                              }
                              <div class="action-edit-extras">
                                <div class="action-edit-extras-inner">
                                  <div class="action-edit-meta">
                                    <div class="relative assignee-dropdown-container">
                                      <label
                                        class={`action-edit-chip${
                                          editingAssignee.value.trim()
                                            ? " has-value"
                                            : ""
                                        }`}
                                      >
                                        <i
                                          class="fa fa-user"
                                          aria-hidden="true"
                                          // Identity echo: the icon wears the
                                          // person's color once a name exists
                                          style={editingAssignee.value.trim()
                                            ? {
                                              color: speakerColor(
                                                editingAssignee.value.trim(),
                                                speakers,
                                              ),
                                            }
                                            : undefined}
                                        >
                                        </i>
                                        <input
                                          type="text"
                                          value={editingAssignee.value}
                                          onInput={(e) => {
                                            editingAssignee.value = (e
                                              .target as HTMLInputElement)
                                              .value;
                                            soundTick();
                                          }}
                                          onFocus={() => {
                                            showAssigneeDropdown.value = true;
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
                                          aria-label="Assignee"
                                          class="action-edit-chip-input"
                                        />
                                      </label>

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

                                    <input
                                      type="date"
                                      id={`edit-date-${item.id}`}
                                      aria-label="Due date"
                                      value={editingDueDate.value}
                                      onChange={(e) => {
                                        editingDueDate.value = (e
                                          .target as HTMLInputElement).value;
                                        soundTick();
                                      }}
                                      tabIndex={-1}
                                      class="absolute opacity-0 pointer-events-none"
                                    />
                                    <button
                                      type="button"
                                      class={`action-edit-chip action-edit-chip--btn${
                                        editingDueDate.value ? " has-value" : ""
                                      }`}
                                      onClick={() =>
                                        openDatePicker(
                                          `edit-date-${item.id}`,
                                        )}
                                      title="Pick a due date"
                                    >
                                      <i
                                        class="fa fa-calendar"
                                        aria-hidden="true"
                                      >
                                      </i>
                                      <span>
                                        {editingDueDate.value
                                          ? formatFriendlyDate(
                                            editingDueDate.value,
                                          )
                                          : "When?"}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      class="action-edit-preset"
                                      onClick={() => {
                                        editingDueDate.value = localDateISO(
                                          0,
                                        );
                                        soundTick();
                                      }}
                                    >
                                      Today
                                    </button>
                                    <button
                                      type="button"
                                      class="action-edit-preset"
                                      onClick={() => {
                                        editingDueDate.value = localDateISO(
                                          1,
                                        );
                                        soundTick();
                                      }}
                                    >
                                      Tmrw
                                    </button>
                                    {editingDueDate.value && (
                                      <button
                                        type="button"
                                        class="action-edit-preset"
                                        onClick={() => {
                                          editingDueDate.value = "";
                                          soundTick();
                                        }}
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>

                                  <div class="action-edit-footer">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cancelEdit();
                                      }}
                                      class="btn btn--secondary btn--compact font-bold text-xs"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveEdit();
                                      }}
                                      disabled={!editingDescription.value
                                        .trim()}
                                      class="btn btn--accent btn--compact font-bold text-xs"
                                    >
                                      {isTemp ? "Add" : "Save"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {!isEditing && (
                            <div class="grid grid-cols-[auto_1fr_auto] gap-2.5 items-start relative z-[2]">
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

                              {/* Content */}
                              <div class="flex flex-col gap-2 min-w-0 w-full">
                                {
                                  /* Two-line clamp keeps every row the
                                          same shape; click the words to edit
                                          them in place (the editor shows the
                                          full text — reading == editing) */
                                }
                                <p
                                  class={`action-item-description leading-relaxed${
                                    item.status === "completed"
                                      ? " is-completed"
                                      : ""
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectedItemIndex.value = index;
                                    startEditing(
                                      item.id,
                                      item.description,
                                      item.assignee,
                                      item.due_date,
                                    );
                                  }}
                                  // Full text on hover (truncated rows), native so it wraps.
                                  title={item.description}
                                >
                                  {item.description}
                                </p>

                                {
                                  /* Metadata — only what EXISTS renders:
                                          the assignee's color dot, the date
                                          when set. Empty slots show nothing
                                          (the edit pencil holds the forms). */
                                }
                                {item.due_date && (
                                  <div class="action-item-meta flex items-center gap-2 flex-wrap">
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
                                        onClick={() =>
                                          openDatePicker(
                                            `date-${item.id}`,
                                          )}
                                        class={`action-item-chip action-item-chip--btn flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors has-value${
                                          isOverdue ? " is-overdue" : ""
                                        }`}
                                        title="Change due date"
                                      >
                                        <i class="fa fa-calendar text-xs">
                                        </i>
                                        <span class="font-mono">
                                          {formatFriendlyDate(
                                            item.due_date,
                                          )}
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
                              </div>

                              {
                                /* Edit + delete — an overlay at the row's right
                                  edge, clear of the in-flow checkbox. Overlay,
                                  not a grid column: a hidden column still
                                  reserved width and starved the words (the
                                  dead-space bug). pointer-events gate in CSS. */
                              }
                              {!isTemp && (
                                <div class="action-item-actions">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditing(
                                        item.id,
                                        item.description,
                                        item.assignee,
                                        item.due_date,
                                      );
                                    }}
                                    class="action-item-icon-btn"
                                    aria-label={`Edit "${item.description}"`}
                                    title="Edit"
                                  >
                                    <i
                                      class="fa fa-pencil text-xs"
                                      aria-hidden="true"
                                    >
                                    </i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteItem(item.id);
                                    }}
                                    class="action-item-icon-btn action-item-icon-btn--delete"
                                    aria-label={`Delete "${item.description}"`}
                                    title="Delete (undoable)"
                                  >
                                    <i
                                      class="fa fa-times text-xs"
                                      aria-hidden="true"
                                    >
                                    </i>
                                  </button>
                                </div>
                              )}

                              {/* Checkbox */}
                              <div class="flex items-center pt-1">
                                {isTemp
                                  ? (
                                    <div
                                      class="w-[1.25rem] h-[1.25rem] rounded-[0.4rem] flex items-center justify-center bg-cream"
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
                                      }${item.assignee ? " is-assigned" : ""}`}
                                      // The checkbox IS the person: the
                                      // assignee's stable identity hue rides
                                      // in as a custom prop and the CSS mixes
                                      // it toward the live theme (raw palette
                                      // hex read garish next to any accent).
                                      style={item.assignee
                                        ? {
                                          "--person-color": speakerColor(
                                            item.assignee,
                                            speakers,
                                          ),
                                        }
                                        : undefined}
                                      title={item.assignee
                                        ? `Assigned to ${item.assignee}`
                                        : undefined}
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
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        {pendingRows.map((item, i) => renderRow(item, i))}
                        {
                          /* Everything's checked — a tiny payoff moment above
                            the tucked-away drawer (not during a search). */
                        }
                        {pendingRows.length === 0 && !searchQuery.value && (
                          <div class="empty-state font-mono">
                            <div class="empty-state-icon">
                              <i class="fa fa-circle-check" aria-hidden="true">
                              </i>
                            </div>
                            <div class="empty-state-text">All done</div>
                          </div>
                        )}
                        {addGhostRow}
                        {
                          /* Done drawer — completed items rest behind this
                            slim divider-toggle; search peeks inside it. */
                        }
                        {completedRows.length > 0 && (
                          <button
                            type="button"
                            class={`action-done-toggle font-mono${
                              doneShown.value ? " is-open" : ""
                            }${doneBump.value ? " is-bumping" : ""}`}
                            onClick={() => {
                              doneOpen.value = !doneOpen.value;
                              soundToggle(doneOpen.value);
                            }}
                            aria-expanded={doneShown.value}
                          >
                            <i class="fa fa-chevron-down" aria-hidden="true">
                            </i>
                            <span>{completedRows.length} done</span>
                          </button>
                        )}
                        {doneShown.value &&
                          completedRows.map((item, i) =>
                            renderRow(item, pendingRows.length + i, i)
                          )}
                      </>
                    );
                  })()}
                </div>
              )}
          </div>

          {
            /* No separate quick-add box: the ghost row at the end of the list
              IS the add — click it and the task is written in place (the same
              inline draft the header + used to open). One idea, one spot. */
          }
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
