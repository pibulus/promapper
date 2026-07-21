/**
 * useGridSortable — pointer drag-to-rearrange for the dashboard grid.
 *
 * The 2-D sibling of usePointerSortable (the ziplist-feel list hook): same
 * data-driven architecture — the component renders cells in `previewOrder`,
 * Preact always owns the DOM, FLIP animates the real re-renders — extended
 * for a dense CSS grid where cells move on both axes and every reorder
 * re-packs the whole board (grid-auto-flow: dense is the masonry engine).
 *
 *   - mouse/pen: grab a card by its header (or the grip) and drag right away
 *   - touch:     drag by the grip — a dedicated handle, so no long-press and
 *                no fight with page scroll (the grip is touch-action: none)
 *   - the grabbed cell lifts and follows the pointer; the others re-pack
 *     around it and FLIP-slide to their new homes; a short cooldown between
 *     reorders keeps the dense re-pack from chain-reacting under the pointer
 *   - drop: everyone springs to their settled spot — measured at member level
 *     ([data-flip-id]) so cards gliding into or out of a shared pillar
 *     animate the regroup instead of teleporting — with haptics + soft thunk
 *   - the grip is a real button: arrow keys nudge the card through the order
 *   - Escape aborts; pointercancel reverts (the browser stole the gesture)
 */

import { batch, useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";
import { hapticSnap, hapticTap } from "./haptics.ts";
import { soundSettle } from "./sound.ts";

const EDGE_ZONE_PX = 72;
const EDGE_SPEED_PX = 14;
const SETTLE_MS = 400;
/** Dense re-packing moves cells under a stationary pointer; without a beat
 * between reorders the board can churn. One beat = one settled read. */
const REORDER_COOLDOWN_MS = 120;
const LIFT_TRANSFORM = "scale(1.02) rotate(0.4deg)";
const FLIP_EASE = "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)";
const DROP_EASE = "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)";

interface GridSortableOptions {
  /** Stable cell ids in current visual order (the reorderable set). */
  cellIds: () => string[];
  /** Called with the new cell-id order once a drag/nudge commits. */
  onReorder: (ids: string[]) => void;
  cellSelector?: string;
  /** Finer-grained elements to animate on commit (defaults to cells). */
  flipSelector?: string;
}

interface Point {
  left: number;
  top: number;
}

export function useGridSortable(options: GridSortableOptions) {
  const {
    cellIds,
    onReorder,
    cellSelector = "[data-cell-id]",
    flipSelector = "[data-flip-id]",
  } = options;

  const draggingId = useSignal<string | null>(null);
  const settlingId = useSignal<string | null>(null);
  // While dragging, the cell order the component should render in.
  const previewOrder = useSignal<string[] | null>(null);

  const session = useRef<
    {
      id: string;
      pointerId: number;
      startX: number;
      startY: number;
      cellEl: HTMLElement;
      container: HTMLElement;
      scroller: HTMLElement | null; // null = the page itself scrolls
      lastReorderAt: number;
      currentIndex: number;
      autoScrollRAF: number | null;
      autoScrollDir: number;
    } | null
  >(null);

  const reducedMotion = () =>
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function keyOf(el: HTMLElement): string | undefined {
    return el.dataset.cellId ?? el.dataset.flipId;
  }

  function cells(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(cellSelector),
    ).filter((el) => el.dataset.cellId);
  }

  function captureRects(
    container: HTMLElement,
    selector: string,
  ): Map<string, Point> {
    const rects = new Map<string, Point>();
    for (const el of container.querySelectorAll<HTMLElement>(selector)) {
      const key = keyOf(el);
      if (!key) continue;
      const r = el.getBoundingClientRect();
      rects.set(key, { left: r.left, top: r.top });
    }
    return rects;
  }

  /** FLIP: from the just-captured `before` positions to wherever the
   * elements are now — both axes, since the grid re-packs in 2-D. */
  function flip(
    container: HTMLElement,
    before: Map<string, Point>,
    selector: string,
    skipId: string | null,
    ease: string,
  ) {
    if (reducedMotion()) return;
    for (const el of container.querySelectorAll<HTMLElement>(selector)) {
      const key = keyOf(el);
      if (!key || key === skipId) continue;
      const prev = before.get(key);
      if (!prev) continue;
      const rect = el.getBoundingClientRect();
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (!dx && !dy) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = ease;
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

  function applyLift(el: HTMLElement, dx: number, dy: number) {
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) ${LIFT_TRANSFORM}`;
  }

  function beginDrag(id: string, event: PointerEvent, cellEl: HTMLElement) {
    if (session.current) return;
    const container = cellEl.parentElement;
    if (!container) return;
    const ids = cellIds();
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return;

    session.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cellEl,
      container,
      scroller: nearestScroller(cellEl),
      lastReorderAt: 0,
      currentIndex: fromIndex,
      autoScrollRAF: null,
      autoScrollDir: 0,
    };

    previewOrder.value = [...ids];
    draggingId.value = id; // the render adds .is-lifting
    hapticTap();
    cellEl.style.zIndex = "30";
    cellEl.style.transition = "none";

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
    onUp({ pointerId: s.pointerId, type: "pointercancel" } as PointerEvent);
  }

  function onMove(event: PointerEvent) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    event.preventDefault();

    // The lifted cell follows the pointer (its data position stays put).
    applyLift(s.cellEl, event.clientX - s.startX, event.clientY - s.startY);

    const now = Date.now();
    if (now - s.lastReorderAt >= REORDER_COOLDOWN_MS) {
      // Target slot: the cell under the pointer takes the hit; past the
      // bottom of everything means "the end of the board".
      const others = cells(s.container).filter(
        (el) => el.dataset.cellId !== s.id,
      );
      let target = -1;
      let pastAll = others.length > 0;
      for (let i = 0; i < others.length; i++) {
        const r = others[i].getBoundingClientRect();
        if (event.clientY < r.bottom) pastAll = false;
        if (
          event.clientX >= r.left && event.clientX <= r.right &&
          event.clientY >= r.top && event.clientY <= r.bottom
        ) {
          target = i;
          break;
        }
      }
      if (target < 0 && pastAll) target = others.length;

      if (target >= 0 && target !== s.currentIndex) {
        const before = captureRects(s.container, cellSelector);
        const current = previewOrder.value ?? cellIds();
        const without = current.filter((cid) => cid !== s.id);
        without.splice(target, 0, s.id);
        previewOrder.value = without; // Preact re-renders in the new order
        s.currentIndex = target;
        s.lastReorderAt = now;
        hapticTap();
        // FLIP after the re-render paints; keep the lifted cell glued to
        // the pointer through the reflow.
        requestAnimationFrame(() => {
          if (!session.current) return;
          flip(s.container, before, cellSelector, s.id, FLIP_EASE);
          applyLift(
            s.cellEl,
            event.clientX - s.startX,
            event.clientY - s.startY,
          );
        });
      }
    }

    updateAutoScroll(event.clientY);
  }

  function updateAutoScroll(clientY: number) {
    const s = session.current;
    if (!s) return;
    const bounds = s.scroller
      ? s.scroller.getBoundingClientRect()
      : { top: 0, bottom: globalThis.innerHeight };
    let dir = 0;
    if (clientY < bounds.top + EDGE_ZONE_PX) dir = -1;
    else if (clientY > bounds.bottom - EDGE_ZONE_PX) dir = 1;

    s.autoScrollDir = dir;
    if (dir !== 0 && s.autoScrollRAF == null) {
      const step = () => {
        const sess = session.current;
        if (!sess || sess.autoScrollDir === 0) {
          if (sess) sess.autoScrollRAF = null;
          return;
        }
        const scroller = sess.scroller ?? document.scrollingElement;
        if (scroller) scroller.scrollTop += sess.autoScrollDir * EDGE_SPEED_PX;
        sess.autoScrollRAF = requestAnimationFrame(step);
      };
      s.autoScrollRAF = requestAnimationFrame(step);
    }
  }

  function teardown() {
    globalThis.removeEventListener("pointermove", onMove);
    globalThis.removeEventListener("pointerup", onUp);
    globalThis.removeEventListener("pointercancel", onUp);
    globalThis.removeEventListener("keydown", onDragKeyDown);
  }

  function onUp(event: PointerEvent) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    teardown();
    if (s.autoScrollRAF != null) cancelAnimationFrame(s.autoScrollRAF);

    // pointercancel = the browser stole the gesture (scroll/zoom/palm) — not
    // a drop. Revert instead of committing a half-finished rearrange.
    const cancelled = event.type === "pointercancel";
    const finalOrder = previewOrder.value ?? cellIds();
    const moved = !cancelled &&
      finalOrder.join("|") !== cellIds().join("|");
    const { id, cellEl, container } = s;
    session.current = null;
    draggingId.value = null;

    if (!moved) {
      // Spring back into the unchanged slot.
      previewOrder.value = null;
      if (reducedMotion()) {
        cellEl.style.transition = "none";
        cellEl.style.transform = "";
        cellEl.style.zIndex = "";
      } else {
        cellEl.style.transition = DROP_EASE;
        cellEl.style.transform = "";
        setTimeout(() => {
          cellEl.style.zIndex = "";
          cellEl.style.transition = "";
        }, SETTLE_MS);
      }
      return;
    }

    // Commit. Capture member positions first (the dragged one at its lifted
    // spot), clear the drag transform, hand the new order to the data, then
    // FLIP everyone — including members regrouping into or out of shared
    // pillars — so the whole board glides to its settled shape.
    const before = captureRects(container, flipSelector);
    cellEl.style.transition = "none";
    cellEl.style.transform = "";
    batch(() => {
      previewOrder.value = null;
      onReorder(finalOrder);
    });
    hapticSnap();
    soundSettle();
    settlingId.value = id; // keeps the landed cell on top while it glides
    requestAnimationFrame(() => {
      flip(container, before, flipSelector, null, DROP_EASE);
    });
    setTimeout(() => {
      if (settlingId.value === id) settlingId.value = null;
      cellEl.style.zIndex = "";
      cellEl.style.transition = "";
    }, SETTLE_MS);
  }

  // --- entry points -------------------------------------------------------

  /** Mouse/pen drag from a card header (buttons and fields still click). */
  function onCellPointerDown(event: PointerEvent, id: string) {
    if (event.pointerType === "touch") return; // touch drags by the grip
    if (event.button !== 0 || session.current) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".dashboard-card-header")) return;
    if (
      target.closest(
        "button, a, input, textarea, select, [contenteditable=true], [data-no-drag]",
      )
    ) {
      return;
    }
    const cellEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      cellSelector,
    );
    if (!cellEl) return;
    event.preventDefault();
    beginDrag(id, event, cellEl);
  }

  /** The grip is a dedicated handle: every pointer type drags immediately. */
  function onGripPointerDown(event: PointerEvent, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const cellEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      cellSelector,
    );
    if (!cellEl) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(id, event, cellEl);
  }

  /** Arrow keys on the grip nudge the card one slot through the order. */
  function onGripKeyDown(event: KeyboardEvent, id: string) {
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? -1
      : event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : 0;
    if (!delta || session.current) return;
    event.preventDefault();
    const ids = cellIds();
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);

    const cellEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      cellSelector,
    );
    const container = cellEl?.parentElement ?? null;
    const before = container ? captureRects(container, flipSelector) : null;
    onReorder(next);
    hapticTap();
    if (container && before) {
      requestAnimationFrame(() => {
        flip(container, before, flipSelector, null, FLIP_EASE);
      });
    }
  }

  return {
    draggingId,
    settlingId,
    previewOrder,
    onCellPointerDown,
    onGripPointerDown,
    onGripKeyDown,
  };
}
