import { assertEquals } from "./_assert.ts";
import { sharedWhiteboardAppState } from "../realtime/whiteboardState.ts";
import { mergeWhiteboardScenes } from "../realtime/whiteboardScene.ts";

Deno.test("whiteboard JSON carries paper colour without collaborator or viewport state", () => {
  const local = {
    viewBackgroundColor: "#ffffff",
    collaborators: new Map([["peer", { name: "Mae" }]]),
    scrollX: 20,
    zoom: { value: 2 },
  };
  const wire = JSON.parse(JSON.stringify(sharedWhiteboardAppState(local)));
  assertEquals(wire, { viewBackgroundColor: "#ffffff" });
  assertEquals(sharedWhiteboardAppState({ ...wire, collaborators: {} }), wire);
});

Deno.test("two canvases keep independent strokes and deletion tombstones", () => {
  const original = JSON.stringify({
    elements: [{ id: "a", version: 1, type: "rectangle" }],
    appState: { collaborators: {}, viewBackgroundColor: "#ffffff" },
  });
  const fromA = JSON.stringify({
    elements: [
      { id: "a", version: 1, type: "rectangle" },
      { id: "b", version: 1, type: "ellipse" },
    ],
    appState: { collaborators: {}, scrollX: 100 },
  });
  const fromB = JSON.stringify({
    elements: [
      { id: "a", version: 1, type: "rectangle" },
      { id: "c", version: 1, type: "arrow" },
    ],
    appState: { collaborators: {}, scrollX: -100 },
  });
  const afterA = mergeWhiteboardScenes(original, fromA)!;
  const both = JSON.parse(mergeWhiteboardScenes(afterA, fromB)!);
  assertEquals(both.elements.map((element: { id: string }) => element.id), [
    "a",
    "b",
    "c",
  ]);
  assertEquals(both.appState, { viewBackgroundColor: "#ffffff" });

  const deleted = JSON.stringify({
    elements: [{ id: "a", version: 2, isDeleted: true }],
  });
  const afterDelete = JSON.parse(
    mergeWhiteboardScenes(JSON.stringify(both), deleted)!,
  );
  assertEquals(afterDelete.elements[0].isDeleted, true);
});
