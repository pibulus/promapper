/**
 * usePointerSortable — pointer-based drag-to-reorder for vertical lists.
 *
 * One Pointer Events codepath for mouse + touch + pen, porting the feel that
 * ziplist's list reorder dialed in over time:
 *   - desktop: grab the drag handle, drag immediately
 *   - touch:   long-press a row to grab (so dragging doesn't fight scroll), and
 *              a small pre-grab move cancels it so a scroll-swipe escapes
 *   - both:    the grabbed row lifts (scale + shadow) and follows the pointer,
 *              the others slide out of the way (FLIP), auto-scroll near edges,
 *              haptics on grab/drop, and the row settles on drop
 *
 * Data-driven: the component renders rows in `previewOrder.value` (or its own
 * order when null), so Preact always owns the DOM — we never move nodes by hand.
 * FLIP animates the real re-renders. Zero dependencies.
 *
 * Wiring:
 *   const sortable = usePointerSortable({ orderedIds, onReorder });
 *   const ids = sortable.previewOrder.value ?? defaultIds;   // render in this order
 *   <row data-sortable-id={id} onPointerDown={(e)=>sortable.onRowPointerDown(e,id)}>
 *     <handle onPointerDown={(e)=>sortable.onHandlePointerDown(e,id)} />
 *   read sortable.draggingId / sortable.settlingId for styling.
 */

import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { hapticSnap, hapticTap } from "./haptics.ts";

const LONG_PRESS_MS = 220;
const CANCEL_MOVE_PX = 10;
const EDGE_ZONE_PX = 64;
const EDGE_SPEED_PX = 12;
const SETTLE_MS = 260;

interface SortableOptions {
  /** Stable ids in current visual order (the reorderable subset). */
  orderedIds: () => string[];
  /** Called with the new id order once a drag commits to a new position. */
  onReorder: (ids: string[]) => void;
  rowSelector?: string;
}

export function usePointerSortable(options: SortableOptions) {
  const { orderedIds, onReorder, rowSelector = "[data-sortable-id]" } = options;

  const draggingId = useSignal<string | null>(null);
  const settlingId = useSignal<string | null>(null);
  // While dragging, the order the component should render in. null = not dragging.
  const previewOrder = useSignal<string[] | null>(null);

  const session = useRef<
    {
      id: string;
      pointerId: number;
      startY: number;
      rowEl: HTMLElement;
      container: HTMLElement;
      scroller: HTMLElement | null;
      fromIndex: number;
      currentIndex: number;
      autoScrollRAF: number | null;
      autoScrollDir: number;
    } | null
  >(null);

  const pending = useRef<
    {
      pointerId: number;
      startX: number;
      startY: number;
      timer: number;
    } | null
  >(null);

  function rows(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(rowSelector),
    ).filter((el) => el.dataset.sortableId);
  }

  function captureTops(container: HTMLElement): Map<string, number> {
    const tops = new Map<string, number>();
    for (const el of rows(container)) {
      tops.set(el.dataset.sortableId!, el.getBoundingClientRect().top);
    }
    return tops;
  }

  /** FLIP: from the just-captured `before` tops to wherever the rows are now. */
  function flip(
    container: HTMLElement,
    before: Map<string, number>,
    liftedId: string,
  ) {
    for (const el of rows(container)) {
      const id = el.dataset.sortableId!;
      if (id === liftedId) continue;
      const prevTop = before.get(id);
      if (prevTop == null) continue;
      const delta = prevTop - el.getBoundingClientRect().top;
      if (!delta) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)";
        el.style.transform = "";
      });
    }
  }

  function nearestScroller(el: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const oy = getComputedStyle(node).overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        node.scrollHeight > node.clientHeight
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function beginDrag(
    id: string,
    pointerId: number,
    clientY: number,
    rowEl: HTMLElement,
  ) {
    const container = rowEl.parentElement;
    if (!container) return;
    const ids = orderedIds();
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return;

    session.current = {
      id,
      pointerId,
      startY: clientY,
      rowEl,
      container,
      scroller: nearestScroller(rowEl),
      fromIndex,
      currentIndex: fromIndex,
      autoScrollRAF: null,
      autoScrollDir: 0,
    };

    previewOrder.value = [...ids];
    draggingId.value = id;
    hapticTap();

    rowEl.style.zIndex = "30";
    rowEl.classList.add("is-lifting");

    globalThis.addEventListener("pointermove", onMove, { passive: false });
    globalThis.addEventListener("pointerup", onUp);
    globalThis.addEventListener("pointercancel", onUp);
    globalThis.addEventListener("keydown", onDragKeyDown);
  }

  // Escape aborts the drag — routed through the pointercancel path so the
  // reorder reverts instead of committing.
  function onDragKeyDown(event: KeyboardEvent) {
    const s = session.current;
    if (!s || event.key !== "Escape") return;
    event.preventDefault();
    onUp(
      { pointerId: s.pointerId, type: "pointercancel" } as PointerEvent,
    );
  }

  function onMove(event: PointerEvent) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    event.preventDefault();

    // The lifted row follows the pointer (data position stays put; transform
    // gives the live drag — measured from its current laid-out top).
    const dy = event.clientY - s.startY;
    s.rowEl.style.transform = `translateY(${dy}px) scale(1.03)`;

    // Target slot from sibling midpoints (exclude the lifted row).
    const others = rows(s.container).filter((el) =>
      el.dataset.sortableId !== s.id
    );
    let targetAmongOthers = others.length;
    for (let i = 0; i < others.length; i++) {
      const rect = others[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        targetAmongOthers = i;
        break;
      }
    }

    if (targetAmongOthers !== s.currentIndex) {
      const before = captureTops(s.container);
      // Rebuild preview order: remove lifted id, insert at the target slot.
      const current = previewOrder.value ?? orderedIds();
      const without = current.filter((id) => id !== s.id);
      without.splice(targetAmongOthers, 0, s.id);
      previewOrder.value = without; // triggers Preact re-render in new order
      s.currentIndex = targetAmongOthers;
      hapticTap();
      // FLIP after the re-render paints.
      requestAnimationFrame(() => {
        if (session.current) flip(s.container, before, s.id);
        // keep the lifted row glued to the pointer after the reflow
        const dy2 = event.clientY - s.startY;
        s.rowEl.style.transition = "none";
        s.rowEl.style.transform = `translateY(${dy2}px) scale(1.03)`;
      });
    }

    updateAutoScroll(event.clientY);
  }

  function updateAutoScroll(clientY: number) {
    const s = session.current;
    if (!s || !s.scroller) return;
    const rect = s.scroller.getBoundingClientRect();
    let dir = 0;
    if (clientY < rect.top + EDGE_ZONE_PX) dir = -1;
    else if (clientY > rect.bottom - EDGE_ZONE_PX) dir = 1;

    s.autoScrollDir = dir;
    if (dir !== 0 && s.autoScrollRAF == null) {
      const step = () => {
        const sess = session.current;
        if (!sess || !sess.scroller || sess.autoScrollDir === 0) {
          if (sess) sess.autoScrollRAF = null;
          return;
        }
        sess.scroller.scrollTop += sess.autoScrollDir * EDGE_SPEED_PX;
        sess.autoScrollRAF = requestAnimationFrame(step);
      };
      s.autoScrollRAF = requestAnimationFrame(step);
    }
  }

  function onUp(event: PointerEvent) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;

    globalThis.removeEventListener("pointermove", onMove);
    globalThis.removeEventListener("pointerup", onUp);
    globalThis.removeEventListener("pointercancel", onUp);
    globalThis.removeEventListener("keydown", onDragKeyDown);
    if (s.autoScrollRAF != null) cancelAnimationFrame(s.autoScrollRAF);

    // Spring the lifted row's transform back to zero in its (new) slot.
    s.rowEl.style.transition =
      "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    s.rowEl.style.transform = "";
    const rowEl = s.rowEl;
    setTimeout(() => {
      rowEl.style.zIndex = "";
      rowEl.style.transition = "";
      rowEl.style.transform = "";
      rowEl.classList.remove("is-lifting");
    }, 210);

    draggingId.value = null;

    // pointercancel = the browser stole the gesture (scroll/zoom/palm) — that
    // is NOT a drop. Revert instead of committing a half-finished reorder.
    const cancelled = event.type === "pointercancel";
    const committed = !cancelled && s.currentIndex !== s.fromIndex;
    const finalOrder = previewOrder.value ?? orderedIds();
    const id = s.id;
    session.current = null;
    previewOrder.value = null; // hand rendering authority back to the data

    if (committed) {
      hapticSnap();
      settlingId.value = id;
      setTimeout(() => {
        if (settlingId.value === id) settlingId.value = null;
      }, SETTLE_MS);
      onReorder(finalOrder);
    }
  }

  // --- entry points -------------------------------------------------------

  function onHandlePointerDown(event: PointerEvent, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "touch") return; // touch grabs via row long-press
    const rowEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      rowSelector,
    );
    if (!rowEl) return;
    event.preventDefault();
    beginDrag(id, event.pointerId, event.clientY, rowEl);
  }

  function onRowPointerDown(event: PointerEvent, id: string) {
    if (event.pointerType !== "touch") return;
    const rowEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      rowSelector,
    );
    if (!rowEl) return;

    clearPending();
    const timer = setTimeout(() => {
      if (!pending.current) return;
      beginDrag(id, event.pointerId, pending.current.startY, rowEl);
      pending.current = null;
    }, LONG_PRESS_MS) as unknown as number;

    pending.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
    globalThis.addEventListener("pointermove", onPendingMove, {
      passive: true,
    });
    globalThis.addEventListener("pointerup", clearPending);
    globalThis.addEventListener("pointercancel", clearPending);
  }

  function onPendingMove(event: PointerEvent) {
    const p = pending.current;
    if (!p || event.pointerId !== p.pointerId) return;
    if (
      Math.abs(event.clientX - p.startX) > CANCEL_MOVE_PX ||
      Math.abs(event.clientY - p.startY) > CANCEL_MOVE_PX
    ) {
      clearPending();
    }
  }

  function clearPending() {
    const p = pending.current;
    if (p) clearTimeout(p.timer);
    pending.current = null;
    globalThis.removeEventListener("pointermove", onPendingMove);
    globalThis.removeEventListener("pointerup", clearPending);
    globalThis.removeEventListener("pointercancel", clearPending);
  }

  return {
    draggingId,
    settlingId,
    previewOrder,
    onHandlePointerDown,
    onRowPointerDown,
  };
}
