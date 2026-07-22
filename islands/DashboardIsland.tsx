/**
 * Dashboard Island - Simplified with Extracted Components
 *
 * Clean grid layout coordinating cards. Every card is a draggable cell
 * (useGridSortable): grab a header, the dense grid re-packs around you,
 * the arrangement persists in @signals/boardOrderStore.
 */

import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import { renameSpeaker, setActionItems } from "@signals/actionItemsStore.ts";
import {
  clearCompletedActionItems,
  completeAllActionItems,
} from "@core/orchestration/conversation-ops.ts";
import { liveSession } from "@signals/liveSessionStore.ts";
import { sendWhiteboardUpdate } from "@signals/partyService.ts";
import { remoteWhiteboardUpdate } from "@signals/partyConnectionStore.ts";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { showToast } from "@utils/toast.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import TranscriptCard from "../components/TranscriptCard.tsx";
import TranscriptBack from "../components/TranscriptBack.tsx";
import SummaryCard from "../components/SummaryCard.tsx";
import SummaryBack from "../components/SummaryBack.tsx";
import ActionItemsCard from "../components/ActionItemsCard.tsx";
import ActionItemsBack from "../components/ActionItemsBack.tsx";
import {
  listRecordings,
  type StoredRecording,
} from "@core/storage/recordingsDB.ts";
import {
  getAllConversations,
  saveConversation,
} from "../core/storage/localStorage.ts";
import { serializeBackup } from "../core/storage/backup.ts";
import TopicVisualizationsCard from "./TopicVisualizationsCard.tsx";
import SharedWhiteboard from "./SharedWhiteboard.tsx";
import BodyPortal from "../components/BodyPortal.tsx";
import FlipCard from "./FlipCard.tsx";
import ReaderModal from "./ReaderModal.tsx";
import ModuleRack from "./ModuleRack.tsx";
import { moduleRegistry } from "./modules/moduleRegistry.ts";
import NotesModule from "./modules/NotesModule.tsx";
import TakesModule from "./modules/TakesModule.tsx";
import { enabledModules } from "@signals/moduleStore.ts";
import {
  boardOrder,
  boardSizes,
  setBoardOrder,
  setCardSize,
} from "@signals/boardOrderStore.ts";
import {
  type BoardSize,
  type CellPlan,
  CORE_CELL_IDS,
  effectiveOrder,
  mergeVisibleOrder,
  NEXT_SIZE,
  planCells,
} from "@utils/boardLayout.ts";
import { useGridSortable } from "@utils/useGridSortable.ts";

/** Minimum seconds between auto-draws so it doesn't fire too often. */
const AUTO_DRAW_COOLDOWN_MS = 30_000;
/** Fire an auto-draw every Nth transcript chunk. */
const AUTO_DRAW_EVERY = 3;

/** A card's row-span size: user override, else its designed default. The
 * canvas returns undefined — full row, fixed height, not resizable. */
function sizeOf(id: string): BoardSize | undefined {
  if (id === "canvas") return undefined;
  const override = boardSizes.value[id];
  if (override) return override;
  if ((CORE_CELL_IDS as readonly string[]).includes(id)) return "medium";
  return moduleRegistry.find((m) => m.id === id)?.size ?? "small";
}

/** The board as data: the full id order (hidden modules included) and the
 * visible cards in user order. Cards are what you drag; the flat id list is
 * what persists (@signals/boardOrderStore). During a drag the preview's
 * card order is the render truth. */
function planBoard(
  previewCards?: string[] | null,
): { full: string[]; cells: CellPlan[] } {
  const defaults = [...CORE_CELL_IDS, ...moduleRegistry.map((m) => m.id)];
  const full = effectiveOrder(boardOrder.value, defaults);
  const core = new Set<string>(CORE_CELL_IDS);
  const enabled = enabledModules.value;
  const visible = previewCards
    ? previewCards.flatMap((cid) => cid.split("+"))
    : full.filter((id) => core.has(id) || enabled.includes(id));
  return { full, cells: planCells(visible, sizeOf) };
}

/** Tap the grip: small → medium → tall → small. Sizes persist per card
 * (the pair stores under its anchor member). */
function cycleSize(cardId: string) {
  const anchor = cardId.split("+")[0];
  const current = sizeOf(anchor);
  if (!current) return; // the canvas doesn't resize
  setCardSize(anchor, NEXT_SIZE[current]);
}

export default function DashboardIsland() {
  // Throttle whiteboard broadcasts during active drawing: Excalidraw's
  // onChange fires at pointer-move rate and scenes run up to 500KB, so an
  // ungated send is megabytes/sec through the room. Leading send + trailing
  // send so the final stroke state always lands.
  // conversationData persistence is debounced at 2s to avoid hammering signals.
  const WB_THROTTLE_MS = 200;
  const lastWhiteboardPush = useRef(0);
  const wbTrailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSceneChange(scene: string) {
    const now = Date.now();
    const elapsed = now - lastWhiteboardPush.current;
    if (wbTrailingTimer.current) clearTimeout(wbTrailingTimer.current);
    if (elapsed >= WB_THROTTLE_MS) {
      lastWhiteboardPush.current = now;
      sendWhiteboardUpdate(scene);
    } else {
      wbTrailingTimer.current = setTimeout(() => {
        lastWhiteboardPush.current = Date.now();
        sendWhiteboardUpdate(scene);
      }, WB_THROTTLE_MS - elapsed);
    }

    // Debounce conversationData write — only persist after user stops drawing.
    // Capture the conversation the stroke belongs to: switching mid-debounce
    // must DROP the sketch, not stamp it onto the new conversation.
    pendingScene.current = {
      scene,
      forId: conversationData.value?.conversation.id,
    };
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushSceneWrite, 2000);
  }

  // Write the debounced scene NOW. Expand/collapse remounts the whiteboard
  // from conversationData — without this flush the last 2s of strokes would
  // vanish across the toggle.
  const pendingScene = useRef<{ scene: string; forId?: string } | null>(null);
  function flushSceneWrite() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const pending = pendingScene.current;
    pendingScene.current = null;
    if (!pending) return;
    const current = conversationData.value;
    if (!current || current.conversation.id !== pending.forId) return;
    conversationData.value = { ...current, whiteboardScene: pending.scene };
  }

  // ---------------------------------------------------------------
  // The board draws itself from the conversation.
  // Manual: click the pencil.  Auto: every few transcript chunks.
  // ---------------------------------------------------------------
  const isDrawing = useSignal(false);
  const transcriptChunkCount = useRef(0);
  const lastAutoDraw = useRef(0);
  const lastDrawnLength = useRef(0);
  const whiteboardRef = useRef<HTMLDivElement>(null);

  // Map ↔ Canvas flip state. The canvas (Excalidraw + a React root) is heavy,
  // so solo boards mount on first flip; live sessions mount immediately —
  // remote strokes and AI draws need a live API even while the map shows.
  const canvasShowing = useSignal(false);
  const canvasMounted = useSignal(false);
  // News dots: something landed on the face you're not looking at.
  const canvasNews = useSignal(false);
  const mapNews = useSignal(false);
  // Expanded: the board rides a body portal at viewport size — on a phone
  // the inline card is too cramped to actually draw in.
  const canvasExpanded = useSignal(false);

  function toggleCanvasExpand() {
    flushSceneWrite();
    canvasExpanded.value = !canvasExpanded.value;
  }

  useEffect(() => {
    if (!canvasExpanded.value) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") canvasExpanded.value = false;
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [canvasExpanded.value]);

  useEffect(() => {
    if (liveSession.value) canvasMounted.value = true;
  }, [liveSession.value]);

  // Tab close/background: the scene debounce (2s) and the store autosave
  // (500ms) both die with the tab — flush the pending strokes into the store
  // AND persist synchronously, or the last seconds of drawing vanish.
  useEffect(() => {
    const flush = () => {
      flushSceneWrite();
      const data = conversationData.value;
      if (data && !isViewingShared.value) saveConversation(data);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    globalThis.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Remote strokes while the map is up → dot on the flip button.
  useEffect(() => {
    let first = true;
    const unsubscribe = remoteWhiteboardUpdate.subscribe(() => {
      // subscribe() fires immediately with the current value — that's
      // history, not news.
      if (first) {
        first = false;
        return;
      }
      if (!canvasShowing.value) canvasNews.value = true;
    });
    return unsubscribe;
  }, []);

  // Topic changes while the canvas is up → dot on the flip-back button.
  const prevNodesSig = useRef("");
  useEffect(() => {
    const sig = (conversationData.value?.nodes ?? [])
      .map((n: { id: string }) => n.id)
      .join("|");
    if (
      prevNodesSig.current && sig !== prevNodesSig.current &&
      canvasShowing.value
    ) {
      mapNews.value = true;
    }
    prevNodesSig.current = sig;
  }, [conversationData.value]);

  // Takes (with append receipts) for the Summary card's Pulse back. Reloaded
  // whenever the conversation changes — an append finishing updates the store,
  // which re-runs this and picks up the freshly stamped receipt.
  const takes = useSignal<StoredRecording[]>([]);
  const activeConversationId = conversationData.value?.conversation.id ?? "";
  useEffect(() => {
    let cancelled = false;
    if (!activeConversationId) {
      takes.value = [];
      return;
    }
    listRecordings(activeConversationId).then((stored) => {
      if (!cancelled) takes.value = stored;
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, conversationData.value]);

  // Same backup as the history drawer — surfaced on the Pulse back so the
  // saving story lives next to the growing story.
  function downloadBackup() {
    try {
      const json = serializeBackup(
        getAllConversations(),
        new Date().toISOString(),
      );
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const dateTag = new Date().toISOString().slice(0, 10);
      anchor.download = `promapper-backup-${dateTag}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded — keep it somewhere safe", "success");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast("Couldn't build the backup", "error");
    }
  }

  function getExcalidrawAPI() {
    // The API rides the .shared-whiteboard container INSIDE the flip wrapper
    // (SharedWhiteboard attaches it to its own div, not to our ref). When the
    // board is expanded it lives in a body portal, outside whiteboardRef —
    // the document fallback finds it there (only one board exists at a time).
    const el = (whiteboardRef.current?.querySelector(".shared-whiteboard") ??
      document.querySelector(".shared-whiteboard")) as
        | (HTMLElement & {
          excalidrawAPI?: {
            getSceneElements?: () => unknown[];
            updateScene(
              opts: { elements: unknown[]; commitToHistory?: boolean },
            ): void;
            exportToBlob(opts: {
              mimeType?: string;
              quality?: number;
            }): Promise<Blob>;
          };
        })
        | null;
    return el?.excalidrawAPI;
  }

  async function downloadBoard() {
    const api = getExcalidrawAPI();
    const blob = await api?.exportToBlob({
      mimeType: "image/png",
      quality: 1,
    });
    if (!blob) {
      showToast("Couldn't export the board", "warning");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function drawFromConversation(silent = false) {
    if (isDrawing.value) return;
    const api = getExcalidrawAPI();
    const sceneElements = api?.getSceneElements;
    if (!sceneElements) {
      if (!silent) showToast("The board isn't ready yet", "warning");
      return;
    }

    const transcript = conversationData.value?.transcript?.text?.trim();
    if (!transcript) {
      if (!silent) {
        showToast("Nothing to draw from yet. Say something first.", "warning");
      }
      return;
    }

    isDrawing.value = true;

    try {
      await ensureApiSession();
      const elements = sceneElements();
      const topics = conversationData.value?.nodes
        ?.map((n: { label?: string; emoji?: string; color?: string }) => ({
          label: n.label || "",
          emoji: n.emoji,
          color: n.color,
        }))
        .filter((t) => t.label) ?? [];
      const res = await fetch("/api/live/whiteboard-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, transcript, topics }),
      });
      if (!res.ok) {
        if (!silent) {
          showToast("Couldn't draw right now — try again", "warning");
        }
        return;
      }
      const payload = await res.json().catch(() => null);
      const updated = payload && typeof payload === "object"
        ? (payload as { elements?: unknown }).elements
        : null;
      if (updated && Array.isArray(updated)) {
        api?.updateScene({ elements: updated, commitToHistory: false });
        sendWhiteboardUpdate(
          JSON.stringify({ elements: updated, appState: {} }),
        );
        // The AI drew on the hidden face — light the flip button.
        if (!canvasShowing.value) canvasNews.value = true;
        if (!silent) showToast("Added to the board", "success");
      }
    } catch {
      if (!silent) {
        showToast("Couldn't draw right now — try again", "warning");
      }
    } finally {
      isDrawing.value = false;
    }
  }

  // Registered in an effect (not the render body) so it's not a render-phase
  // side effect, and cleaned up on unmount so a stale closure never lingers on
  // globalThis after the dashboard goes away.
  useEffect(() => {
    const g = globalThis as typeof globalThis & {
      __onTranscriptChunk?: () => void;
    };
    g.__onTranscriptChunk = () => {
      if (!liveSession.value) return;
      transcriptChunkCount.current++;
      const now = Date.now();
      if (transcriptChunkCount.current % AUTO_DRAW_EVERY !== 0) return;
      if (now - lastAutoDraw.current < AUTO_DRAW_COOLDOWN_MS) return;
      // Skip if barely anything new was said — saves a call for "yeah"/"okay".
      const currentLen = conversationData.value?.transcript?.text?.length ?? 0;
      if (currentLen - lastDrawnLength.current < 200) return;
      lastDrawnLength.current = currentLen;
      lastAutoDraw.current = now;
      drawFromConversation(true);
    };
    return () => {
      delete g.__onTranscriptChunk;
    };
  }, []);

  // Drag-to-rearrange + tap-to-resize. Cards move in 2-D, the dense grid
  // does the pillar math (1:2:4 row units), the arrangement persists per
  // user (not per conversation).
  const sortable = useGridSortable({
    cellIds: () => planBoard().cells.map((c) => c.id),
    onReorder: (cardOrder) => {
      const { full } = planBoard();
      const nextVisible = cardOrder.flatMap((cid) => cid.split("+"));
      setBoardOrder(mergeVisibleOrder(full, nextVisible));
    },
    onTap: cycleSize,
  });

  // Keyboard mirror of the grip gestures: Enter/Space resizes (with the
  // same reflow glide), arrows nudge through the order.
  function onGripKey(event: KeyboardEvent, cardId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const grid = (event.currentTarget as HTMLElement).closest<HTMLElement>(
        ".dashboard-grid",
      );
      if (grid) sortable.animateReflow(grid, () => cycleSize(cardId));
      else cycleSize(cardId);
      return;
    }
    sortable.onGripKeyDown(event, cardId);
  }

  if (!conversationData.value) {
    return (
      <div class="dashboard-skeleton-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            class="skeleton dashboard-skeleton-card skeleton-pulse"
            key={index}
          >
            <div class="skeleton-line skeleton-lg"></div>
            <div class="skeleton-line" style="width: 70%"></div>
            <div class="skeleton-line" style="width: 85%"></div>
            <div class="skeleton-line" style="width: 55%"></div>
          </div>
        ))}
      </div>
    );
  }

  const { conversation, transcript, actionItems, nodes, summary } =
    conversationData.value;

  const { cells } = planBoard(sortable.previewOrder.value);
  const customized = boardOrder.value !== null;

  // Mobile hierarchy (until the user arranges the board themselves): a
  // returning user's question is "what do I do next" — Action Items lead the
  // single-column stack, transcript recedes. Desktop reading order
  // (Transcript | Summary | Actions) is restored with md:order-none. An
  // explicit user order replaces both, at every breakpoint.
  const mobileOrderFor = (cellId: string) =>
    customized ? "" : ` ${
      ({
        transcript: "order-3",
        summary: "order-2",
        actions: "order-1",
        canvas: "order-4",
      } as Record<string, string>)[cellId] ?? "order-6"
    } md:order-none`;

  const renderModuleCard = (members: string[]) => {
    // Two members in one card = notes + takes sharing a cell: scraps on the
    // front, recordings on the back (same-data-adjacent, both quiet
    // surfaces). Either alone renders as its own card.
    if (members.length === 2) {
      return (
        <FlipCard
          label="Takes"
          front={<NotesModule />}
          back={<TakesModule />}
        />
      );
    }
    const entry = moduleRegistry.find((m) => m.id === members[0]);
    if (!entry) return null;
    const Module = entry.component;
    return <Module />;
  };

  function renderCore(id: string) {
    switch (id) {
      // Transcript — flips to Voices (who held the floor)
      case "transcript":
        return (
          <FlipCard
            label="Transcript insights"
            front={
              <TranscriptCard
                transcript={transcript}
                onRenameSpeaker={renameSpeaker}
              />
            }
            back={
              <TranscriptBack
                text={transcript?.text ?? ""}
                speakers={transcript?.speakers ?? []}
              />
            }
          />
        );
      // Summary — flips to Pulse (takes + receipts, the append story)
      case "summary":
        return (
          <FlipCard
            label="Project pulse"
            front={<SummaryCard summary={summary ?? null} />}
            back={
              <SummaryBack
                summary={summary ?? ""}
                transcriptText={transcript?.text ?? ""}
                topicCount={nodes.length}
                taskCount={actionItems.length}
                createdAt={conversation.created_at}
                takes={takes.value}
                onBackup={downloadBackup}
              />
            }
          />
        );
      // Action Items — flips to an overview/bulk-actions back
      case "actions":
        return (
          <FlipCard
            label="Action Items"
            front={
              <ActionItemsCard
                actionItems={actionItems}
                conversationId={conversation.id ?? ""}
                speakers={transcript?.speakers ?? []}
                onUpdateItems={setActionItems}
              />
            }
            back={
              <ActionItemsBack
                items={actionItems}
                // Same pure ops as the front card, so both faces stamp
                // updated_at and strip AI-attribution flags identically.
                onMarkAllDone={() =>
                  setActionItems(
                    completeAllActionItems(
                      actionItems,
                      new Date().toISOString(),
                    ),
                  )}
                onClearDone={() =>
                  setActionItems(clearCompletedActionItems(actionItems))}
              />
            }
          />
        );
      // The centerpiece, two authors — the AI draws the front (topic map),
      // you draw the back (canvas). One spatial surface, flipped. News dots
      // mark activity on the hidden face. Keyed by conversation so a switch
      // resets flip state AND remounts the board (no stale scene bleeding
      // across conversations).
      case "canvas":
        return (
          <>
            <FlipCard
              key={conversation.id}
              label="Canvas"
              frontBadge={canvasNews.value}
              backBadge={mapNews.value}
              onFlip={(flipped) => {
                canvasShowing.value = flipped;
                if (flipped) {
                  canvasMounted.value = true;
                  canvasNews.value = false;
                } else {
                  mapNews.value = false;
                }
              }}
              front={<TopicVisualizationsCard />}
              back={
                <div class="dashboard-card">
                  <div class="dashboard-card-header">
                    <h3
                      data-tip={liveSession.value
                        ? "Drawing live with the room"
                        : "Draw alongside the map — it remembers"}
                    >
                      Canvas
                    </h3>
                    <div class="card-header-actions">
                      <button
                        type="button"
                        onClick={() => downloadBoard()}
                        data-tip="Download as PNG"
                        aria-label="Download the board as an image"
                      >
                        <i class="fa fa-download" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => drawFromConversation(false)}
                        disabled={isDrawing.value}
                        data-tip="AI adds to the board"
                        aria-label="Ask the AI to draw from the conversation"
                      >
                        <i
                          class={`fa ${
                            isDrawing.value
                              ? "fa-hourglass-half"
                              : "fa-wand-magic-sparkles"
                          }`}
                          aria-hidden="true"
                        >
                        </i>
                      </button>
                      <button
                        type="button"
                        onClick={toggleCanvasExpand}
                        data-tip="Draw big"
                        aria-label="Expand the board fullscreen"
                      >
                        <i class="fa fa-maximize" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                  <div class="dashboard-card-body canvas-flip-body">
                    {
                      /* Unmounts while expanded — the board lives in the
                        portal overlay; the scene survives the move via the
                        flushed conversationData write. */
                    }
                    {canvasMounted.value && !canvasExpanded.value && (
                      <SharedWhiteboard
                        roomId={liveSession.value?.roomId ?? "local"}
                        initialScene={conversationData.value?.whiteboardScene}
                        onSceneChange={handleSceneChange}
                      />
                    )}
                  </div>
                </div>
              }
            />
            {
              /* Portaled: flip-card transforms trap fixed overlays, same as
                the map fullscreen. */
            }
            {canvasExpanded.value && (
              <BodyPortal>
                <div
                  class="topic-map-fullscreen"
                  role="dialog"
                  aria-modal="true"
                >
                  <div class="topic-map-fullscreen__panel">
                    <div class="topic-map-fullscreen__header">
                      <div>
                        <h3>Canvas</h3>
                        <p>Draw big. Esc or ✕ brings the card back.</p>
                      </div>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          onClick={() => downloadBoard()}
                          aria-label="Download the board as an image"
                        >
                          <i class="fa fa-download" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => drawFromConversation(false)}
                          disabled={isDrawing.value}
                          aria-label="Ask the AI to draw from the conversation"
                        >
                          <i
                            class={`fa ${
                              isDrawing.value
                                ? "fa-hourglass-half"
                                : "fa-wand-magic-sparkles"
                            }`}
                            aria-hidden="true"
                          >
                          </i>
                        </button>
                        <button
                          type="button"
                          onClick={toggleCanvasExpand}
                          aria-label="Close the expanded board"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div class="canvas-flip-body">
                      <SharedWhiteboard
                        roomId={liveSession.value?.roomId ?? "local"}
                        initialScene={conversationData.value?.whiteboardScene}
                        onSceneChange={handleSceneChange}
                      />
                    </div>
                  </div>
                </div>
              </BodyPortal>
            )}
          </>
        );
      default:
        return null;
    }
  }

  // Mutations delegate to the action-items store (pure transforms in core/).
  return (
    <div class="dashboard-shell">
      {/* Grid Container - Simple CSS Grid */}
      {
        /* 6-unit rack grid (4 on tablet): core cards span 2, small modules
          span 1, wide spans the row — docs/MODULES.md. Cells render in the
          user's order (or the preview order mid-drag); dense packing settles
          the board around whatever gets moved. */
      }
      <div class="dashboard-grid grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {
          /* Conversation-scoped keys on module cells: switching conversations
            REMOUNTS every module, so stale textareas/canvases/in-flight
            answers can't leak across conversations (Bumblefuzz's
            hall-of-fame find). */
        }
        {cells.map((cell) => {
          const cellId = cell.id;
          const lifting = sortable.draggingId.value === cellId;
          const settling = sortable.settlingId.value === cellId;
          const isCanvas = cellId === "canvas";
          const shape = isCanvas
            ? "w-full board-cell--canvas"
            : `min-w-0 md:col-span-2 board-cell--${cell.size}${
              cell.core ? "" : " module-cell"
            }${
              !cell.core && cell.size === "small" ? " module-cell--small" : ""
            }`;
          return (
            <div
              key={cell.core
                ? cellId
                : `${conversation.id}-${cell.members.join("-")}`}
              data-cell-id={cellId}
              class={`board-cell ${shape}${mobileOrderFor(cellId)}${
                lifting ? " is-lifting" : ""
              }${settling ? " is-settling" : ""}`}
              ref={isCanvas ? whiteboardRef : undefined}
              onPointerDown={(e) => sortable.onCellPointerDown(e, cellId)}
            >
              <button
                type="button"
                class="board-grip"
                aria-label={isCanvas
                  ? "Move this card — drag it, or nudge with the arrow keys"
                  : "Move this card — drag it, tap to resize, arrow keys nudge"}
                data-tip={isCanvas
                  ? "Drag to move"
                  : "Drag to move · tap to resize"}
                onPointerDown={(e) => sortable.onGripPointerDown(e, cellId)}
                onKeyDown={(e) => onGripKey(e, cellId)}
              >
                <i class="fa fa-grip" aria-hidden="true"></i>
              </button>
              {cell.core ? renderCore(cellId) : renderModuleCard(cell.members)}
            </div>
          );
        })}

        {/* The rack — ghost tile, always last, not part of the shuffle. */}
        <div class="order-last md:order-none min-w-0 module-cell module-cell--small">
          <ModuleRack />
        </div>
      </div>

      {
        /* Roomy reader for long transcript/summary content — opened from a card's
          expand button, keeps the grid itself compact + equal-height. */
      }
      <ReaderModal />
    </div>
  );
}
