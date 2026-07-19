/**
 * Shared Whiteboard — Excalidraw embedded as a Preact island.
 *
 * Renders Excalidraw inside a React root (the library is React-based). Scene
 * changes are reported via onSceneChange, and remote updates are applied via
 * a ref-based API. The parent (LiveCollabIsland) wires these to PartyKit.
 *
 * Phase 2b: humans draw manually. Phase 2c: AI agent will programmatically
 * edit the scene using the same updateScene path.
 */

import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { remoteWhiteboardUpdate } from "@signals/partyConnectionStore.ts";

interface SharedWhiteboardProps {
  roomId: string;
  initialScene?: string;
  onSceneChange?: (scene: string) => void;
}

/**
 * Strip per-viewer state from Excalidraw's appState before syncing. Without
 * this, a remote edit carries the sender's scroll/zoom/selection and silently
 * teleports everyone else's canvas — brutal on mobile, mid-stroke.
 */
function sharedAppState(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== "object") return {};
  const {
    scrollX: _scrollX,
    scrollY: _scrollY,
    zoom: _zoom,
    cursorButton: _cursorButton,
    selectedElementIds: _selectedElementIds,
    selectedGroupIds: _selectedGroupIds,
    width: _width,
    height: _height,
    offsetTop: _offsetTop,
    offsetLeft: _offsetLeft,
    ...rest
  } = appState as Record<string, unknown>;
  return rest;
}

export default function SharedWhiteboard(
  { initialScene, onSceneChange }: SharedWhiteboardProps,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<
    {
      updateScene: (opts: {
        elements: unknown[];
        appState: unknown;
        commitToHistory?: boolean;
      }) => void;
    } | null
  >(null);
  const reactRootRef = useRef<{ unmount: () => void } | null>(null);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    if (!IS_BROWSER) return;

    let cancelled = false;

    async function mount() {
      // Excalidraw's browser bundle reads `process.env` at module init and
      // the esbuild pipeline doesn't shim Node globals — without this the
      // import throws "process is not defined" and the board never mounts.
      const g = globalThis as unknown as {
        process?: { env: Record<string, string> };
      };
      g.process ??= { env: {} };
      const [reactMod, reactDomMod, excalidrawMod] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("@excalidraw/excalidraw"),
      ]);
      // CJS/ESM interop: React's API lands on `.default` of the namespace
      // object here, so `React.createElement` on the namespace was undefined
      // and the board never mounted.
      // deno-lint-ignore no-explicit-any
      const React = ((reactMod as any).default ?? reactMod) as typeof reactMod;
      // deno-lint-ignore no-explicit-any
      const createRoot = (reactDomMod as any).createRoot ??
        // deno-lint-ignore no-explicit-any
        (reactDomMod as any).default?.createRoot;
      // deno-lint-ignore no-explicit-any
      const Excalidraw = (excalidrawMod as any).Excalidraw ??
        // deno-lint-ignore no-explicit-any
        (excalidrawMod as any).default?.Excalidraw;

      if (cancelled || !containerRef.current) return;

      let parsed;
      if (initialScene) {
        try {
          parsed = JSON.parse(initialScene);
          // JSON round-trips turn appState.collaborators (a Map inside
          // Excalidraw) into a plain object — restoring that crashes
          // InteractiveCanvas ("collaborators.forEach is not a function").
          // Strip it; Excalidraw rebuilds its own.
          if (parsed?.appState && "collaborators" in parsed.appState) {
            delete parsed.appState.collaborators;
          }
        } catch {
          parsed = { elements: [], appState: { theme: "light" } };
        }
      }

      const element = React.createElement(
        Excalidraw,
        {
          initialData: parsed ?? {
            elements: [],
            appState: { theme: "light" },
          },
          isCollaborating: true,
          UIOptions: {
            canvasActions: {
              export: false,
              loadScene: false,
              saveAsImage: true,
            },
          },
          theme: "light",
          excalidrawAPI(api: typeof apiRef.current) {
            apiRef.current = api;
            if (containerRef.current) {
              (containerRef.current as HTMLElement & {
                excalidrawAPI?: typeof apiRef.current;
              }).excalidrawAPI = api;
            }
          },
          onChange(elements: unknown[], appState: unknown) {
            if (isRemoteUpdate.current) return;
            // Broadcast only collaborative state — never our viewport.
            onSceneChange?.(
              JSON.stringify({ elements, appState: sharedAppState(appState) }),
            );
          },
        },
      );

      const root = createRoot(containerRef.current);
      reactRootRef.current = root;
      root.render(element);
    }

    mount();

    return () => {
      cancelled = true;
      reactRootRef.current?.unmount();
    };
  }, []);

  // Expose updateScene so the parent can push remote whiteboard updates.
  // Attached to the DOM element as a data property so it's accessible
  // without prop drilling through React.
  useEffect(() => {
    if (!IS_BROWSER || !containerRef.current) return;
    (containerRef.current as HTMLElement & {
      excalidrawAPI?: typeof apiRef.current;
    }).excalidrawAPI = apiRef.current;
  }, [apiRef.current]);

  // Subscribe to remote whiteboard updates from PartyKit reactively.
  useEffect(() => {
    if (!IS_BROWSER) return;
    const unsubscribe = remoteWhiteboardUpdate.subscribe((scene) => {
      if (!scene || !apiRef.current) return;
      try {
        const { elements, appState } = JSON.parse(scene);
        isRemoteUpdate.current = true;
        apiRef.current.updateScene({
          elements,
          // Drop any viewport state the sender may have included so our
          // pan/zoom is never yanked.
          appState: sharedAppState(appState),
          commitToHistory: false,
        });
        // updateScene schedules a React render; onChange fires on the *next*
        // tick. Clearing synchronously here would already be too late, so the
        // remote edit would echo back to PartyKit as a local one (broadcast
        // storm). Clear after the render flushes instead.
        setTimeout(() => {
          isRemoteUpdate.current = false;
        }, 0);
      } catch { /* malformed scene */ }
    });
    return unsubscribe;
  }, []);

  return (
    <div class="shared-whiteboard" ref={containerRef}>
      {!IS_BROWSER && (
        <div class="shared-whiteboard-placeholder">
          <p>Whiteboard loading…</p>
        </div>
      )}
    </div>
  );
}
