/**
 * ActionItemsCard Component
 *
 * The item is a SENTENCE (July 23): "@mabel fix the fence #garden friday".
 * @word = the person (a chip, not a form field), #word = a colored tag,
 * "when" is human words behind one clock icon. Order is drag; color is the
 * grouping. No sort modes, no filters, no date pickers, no presets.
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
import { showToast, showUndoToast } from "@utils/toast.ts";
import { canUndo, undoLastMutation } from "@signals/conversationStore.ts";
import { speakerColor } from "@core/theme/speakerColors.ts";
import {
  bumpTagColor,
  parseQuickAdd,
  tagColor,
  tokenizeActionText,
} from "@utils/actionTags.ts";
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

/** "When" is human words. AI extraction still emits real ISO dates — those
 * render friendly; anything typed ("friday", "before the gig") shows as-is. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function formatDue(due: string): string {
  return ISO_DATE.test(due) ? formatFriendlyDate(due) : due;
}

export default function ActionItemsCard(
  { actionItems, conversationId, speakers = [], onUpdateItems }:
    ActionItemsCardProps,
) {
  // State
  const visibleItems = useSignal<ActionItem[]>(actionItems);
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
  // Where the last-item confetti bursts FROM — the checkbox that earned it.
  const confettiOrigin = useSignal<{ x: number; y: number } | undefined>(
    undefined,
  );
  const searchQuery = useSignal("");
  // Search lives behind a header button — the input only exists while open,
  // and closing it clears the filter (no stale invisible query). Tags are
  // searchable text ("#garden" finds its items) — no separate filter UI.
  const searchOpen = useSignal(false);
  // Just-checked items linger in place briefly — the checkbox pop and the
  // strikethrough get their beat — before tucking into the done drawer.
  // A SET, not a scalar: checking two items quickly must not cut the first
  // one's linger short (each id gets its own timer in lingerTimersRef).
  const lingeringIds = useSignal<ReadonlySet<string>>(new Set());
  // One-shot bump on the done-drawer toggle when an item tucks in.
  const doneBump = useSignal(false);
  // Touch-only: tapping the words unclamps them for reading (desktop reads
  // via hover title / the editor; editing on touch rides the pencil).
  const expandedItemId = useSignal<string | null>(null);
  // The quick-add line's live text (the input at the card's foot).
  const quickAddText = useSignal("");
  // Which item's "when" is being typed inline (the clock's tiny input).
  const editingWhenId = useSignal<string | null>(null);
  // Re-render tick after a tag color re-roll (colors live in localStorage).
  const tagTintTick = useSignal(0);
  // Transient "just checked off" id — drives a one-shot checkbox pop. Kept
  // separate from the persistent completed state so it never replays on
  // re-render (scroll/filter/append); cleared after the animation.
  const poppingId = useSignal<string | null>(null);
  // Which item's AI-reason line is expanded (one at a time).
  const expandedReasonId = useSignal<string | null>(null);

  // Refs
  const lingerTimersRef = useRef<Map<string, number>>(new Map());
  // What the open editor started from — if a live-collab update rewrites the
  // item underneath the editor, we bail honestly instead of clobbering it.
  const editSnapshotRef = useRef<
    {
      description: string;
      assignee: string | null;
      due_date: string | null;
    } | null
  >(null);
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
      for (const timer of lingerTimersRef.current.values()) {
        clearTimeout(timer);
      }
      lingerTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    visibleItems.value = actionItems;
    // If a live-collab/remote update rewrote or removed the item under an
    // open editor, bail out honestly instead of clobbering the newer copy
    // on save.
    const editingId = editingItemId.value;
    const snapshot = editSnapshotRef.current;
    if (!editingId || !snapshot) return;
    const current = actionItems.find((item) => item.id === editingId);
    if (!current) {
      cancelEdit();
      showToast("That item was removed elsewhere — edit discarded", "warning");
    } else if (
      current.description !== snapshot.description ||
      (current.assignee || null) !== (snapshot.assignee || null) ||
      (current.due_date || null) !== (snapshot.due_date || null)
    ) {
      cancelEdit();
      showToast("That item changed elsewhere — reopen it to edit", "warning");
    }
  }, [actionItems]);

  const sortedActionItems = useComputed(() => {
    let processedItems = [...visibleItems.value];

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      processedItems = processedItems.filter((item) =>
        item.description.toLowerCase().includes(query) ||
        item.assignee?.toLowerCase().includes(query) ||
        item.due_date?.toLowerCase().includes(query)
      );
    }

    // Just-checked lingering items count as pending so they hold their spot
    // in the list while their checkoff animation plays.
    const lingering = lingeringIds.value;
    const completed = processedItems.filter((item) =>
      item.status === "completed" && !lingering.has(item.id)
    );
    const pending = processedItems.filter((item) =>
      item.status === "pending" || lingering.has(item.id)
    );

    // Order is manual — drag is the sort. While dragging, render the pending
    // group in the live preview order.
    const preview = previewOrder.value;
    let orderedPending = pending;
    if (preview) {
      const byId = new Map(pending.map((item) => [item.id, item]));
      const fromPreview = preview
        .map((id) => byId.get(id))
        .filter((item): item is ActionItem => Boolean(item));
      const seen = new Set(preview);
      const rest = pending.filter((item) => !seen.has(item.id));
      orderedPending = [...fromPreview, ...rest];
    }

    return [...orderedPending, ...completed];
  });

  // Rows actually on screen — the done drawer may be closed, and keyboard
  // nav/selection must never land on a hidden row. Search auto-opens done
  // (you're looking for something; don't make it a two-step find).
  const doneShown = useComputed(() =>
    doneOpen.value || Boolean(searchQuery.value)
  );
  const renderedItems = useComputed(() =>
    doneShown.value ? sortedActionItems.value : sortedActionItems.value.filter(
      (item) => item.status !== "completed" || lingeringIds.value.has(item.id),
    )
  );

  // The drawer label bumps whenever a completed item actually LANDS in it —
  // a local tuck after the linger, an undo restoring a done item, a remote
  // sync. Watching the count catches every arrival path, not just the tuck.
  const tuckedCount = useComputed(() =>
    visibleItems.value.filter((item) =>
      item.status === "completed" && !lingeringIds.value.has(item.id)
    ).length
  );
  const prevTuckedRef = useRef(0);
  useEffect(() => {
    const count = tuckedCount.value;
    const grew = count > prevTuckedRef.current;
    prevTuckedRef.current = count;
    if (!grew) return;
    doneBump.value = true;
    const timer = setTimeout(() => {
      doneBump.value = false;
    }, 450);
    return () => clearTimeout(timer);
  }, [tuckedCount.value]);

  // Reset keyboard selection when list length changes
  useEffect(() => {
    selectedItemIndex.value = -1;
  }, [renderedItems.value.length]);

  // Keep the arrow key handler ref current on every render — this avoids the
  // stale closure problem without re-registering the event listener.
  arrowKeyHandlerRef.current = (e: KeyboardEvent) => {
    if (renderedItems.value.length === 0) return;
    // An open editor owns the keyboard entirely — Enter on a preset BUTTON
    // inside it must not fall through and toggle the row being edited.
    if (editingItemId.value !== null) return;
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

  // End an item's linger hold: kill its timer and drop it from the set.
  function stopLinger(itemId: string) {
    const timer = lingerTimersRef.current.get(itemId);
    if (timer !== undefined) {
      clearTimeout(timer);
      lingerTimersRef.current.delete(itemId);
    }
    if (lingeringIds.value.has(itemId)) {
      const next = new Set(lingeringIds.value);
      next.delete(itemId);
      lingeringIds.value = next;
    }
  }

  function toggleActionItem(itemId: string) {
    const target = visibleItems.value.find((item) => item.id === itemId);
    // Completing is the rewarding beat (warm chime + firm buzz); un-completing
    // is a quiet tick.
    if (target?.status === "completed") {
      hapticTap();
      soundTick();
      // Un-checking during the linger = a changed mind; cancel the tuck.
      stopLinger(itemId);
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
        // Burst from the checkbox that cleared the list (works for keyboard
        // toggles too — we look the row up, not the pointer).
        const box = listContainerRef.current?.querySelector(
          `[data-row-id="${itemId}"] .action-item-checkbox-button`,
        )?.getBoundingClientRect();
        confettiOrigin.value = box
          ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          : undefined;
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
      // then tuck it into the done drawer (the tuckedCount effect bumps the
      // drawer toggle when it lands). Per-item timers: concurrent checkoffs
      // each get their full hold.
      const previous = lingerTimersRef.current.get(itemId);
      if (previous !== undefined) clearTimeout(previous);
      lingeringIds.value = new Set(lingeringIds.value).add(itemId);
      lingerTimersRef.current.set(
        itemId,
        setTimeout(() => {
          lingerTimersRef.current.delete(itemId);
          if (!lingeringIds.value.has(itemId)) return;
          const next = new Set(lingeringIds.value);
          next.delete(itemId);
          lingeringIds.value = next;
        }, 900) as unknown as number,
      );
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

  // The quiet add row: one sentence in, one item out. @word → assignee,
  // #tags stay inline. Focus stays in the input for the next one.
  function submitQuickAdd() {
    const raw = quickAddText.value.trim();
    if (!raw) return;
    const { description, assignee } = parseQuickAdd(raw);
    if (!description) return;
    const now = new Date().toISOString();
    publishItems([...visibleItems.value, {
      id: crypto.randomUUID(),
      conversation_id: conversationId ||
        visibleItems.value[0]?.conversation_id || "",
      description,
      assignee,
      due_date: null,
      status: "pending",
      created_at: now,
      updated_at: now,
    }]);
    quickAddText.value = "";
    soundBloom();
  }

  function startEditing(
    itemId: string,
    currentDescription: string,
    currentAssignee: string | null,
    currentDueDate: string | null,
  ) {
    // Switching rows mid-edit SAVES the previous draft — the old silent
    // cancelEdit() here was a no-warning text eater when you clicked
    // another row's pencil (blur skips saving for in-card targets).
    if (editingItemId.value && editingItemId.value !== itemId) {
      saveEdit();
    }
    editSnapshotRef.current = {
      description: currentDescription,
      assignee: currentAssignee,
      due_date: currentDueDate,
    };
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

    const existing = visibleItems.value.find(
      (item) => item.id === editingItemId.value,
    );
    // The item vanished mid-edit (deleted here or remotely) — nothing to
    // save onto, and a publish would broadcast a pointless no-op.
    if (!existing) {
      cancelEdit();
      return;
    }
    // No-change guard: click-to-edit means rows open casually — a look
    // around that touches nothing must not stamp updated_at or push a sync.
    const description = editingDescription.value.trim();
    const assignee = editingAssignee.value.trim() || null;
    const due_date = editingDueDate.value.trim() || null;
    if (
      existing.description === description &&
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

    cancelEdit();
  }

  function cancelEdit() {
    const closingId = editingItemId.value;
    editingItemId.value = null;
    editingDescription.value = "";
    editingAssignee.value = "";
    editingDueDate.value = "";
    editSnapshotRef.current = null;
    // Return focus to the row the editor came from — otherwise closing the
    // editor (Esc / Ctrl+Enter) drops keyboard focus onto <body>. Skipped
    // when another editor opened in the same beat (row switch).
    if (closingId) {
      requestAnimationFrame(() => {
        if (editingItemId.value !== null) return;
        const row = listContainerRef.current?.querySelector(
          `[data-row-id="${closingId}"]`,
        ) as HTMLElement | null;
        row?.focus();
      });
    }
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
    // Deleting a mid-linger item must also kill its timer, or the dangling
    // timeout bumps the drawer 900ms later over nothing.
    stopLinger(itemId);
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

  return (
    <>
      <Confetti
        trigger={triggerConfetti.value}
        origin={confettiOrigin.value}
        particleCount={40}
        spread={70}
      />
      <div class="w-full h-full">
        <div class="dashboard-card action-items-card">
          <div class="dashboard-card-header">
            <h3>Actions</h3>
            {
              /* card-header-actions like every other card — this header used
                its own btn--ghost cluster and read as a different species. */
            }
            <div class="card-header-actions">
              <button
                onClick={toggleSearch}
                aria-label={searchOpen.value ? "Close search" : "Search tasks"}
                aria-pressed={searchOpen.value}
                data-tip="Search"
                data-tip-align="right"
              >
                <i class="fa fa-magnifying-glass" aria-hidden="true"></i>
              </button>
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
            class="action-items-scroll overflow-y-auto focus-visible:outline-none"
            style={{
              padding: "0.5rem var(--card-padding) 0",
            }}
          >
            {sortedActionItems.value.length === 0
              ? (
                visibleItems.value.length === 0
                  ? (
                    <div class="empty-state">
                      {
                        /* Just the greeter — the quiet add row below is the
                        affordance (it's always there, just type). */
                      }
                      <div class="empty-state-face" aria-hidden="true">
                        ( • ᴗ • )
                      </div>
                    </div>
                  )
                  : (
                    // Text only — Inter, no icon badge (the big grey circle
                    // read as noise, and mono is for machine text).
                    <div class="empty-state">
                      <div class="empty-state-text">Nothing matches</div>
                    </div>
                  )
              )
              : (
                <div class="space-y-3">
                  {(() => {
                    // Tag colors re-read after a re-roll (the tick is the
                    // dependency; colors themselves live in localStorage).
                    void tagTintTick.value;
                    const lingering = lingeringIds.value;
                    const isPendingRow = (row: ActionItem) =>
                      row.status === "pending" || lingering.has(row.id);
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
                      const isEditing = editingItemId.value === item.id;
                      const canDrag = item.status === "pending" &&
                        !searchQuery.value && !isEditing;
                      const isSelected = selectedItemIndex.value === index;

                      return (
                        <div
                          key={item.id}
                          data-row-id={item.id}
                          data-sortable-id={canDrag ? item.id : undefined}
                          // Focusable (not tabbable) so the closing editor
                          // can hand keyboard focus back to its row.
                          tabIndex={-1}
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
                                  // inside THIS editor (.action-edit). The
                                  // old any-card check let a click on
                                  // ANOTHER row's pencil skip the save.
                                  if (
                                    related &&
                                    related.closest(".action-edit")
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
                                    {
                                      /* Two plain words-in fields — no
                                        dropdowns, no pickers, no presets. */
                                    }
                                    <label
                                      class={`action-edit-chip${
                                        editingAssignee.value.trim()
                                          ? " has-value"
                                          : ""
                                      }`}
                                    >
                                      <i
                                        class="fa fa-at"
                                        aria-hidden="true"
                                        // Identity echo: the sigil wears the
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
                                        placeholder="who"
                                        aria-label="Person"
                                        class="action-edit-chip-input"
                                      />
                                    </label>
                                    <label
                                      class={`action-edit-chip${
                                        editingDueDate.value.trim()
                                          ? " has-value"
                                          : ""
                                      }`}
                                    >
                                      <i
                                        class="fa fa-clock"
                                        aria-hidden="true"
                                      >
                                      </i>
                                      <input
                                        type="text"
                                        value={editingDueDate.value}
                                        onInput={(e) => {
                                          editingDueDate.value = (e
                                            .target as HTMLInputElement)
                                            .value;
                                          soundTick();
                                        }}
                                        placeholder="when"
                                        aria-label="When (any words)"
                                        class="action-edit-chip-input"
                                      />
                                    </label>
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
                                      Save
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
                                  /* Two-line clamp keeps every row the same
                                          shape. Desktop: click the words to
                                          edit them in place (hover title
                                          reads the full text). Touch: a tap
                                          UNCLAMPS to read — no keyboard pop
                                          for "just reading" — and the same
                                          tap reveals the pencil for editing. */
                                }
                                <p
                                  class={`action-item-description leading-relaxed${
                                    item.status === "completed"
                                      ? " is-completed"
                                      : ""
                                  }${
                                    expandedItemId.value === item.id
                                      ? " is-expanded"
                                      : ""
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectedItemIndex.value = index;
                                    if (matchMedia("(hover: none)").matches) {
                                      expandedItemId.value =
                                        expandedItemId.value === item.id
                                          ? null
                                          : item.id;
                                      return;
                                    }
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
                                  {
                                    /* The sentence, tokenized: #tags render
                                      as colored chips in place; tapping one
                                      re-rolls its color everywhere. */
                                  }
                                  {tokenizeActionText(item.description).map(
                                    (token, ti) =>
                                      token.kind === "tag"
                                        ? (
                                          <button
                                            key={ti}
                                            type="button"
                                            class="action-tag-chip"
                                            style={{
                                              "--tag-color": tagColor(
                                                token.value,
                                                conversationId,
                                              ),
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              bumpTagColor(
                                                token.value,
                                                conversationId,
                                              );
                                              tagTintTick.value++;
                                              soundTick();
                                            }}
                                            data-tip="Tap to recolor this tag"
                                          >
                                            #{token.value}
                                          </button>
                                        )
                                        : <span key={ti}>{token.raw}</span>,
                                  )}
                                </p>

                                {
                                  /* Metadata — only what EXISTS renders: the
                                    person as an @chip, the when as words.
                                    Empty slots show nothing. */
                                }
                                {(item.assignee || item.due_date ||
                                  editingWhenId.value === item.id) && (
                                  <div class="action-item-meta flex items-center gap-2 flex-wrap">
                                    {item.assignee && (
                                      <span
                                        class="action-person-chip"
                                        style={{
                                          "--person-color": speakerColor(
                                            item.assignee,
                                            speakers,
                                          ),
                                        }}
                                      >
                                        @{item.assignee}
                                      </span>
                                    )}
                                    {editingWhenId.value === item.id
                                      ? (
                                        <input
                                          type="text"
                                          class="action-when-input"
                                          defaultValue={item.due_date ?? ""}
                                          placeholder="when? any words"
                                          aria-label="When (any words)"
                                          ref={(el) => el?.focus()}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              updateDueDate(
                                                item.id,
                                                (e.target as HTMLInputElement)
                                                  .value.trim() || null,
                                              );
                                              editingWhenId.value = null;
                                            } else if (e.key === "Escape") {
                                              editingWhenId.value = null;
                                            }
                                          }}
                                          onBlur={(e) => {
                                            updateDueDate(
                                              item.id,
                                              (e.target as HTMLInputElement)
                                                .value.trim() || null,
                                            );
                                            editingWhenId.value = null;
                                          }}
                                        />
                                      )
                                      : item.due_date && (
                                        <button
                                          type="button"
                                          class="action-item-chip action-item-chip--btn flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors has-value"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            editingWhenId.value = item.id;
                                          }}
                                          data-tip="Change when"
                                        >
                                          <i class="fa fa-clock text-xs"></i>
                                          <span>
                                            {formatDue(item.due_date)}
                                          </span>
                                        </button>
                                      )}
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
                                  // aria-live: the checked_reason paragraph
                                  // mounts on tap — announce it.
                                  <div
                                    class="action-item-ai"
                                    aria-live="polite"
                                  >
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
                                      title="This updated itself from the conversation — tap for why"
                                    >
                                      ✨ {item.status === "completed"
                                        ? "checked off for you"
                                        : "reopened for you"}
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
                              <div class="action-item-actions">
                                {!item.due_date &&
                                  item.status === "pending" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      editingWhenId.value = item.id;
                                    }}
                                    class="action-item-icon-btn"
                                    aria-label={`Add a when to "${item.description}"`}
                                    title="When? (any words)"
                                  >
                                    <i
                                      class="fa fa-clock text-xs"
                                      aria-hidden="true"
                                    >
                                    </i>
                                  </button>
                                )}
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

                              {/* Checkbox */}
                              <div class="flex items-center pt-1">
                                {
                                  <button
                                    type="button"
                                    // Mouse toggles on pointerdown (snappy);
                                    // touch/pen wait for the click so a scroll
                                    // flick that lands here can't check it.
                                    onPointerDown={(event) => {
                                      event.stopPropagation();
                                      if (event.pointerType === "mouse") {
                                        event.preventDefault();
                                        checkboxHandledByPointer.current = true;
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
                                }
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
            /* The quiet add row — always here, just type. One sentence in,
              one item out: @word names the person, #tags color themselves.
              Enter keeps focus for the next thought. */
          }
          <form
            class="action-quickadd"
            onSubmit={(e) => {
              e.preventDefault();
              submitQuickAdd();
            }}
          >
            <input
              type="text"
              class="action-quickadd-input"
              value={quickAddText.value}
              onInput={(e) => {
                quickAddText.value = (e.target as HTMLInputElement).value;
              }}
              placeholder="add one…"
              aria-label="Add an action item — @word names the person, #tags color themselves"
              data-tip="@who and #tags go right in the sentence"
              maxLength={500}
            />
          </form>
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
