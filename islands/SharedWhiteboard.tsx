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

  useEffect(() => {
    if (!IS_BROWSER) return;

    let cancelled = false;

    async function mount() {
      const [React, { createRoot }, { Excalidraw }] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("@excalidraw/excalidraw"),
      ]);

      if (cancelled || !containerRef.current) return;

      let parsed;
      if (initialScene) {
        try {
          parsed = JSON.parse(initialScene);
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
            onSceneChange?.(JSON.stringify({ elements, appState }));
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
        apiRef.current.updateScene({
          elements,
          appState,
          commitToHistory: false,
        });
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
