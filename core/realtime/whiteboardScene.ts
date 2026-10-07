import { sharedWhiteboardAppState } from "./whiteboardState.ts";

interface SceneElement {
  id: string;
  version: number;
  [key: string]: unknown;
}

function parseScene(raw: string | null): {
  elements: SceneElement[];
  appState: Record<string, string>;
} | null {
  if (!raw) return { elements: [], appState: {} };
  if (raw.length > 500_000) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed || !Array.isArray(parsed.elements) ||
      parsed.elements.length > 3000
    ) return null;
    const elements = parsed.elements.filter((element: unknown) => {
      if (!element || typeof element !== "object") return false;
      const item = element as Record<string, unknown>;
      return typeof item.id === "string" && item.id.length > 0 &&
        item.id.length <= 128 && typeof item.version === "number" &&
        Number.isSafeInteger(item.version) && item.version >= 0;
    }) as SceneElement[];
    return {
      elements,
      appState: sharedWhiteboardAppState(parsed.appState),
    };
  } catch {
    return null;
  }
}

/** Independent strokes union by element ID. For concurrent changes to the
 * same element at the same version, the first accepted change wins. Excalidraw
 * deletion tombstones carry a higher version and stay in the scene. */
export function mergeWhiteboardScenes(
  stored: string | null,
  incoming: string,
): string | null {
  const before = parseScene(stored);
  const next = parseScene(incoming);
  if (!before || !next) return null;
  const byId = new Map<string, SceneElement>();
  for (const element of before.elements) byId.set(element.id, element);
  for (const element of next.elements) {
    const prior = byId.get(element.id);
    if (!prior || element.version > prior.version) {
      byId.set(element.id, element);
    }
  }
  const scene = JSON.stringify({
    elements: [...byId.values()],
    appState: { ...before.appState, ...next.appState },
  });
  return scene.length <= 500_000 ? scene : null;
}
