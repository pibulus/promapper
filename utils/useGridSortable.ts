/**
 * useGridSortable — pointer drag-to-rearrange for the dashboard grid.
 *
 * The 2-D sibling of usePointerSortable (the ziplist-feel list hook): same
 * data-driven architecture — the component renders cards in `previewOrder`,
 * Preact always owns the DOM, FLIP animates the real re-renders — extended
 * for a dense CSS grid where cards move on both axes and every reorder
 * re-packs the whole board (grid-auto-flow: dense is the masonry engine).
 *
 * The draggable unit is the CARD — including cards living inside a stacked
 * pillar. Lifting a card renders it solo (planCells soloMembers), which can
 * REMOUNT it out of its pillar; beginDrag re-acquires the fresh element one
 * frame later and keeps it glued under the pointer with a base offset.
 * Bystander cards regrouping mid-drag (a pillar splitting open as you hover
 * into it) also remount — FLIP measures by id, not element, so everything
 * still glides.
 *
 *   - mouse/pen: grab a card by its header (or the grip) and drag right away
 *   - touch:     drag by the grip — a dedicated handle, so no long-press and
 *                no fight with page scroll (the grip is touch-action: none)
 *   - a short cooldown between reorders keeps the dense re-pack from
 *     chain-reacting under a stationary pointer
 *   - drop AND cancel both glide every card home; a real drop adds the
 *     spring, hapticSnap + soundSettle, and persists through onReorder
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
/** Dense re-packing moves cards under a stationary pointer; without a beat
 * between reorders the board can churn. One beat = one settled read. */
const REORDER_COOLDOWN_MS = 120;
const LIFT_TRANSFORM = "scale(1.02) rotate(0.4deg)";
const FLIP_EASE = "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)";
const DROP_EASE = "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)";

interface GridSortableOptions {
  /** Stable card ids in current visual order (the reorderable set). */
  cellIds: () => string[];
  /** Called with the new card-id order once a drag/nudge commits. */
  onReorder: (ids: string[]) => void;
  /** A still, quick release on the grip — "press to expand". Mutate state
   * only; the hook folds the change into the drop glide. */
  onTap?: (id: string) => void;
  cellSelector?: string;
  /** The grid that owns every card, at any nesting depth. */
  containerSelector?: string;
}

interface Point {
  left: number;
  top: number;
}

export function useGridSortable(options: GridSortableOptions) {
  const {
    cellIds,
    onReorder,
    onTap,
    cellSelector = "[data-cell-id]",
    containerSelector = ".dashboard-grid",
  } = options;

  const draggingId = useSignal<string | null>(null);
  const settlingId = useSignal<string | null>(null);
  // While dragging, the card order the component should render in.
  const previewOrder = useSignal<string[] | null>(null);

  const session = useRef<
    {
      id: string;
      pointerId: number;
      startX: number;
      startY: number;
      startedAt: number;
      source: "grip" | "cell";
      cellEl: HTMLElement;
      container: HTMLElement;
      scroller: HTMLElement | null; // null = the page itself scrolls
      // Lifting can remount the card out of a pillar into its own cell; the
      // base offset keeps its visual exactly where it was grabbed.
      baseDx: number;
      baseDy: number;
      lastDx: number;
      lastDy: number;
      lastReorderAt: number;
      currentIndex: number;
      autoScrollRAF: number | null;
      autoScrollDir: number;
    } | null
  >(null);

  const reducedMotion = () =>
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cardQuery(id: string): string {
    return `[data-cell-id="${CSS.escape(id)}"]`;
  }

  function cells(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(cellSelector),
    ).filter((el) => el.dataset.cellId);
  }

  function captureRects(container: HTMLElement): Map<string, Point> {
    const rects = new Map<string, Point>();
    for (const el of cells(container)) {
      const r = el.getBoundingClientRect();
      rects.set(el.dataset.cellId!, { left: r.left, top: r.top });
    }
    return rects;
  }

  /** FLIP: from the just-captured `before` positions to wherever the cards
   * are now — both axes, measured by id so remounted cards still glide. */
  function flip(
    container: HTMLElement,
    before: Map<string, Point>,
    skipId: string | null,
    ease: string,
  ) {
    if (reducedMotion()) return;
    for (const el of cells(container)) {
      const id = el.dataset.cellId!;
      if (id === skipId) continue;
      const prev = before.get(id);
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

  function beginDrag(
    id: string,
    event: PointerEvent,
    cellEl: HTMLElement,
    source: "grip" | "cell",
  ) {
    if (session.current) return;
    const container = cellEl.closest<HTMLElement>(containerSelector);
    if (!container) return;
    const ids = cellIds();
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return;

    const grabRect = cellEl.getBoundingClientRect();
    const before = captureRects(container);

    session.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      source,
      cellEl,
      container,
      scroller: nearestScroller(cellEl),
      baseDx: 0,
      baseDy: 0,
      lastDx: 0,
      lastDy: 0,
      lastReorderAt: 0,
      currentIndex: fromIndex,
      autoScrollRAF: null,
      autoScrollDir: 0,
    };

    // This render can remount the grabbed card out of its pillar (soloed)
    // and shift its old pillar-mate — re-acquire and FLIP one frame later.
    batch(() => {
      previewOrder.value = [...ids];
      draggingId.value = id;
    });
    hapticTap();

    requestAnimationFrame(() => {
      const s = session.current;
      if (!s || s.id !== id) return;
      const fresh = s.container.querySelector<HTMLElement>(cardQuery(id));
      if (fresh) s.cellEl = fresh;
      const now = s.cellEl.getBoundingClientRect();
      s.baseDx = grabRect.left - now.left;
      s.baseDy = grabRect.top - now.top;
      s.cellEl.style.zIndex = "30";
      applyLift(s.cellEl, s.baseDx + s.lastDx, s.baseDy + s.lastDy);
      flip(s.container, before, id, FLIP_EASE);
    });

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

    // The lifted card follows the pointer (its data position stays put).
    s.lastDx = event.clientX - s.startX;
    s.lastDy = event.clientY - s.startY;
    applyLift(s.cellEl, s.baseDx + s.lastDx, s.baseDy + s.lastDy);

    const now = Date.now();
    if (now - s.lastReorderAt >= REORDER_COOLDOWN_MS) {
      // Target slot: the card under the pointer takes the hit — including a
      // card inside a pillar, which is how you drop INTO one. Past the
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
        const before = captureRects(s.container);
        const current = previewOrder.value ?? cellIds();
        const without = current.filter((cid) => cid !== s.id);
        without.splice(target, 0, s.id);
        previewOrder.value = without; // Preact re-renders in the new order
        s.currentIndex = target;
        s.lastReorderAt = now;
        hapticTap();
        // FLIP after the re-render paints; the grabbed card can remount
        // when regrouping touches it, so re-acquire before re-gluing.
        requestAnimationFrame(() => {
          const sess = session.current;
          if (!sess) return;
          const fresh = sess.container.querySelector<HTMLElement>(
            cardQuery(sess.id),
          );
          if (fresh && fresh !== sess.cellEl) {
            sess.cellEl = fresh;
            sess.cellEl.style.zIndex = "30";
          }
          flip(sess.container, before, sess.id, FLIP_EASE);
          applyLift(
            sess.cellEl,
            sess.baseDx + sess.lastDx,
            sess.baseDy + sess.lastDy,
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
    const moved = !cancelled && finalOrder.join("|") !== cellIds().join("|");
    // A still, quick release on the grip = "press to expand", not a drag.
    const tapped = !cancelled && !moved && s.source === "grip" &&
      Date.now() - s.startedAt < 400 &&
      Math.abs(s.lastDx) < 5 && Math.abs(s.lastDy) < 5;
    const { id, cellEl, container } = s;
    session.current = null;

    // Drop, cancel, and tap-resize share one glide: capture every card (the
    // grabbed one at its lifted spot), hand rendering back to the data —
    // which may resize or regroup cards — then FLIP everyone home.
    const before = captureRects(container);
    cellEl.style.transition = "none";
    cellEl.style.transform = "";
    batch(() => {
      draggingId.value = null;
      previewOrder.value = null;
      if (moved) onReorder(finalOrder);
      if (tapped) onTap?.(id);
    });
    if (moved) {
      hapticSnap();
      soundSettle();
    } else if (tapped) {
      hapticTap();
    }
    settlingId.value = id; // keeps the landed card on top while it glides
    requestAnimationFrame(() => {
      flip(container, before, null, DROP_EASE);
    });
    setTimeout(() => {
      if (settlingId.value === id) settlingId.value = null;
      cellEl.style.zIndex = "";
      cellEl.style.transition = "";
      const live = container.querySelector<HTMLElement>(cardQuery(id));
      if (live) {
        live.style.zIndex = "";
        live.style.transition = "";
      }
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
    beginDrag(id, event, cellEl, "cell");
  }

  /** The grip is a dedicated handle: every pointer type drags immediately
   * (and a still, quick release fires onTap — press to expand). */
  function onGripPointerDown(event: PointerEvent, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const cellEl = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      cellSelector,
    );
    if (!cellEl) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(id, event, cellEl, "grip");
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

    const container = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      containerSelector,
    );
    const before = container ? captureRects(container) : null;
    onReorder(next);
    hapticTap();
    if (container && before) {
      requestAnimationFrame(() => {
        flip(container, before, null, FLIP_EASE);
        // Regrouping can remount the nudged card — keep focus on its grip.
        container.querySelector<HTMLElement>(`${cardQuery(id)} .board-grip`)
          ?.focus();
      });
    }
  }

  /** Run a state change (resize, toggle) with the board FLIP-gliding to its
   * new packing — same spring as a drop. */
  function animateReflow(container: HTMLElement, mutate: () => void) {
    const before = captureRects(container);
    mutate();
    requestAnimationFrame(() => flip(container, before, null, DROP_EASE));
  }

  return {
    draggingId,
    settlingId,
    previewOrder,
    onCellPointerDown,
    onGripPointerDown,
    onGripKeyDown,
    animateReflow,
  };
}
