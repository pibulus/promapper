/** Only the paper colour belongs to the shared Excalidraw scene. Element
 * styles live on the elements; the rest of appState belongs to each viewer.
 * In particular, collaborators is a Map and cannot survive JSON transport. */
export function sharedWhiteboardAppState(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const background = (value as Record<string, unknown>).viewBackgroundColor;
  return typeof background === "string" && /^#[0-9a-fA-F]{6}$/.test(background)
    ? { viewBackgroundColor: background }
    : {};
}
