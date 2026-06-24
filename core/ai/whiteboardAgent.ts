/**
 * Whiteboard Agent — AI-powered diagram editing for shared whiteboards.
 *
 * Phase 2c: the AI watches the transcript and emits edit operations
 * (replace / insert_after / delete) on the Excalidraw scene, following
 * autopreso's line-numbered edit model. The LLM never sees raw Excalidraw
 * JSON — it operates on a compact text representation.
 */

// ===================================================================
// SCENE FORMATTING — Excalidraw elements → line-numbered text
// ===================================================================

interface ExcalidrawElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  label?: { text?: string };
  points?: Array<[number, number]>;
  roundness?: unknown;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  boundElements?: Array<{ id: string; type: string }>;
  [key: string]: unknown;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function elText(el: ExcalidrawElement): string {
  // For text elements, use the text field directly.
  if (el.type === "text" && el.text) {
    return `"${el.text.replace(/"/g, '\\"').slice(0, 80)}"`;
  }
  // For shapes with text labels.
  const label = el.label?.text || el.text || "";
  if (label) return `"${label.replace(/"/g, '\\"').slice(0, 80)}"`;
  // For containers (rectangle, diamond, ellipse) without labels, describe shape.
  if (el.type === "rectangle") {
    return `rect ${round(el.width ?? 0)}x${round(el.height ?? 0)}`;
  }
  if (el.type === "ellipse") {
    return `ellipse ${round(el.width ?? 0)}x${round(el.height ?? 0)}`;
  }
  if (el.type === "diamond") {
    return `diamond ${round(el.width ?? 0)}x${round(el.height ?? 0)}`;
  }
  // For arrows/lines.
  if (el.type === "arrow" && el.points) {
    const pts = el.points.map(([x, y]) => `(${round(x)},${round(y)})`).join(
      "→",
    );
    return `arrow ${pts}`;
  }
  // Generic fallback.
  return el.type || "element";
}

/** Convert Excalidraw elements to a compact line-numbered text view. */
export function formatSceneAsText(elements: Record<string, unknown>[]): string {
  return elements
    .map((elRaw, i) => {
      const el = elRaw as ExcalidrawElement;
      const type = el.type || "shape";
      const pos = el.x !== undefined && el.y !== undefined
        ? `(${round(el.x)},${round(el.y)})`
        : "";
      const text = elText(el);
      const id = el.id ? ` #${el.id.slice(0, 6)}` : "";
      return `${i + 1}: ${type}${id} ${pos} ${text}`.trim();
    })
    .join("\n");
}

// ===================================================================
// PROMPT BUILDING
// ===================================================================

export function buildWhiteboardAgentPrompt(
  sceneText: string,
  transcriptChunk: string,
  topicLabels: string[] = [],
): string {
  const topicList = topicLabels.length > 0
    ? `\nTopics discussed: ${topicLabels.join(", ")}`
    : "";

  return `You are building a diagram alongside a live conversation. The
current whiteboard scene is shown below as a line-numbered canvas. Each line
is an element (shape, text, arrow, etc.) with its type, id, position, and
text label.

Look at the latest conversation snippet and decide if the diagram needs
an update:
- Add new elements that capture key ideas, entities, or relationships.
- Update existing elements if the conversation refined a concept.
- Remove elements that are no longer relevant.
- Connect related elements with arrows.

Conversation snippet:
"""
${transcriptChunk.slice(0, 4000)}
"""${topicList}

Current whiteboard scene:
"""
${sceneText}
"""

Respond with a JSON object containing an "operations" array. Each operation
must be one of:

- {"op": "replace", "line": <number>, "content": "<new element desc>"}
  Updates the element at that line number.

- {"op": "insert_after", "line": <number>, "content": "<new element desc>"}
  Inserts a new element after the given line. Use line=0 to insert at the
  beginning.

- {"op": "delete", "line": <number>}
  Removes the element at that line number.

Element descriptions use the same compact format as the scene view:
  "type (x,y) label"
  e.g. "rectangle (200,100) Database"
  e.g. "text (300,150) Users table"
  e.g. "arrow (100,200)→(250,150)"

Only include operations that genuinely improve the diagram. If the current
scene already represents the conversation well, return an empty array.

Respond ONLY with the JSON object, no markdown fences or extra text:
{"operations": [...]}`;
}

// ===================================================================
// OPERATION PARSING
// ===================================================================

export interface WhiteboardOp {
  op: "replace" | "insert_after" | "delete";
  line: number;
  content?: string;
}

export function parseWhiteboardOps(raw: string): WhiteboardOp[] {
  try {
    // Strip possible markdown fences.
    let json = raw.trim();
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
    }
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.operations)) return [];
    const ops: WhiteboardOp[] = [];
    for (const op of parsed.operations) {
      if (!op || typeof op !== "object") continue;
      const line = Number(op.line);
      if (!Number.isFinite(line) || line < 0 || line > 10_000) continue;
      if (op.op === "replace" || op.op === "insert_after") {
        if (typeof op.content !== "string" || !op.content.trim()) continue;
        ops.push({ op: op.op, line, content: op.content.trim() });
      } else if (op.op === "delete") {
        ops.push({ op: "delete", line });
      }
    }
    return ops;
  } catch {
    return [];
  }
}

// ===================================================================
// OPERATION APPLICATION — create new Excalidraw elements from ops
// ===================================================================

/**
 * Parse a compact element description back into an Excalidraw element.
 * Format: "type (x,y) label" or "arrow (x1,y1)→(x2,y2)"
 */
function parseElementDesc(
  desc: string,
  nextId: () => string,
): ExcalidrawElement | null {
  const trimmed = desc.trim();
  if (!trimmed) return null;

  // Arrow: "arrow (100,200)→(250,150)"
  const arrowMatch = trimmed.match(
    /^arrow\s*\((\d+),(\d+)\)\s*→\s*\((\d+),(\d+)\)$/i,
  );
  if (arrowMatch) {
    const [, x1, y1, x2, y2] = arrowMatch.map(Number);
    return {
      id: nextId(),
      type: "arrow",
      x: x1,
      y: y1,
      points: [[0, 0], [x2 - x1, y2 - y1]],
      strokeColor: "#e8839c",
    };
  }

  // Shape/text with optional label.
  const match = trimmed.match(
    /^(\w+)\s*(?:\((\d+),(\d+)\))?\s*(.*)$/,
  );
  if (!match) return null;

  const [, type, xStr, yStr, label] = match;
  const x = xStr ? Number(xStr) : 100;
  const y = yStr ? Number(yStr) : 100;
  const cleanLabel = label.replace(/^[\s"]+|[\s"]+$/g, "");

  if (type === "text") {
    return {
      id: nextId(),
      type: "text",
      x,
      y,
      width: 200,
      height: 40,
      text: cleanLabel,
    };
  }

  if (type === "rectangle" || type === "diamond" || type === "ellipse") {
    return {
      id: nextId(),
      type,
      x,
      y,
      width: 160,
      height: 80,
      text: cleanLabel || undefined,
      strokeColor: "#e8839c",
      backgroundColor: "#fff5f7",
      fillStyle: "solid",
    };
  }

  // Generic: treat as text.
  return {
    id: nextId(),
    type: "text",
    x,
    y,
    width: 200,
    height: 40,
    text: trimmed,
  };
}

let _counter = 0;
function aiElementId(): string {
  _counter++;
  return `ai_${Date.now()}_${_counter}`;
}

/**
 * Apply the parsed edit operations to create a new elements array.
 * Returns the updated elements list.
 */
export function applyWhiteboardOps(
  elements: Record<string, unknown>[],
  ops: WhiteboardOp[],
): Record<string, unknown>[] {
  // Work on a mutable copy.
  const result = elements.map((el) => ({ ...el } as ExcalidrawElement));

  // Process ops in order. Insertions shift line numbers.
  for (const op of ops) {
    const idx = Math.max(0, Math.min(op.line - 1, result.length));

    if (op.op === "delete" && idx < result.length) {
      result.splice(idx, 1);
      continue;
    }

    if ((op.op === "replace" || op.op === "insert_after") && op.content) {
      const newEl = parseElementDesc(op.content, aiElementId);
      if (!newEl) continue;

      if (op.op === "replace" && idx < result.length) {
        const existing = result[idx];
        result[idx] = {
          ...existing,
          id: existing.id || newEl.id,
          type: newEl.type,
          text: newEl.text ?? existing.text,
          label: newEl.label ?? existing.label,
          strokeColor: newEl.strokeColor ?? existing.strokeColor,
        };
      } else if (op.op === "insert_after") {
        const insertAt = op.line === 0 ? 0 : Math.min(idx + 1, result.length);
        if (idx < result.length) {
          newEl.x = ((result[idx].x as number) ?? 100) + 180;
          newEl.y = (result[idx].y as number) ?? 100;
        }
        result.splice(insertAt, 0, newEl);
      }
    }
  }

  // Ensure every element has an id.
  for (const el of result) {
    if (!el.id) el.id = aiElementId();
  }

  return result;
}
