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
  containerId?: string;
  [key: string]: unknown;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function elText(
  el: ExcalidrawElement,
  boundTextByContainer?: Map<string, string>,
): string {
  // For text elements, use the text field directly.
  if (el.type === "text" && el.text) {
    return `"${el.text.replace(/"/g, '\\"').slice(0, 80)}"`;
  }
  // For containers with bound text, look up the real label.
  if (el.id && boundTextByContainer?.has(el.id)) {
    const label = boundTextByContainer.get(el.id)!;
    return `"${label.replace(/"/g, '\\"').slice(0, 80)}"`;
  }
  // Fallback: old-style inline text labels (legacy elements before the bound-text fix).
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

/** Convert Excalidraw elements to a compact line-numbered text view.
 *  Bound text labels (text elements with containerId) are skipped and their
 *  content is shown on the container line instead — Excalidraw requires
 *  separate container + bound-text elements, but the AI only needs to see
 *  one logical canvas item per line. */
export function formatSceneAsText(elements: Record<string, unknown>[]): string {
  // Build a lookup: containerId → text content for bound text labels.
  const boundTextByContainer = new Map<string, string>();
  for (const elRaw of elements) {
    const el = elRaw as ExcalidrawElement & { containerId?: string };
    if (el.type === "text" && el.containerId && el.text) {
      boundTextByContainer.set(el.containerId, el.text);
    }
  }

  const lines: string[] = [];
  let lineNum = 0;

  for (const elRaw of elements) {
    const el = elRaw as ExcalidrawElement & { containerId?: string };
    // Skip bound text labels — they're represented inside their container.
    if (el.type === "text" && el.containerId) continue;

    lineNum++;
    const type = el.type || "shape";
    const pos = el.x !== undefined && el.y !== undefined
      ? `(${round(el.x)},${round(el.y)})`
      : "";
    const text = elText(el, boundTextByContainer);
    const id = el.id ? ` #${el.id.slice(0, 6)}` : "";
    lines.push(`${lineNum}: ${type}${id} ${pos} ${text}`.trim());
  }

  return lines.join("\n");
}

// ===================================================================
// PROMPT BUILDING
// ===================================================================

export function buildWhiteboardAgentPrompt(
  sceneText: string,
  transcriptChunk: string,
  topics: Array<{ label: string; emoji?: string; color?: string }> = [],
): string {
  const topicContext = topics.length > 0
    ? `\nTopic map (use these emojis + colors when drawing elements for each topic):\n${
      topics
        .map((t) =>
          `  ${t.emoji || ""} ${t.label}${t.color ? ` (${t.color})` : ""}`
        )
        .join("\n")
    }\n`
    : "";

  return `You are building a visual diagram alongside a live conversation. The
current whiteboard scene is shown below as a line-numbered canvas. Each line
is an element (shape, text, arrow, etc.) with its type, id, position, and
label. Lines are numbered in draw order, not by position on the canvas —
two elements next to each other visually may be far apart in the list.

Look at the latest conversation snippet and decide if the diagram needs
an update. Good diagrams feel like a mind map — related concepts grouped
in rectangles, key ideas as standalone text, relationships drawn as arrows.
Label arrows with the relationship when you can (e.g. "depends on" rather
than just a bare line). Place new elements below or to the right of existing
ones so the diagram grows outward gracefully.
If different speakers contributed distinct ideas, group their elements in
separate regions and label them with the speaker's name (e.g. "Pablo's points"
as a text label above the group).

- Add new elements that capture key ideas, entities, or relationships.
- Update existing elements if the conversation refined a concept.
- Remove elements that are no longer relevant.
- Connect related elements with arrows.

Conversation snippet:
"""
${transcriptChunk.slice(0, 4000)}
"""${topicContext}

Current whiteboard scene:
"""
${sceneText}
"""

Respond with a JSON object containing an "operations" array. Each operation
must be one of:

- {"op": "replace", "line": <number>, "content": "<new element desc>"}
  Updates the label or shape of the element at that line.
  Keep the same position and type unless the conversation changed the concept.

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
 * Parse a compact element description back into Excalidraw elements.
 * Format: "type (x,y) label" or "arrow (x1,y1)→(x2,y2) label"
 * Shapes with labels generate TWO elements (container + bound text).
 * If the label matches a known topic, inherits that topic's color + emoji.
 */
function parseElementDesc(
  desc: string,
  nextId: () => string,
  topicMap?: Map<string, { emoji?: string; color?: string }>,
): ExcalidrawElement[] | null {
  const trimmed = desc.trim();
  if (!trimmed) return null;

  // Arrow: "arrow (100,200)→(250,150)" or "arrow (100,200)→(250,150) depends on"
  const arrowMatch = trimmed.match(
    /^arrow\s*\((\d+),(\d+)\)\s*→\s*\((\d+),(\d+)\)(?:\s+(.*))?$/i,
  );
  if (arrowMatch) {
    const [, x1, y1, x2, y2, rawLabel] = arrowMatch;
    const x1n = Number(x1);
    const y1n = Number(y1);
    const x2n = Number(x2);
    const y2n = Number(y2);
    const container = applyVibe({
      id: nextId(),
      type: "arrow",
      x: x1n,
      y: y1n,
      points: [[0, 0], [x2n - x1n, y2n - y1n]],
      strokeColor: nextArrowColor(),
    });
    if (rawLabel && rawLabel.trim()) {
      const label = rawLabel.trim().replace(/^["']|["']$/g, "");
      const tlId = nextId();
      const textEl: ExcalidrawElement = {
        id: tlId,
        type: "text",
        x: (x1n + x2n) / 2 - 40,
        y: (y1n + y2n) / 2 - 14,
        width: 120,
        height: 20,
        text: label,
        containerId: container.id,
        roughness: 0,
        strokeWidth: 0,
      };
      container.boundElements = [{ id: tlId, type: "text" }];
      return [container, textEl];
    }
    return [container];
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

  // If the element label mentions a known topic, steal its color + emoji.
  const topic = topicMap
    ? [...topicMap.entries()].find(([key]) => {
      const escapedKey = key.replace(/[-\/\\^*+?.()|[\]{}]/g, "\\$&");
      return new RegExp(`\\b${escapedKey}\\b`, "i").test(cleanLabel);
    })
    : undefined;
  const topicColor = topic?.[1]?.color;
  const topicEmoji = topic?.[1]?.emoji;
  const displayLabel = topicEmoji && !cleanLabel.includes(topicEmoji)
    ? `${topicEmoji} ${cleanLabel}`
    : cleanLabel;

  if (type === "text") {
    return [applyVibe({
      id: nextId(),
      type: "text",
      x,
      y,
      width: 200,
      height: 40,
      text: displayLabel,
      strokeColor: topicColor,
    })];
  }

  if (type === "rectangle" || type === "diamond" || type === "ellipse") {
    const containerId = nextId();
    const textId = nextId();
    const container = applyVibe({
      id: containerId,
      type,
      x,
      y,
      width: 160,
      height: 80,
      boundElements: [{ id: textId, type: "text" }],
      strokeColor: topicColor,
      backgroundColor: topicColor ? undefined : undefined,
    });
    const textEl: ExcalidrawElement = {
      id: textId,
      type: "text",
      x: x + 10,
      y: y + 30,
      width: 140,
      height: 20,
      text: displayLabel,
      containerId: containerId,
      strokeColor: "#1e1e1e",
      roughness: 0,
      strokeWidth: 0,
    };
    return [container, textEl];
  }

  // Generic: treat as text.
  return [applyVibe({
    id: nextId(),
    type: "text",
    x,
    y,
    width: 200,
    height: 40,
    text: displayLabel,
    strokeColor: topicColor,
  })];
}

let _counter = 0;
function aiElementId(): string {
  _counter++;
  return `ai_${Date.now()}_${_counter}`;
}

// ------------------------------------------------------------------
// Aesthetic palette — warm, varied, hand-drawn.  Cycles so the
// board doesn't look like a monochrome engineering diagram.
// ------------------------------------------------------------------
const PALETTE = [
  { stroke: "#e8839c", fill: "#fff5f7" },
  { stroke: "#5b8def", fill: "#f0f4ff" },
  { stroke: "#52a37f", fill: "#f0f8f4" },
  { stroke: "#c47c48", fill: "#fdf6f0" },
  { stroke: "#b66ad9", fill: "#f8f0fc" },
  { stroke: "#d66b8f", fill: "#fdf2f5" },
];
const ARROW_COLORS = ["#e8839c", "#5b8def", "#8a8f98", "#c47c48", "#52a37f"];

let _paletteIdx = 0;
function nextColor() {
  const c = PALETTE[_paletteIdx % PALETTE.length];
  _paletteIdx++;
  return c;
}
function nextArrowColor() {
  return ARROW_COLORS[_paletteIdx % ARROW_COLORS.length];
}

/** Sprinkle a little soul onto a generated shape — hand-drawn roughness,
 *  softened corners, a bit of variation so it feels like a person drew it. */
function applyVibe(el: ExcalidrawElement): ExcalidrawElement {
  if (el.type === "text") {
    return { ...el, roughness: 0, strokeWidth: 0 };
  }
  if (el.type === "arrow") {
    return {
      ...el,
      strokeWidth: 1.5,
      roughness: 1 + (_paletteIdx % 2),
      roundness: null,
    };
  }
  // rectangles, diamonds, ellipses — only cycle palette if no topic color set
  if (el.strokeColor) {
    // Element came from a matching topic — keep its color, just add vibe extras.
    return {
      ...el,
      strokeWidth: el.strokeWidth || 2,
      roughness: el.roughness ?? 1,
      roundness: el.type === "rectangle"
        ? (el.roundness ?? { type: 3 })
        : el.roundness,
      fillStyle: el.fillStyle || "solid",
      opacity: el.opacity ?? 95,
      backgroundColor: el.backgroundColor || "#ffffff",
    };
  }
  const color = nextColor();
  return {
    ...el,
    strokeColor: color.stroke,
    backgroundColor: color.fill,
    fillStyle: el.fillStyle || "solid",
    strokeWidth: 2 + (_paletteIdx % 2),
    roughness: 1 + (_paletteIdx % 3),
    roundness: el.type === "rectangle" ? { type: 3 } : undefined,
    opacity: 90 + (_paletteIdx % 11),
  };
}

// ------------------------------------------------------------------
// Helpers for operation application
// ------------------------------------------------------------------

function extractLabel(desc: string): string {
  const match = desc.match(/^\w+\s*(?:\(\d+,\d+\))?\s*(.+)$/);
  return match ? match[1].replace(/^["']|["']$/g, "").trim() : desc;
}

/** Map a line number (from formatSceneAsText, which skips bound text) to the
 *  real array index.  Returns -1 when the line doesn't exist. */
function lineToIndex(
  elements: ExcalidrawElement[],
  line: number,
): number {
  let visibleIdx = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "text" && el.containerId) continue;
    visibleIdx++;
    if (visibleIdx === line) return i;
  }
  return -1;
}

/**
 * Apply the parsed edit operations to create a new elements array.
 * Returns the updated elements list.
 */
export function applyWhiteboardOps(
  elements: Record<string, unknown>[],
  ops: WhiteboardOp[],
  topics: Array<{ label: string; emoji?: string; color?: string }> = [],
): Record<string, unknown>[] {
  const topicMap = topics.length > 0
    ? new Map(topics.map((t) => [t.label, { emoji: t.emoji, color: t.color }]))
    : undefined;
  const result = elements.map((el) => ({ ...el } as ExcalidrawElement));

  // Process ops in REVERSE line-number order so that earlier operations
  // don't shift indices for later operations. All ops reference the original
  // scene's line numbers.
  const sorted = [...ops].sort((a, b) => b.line - a.line);

  for (const op of sorted) {
    const idx = lineToIndex(result, op.line);
    if (idx < 0 || idx >= result.length) continue;

    if (op.op === "delete") {
      const existing = result[idx];
      // Also remove any bound text elements owned by this container.
      if (existing.boundElements) {
        const boundIds = new Set(
          existing.boundElements.map((b) => b.id),
        );
        for (let i = result.length - 1; i >= 0; i--) {
          if (boundIds.has(result[i].id ?? "")) result.splice(i, 1);
        }
      }
      result.splice(idx, 1);
      continue;
    }

    if ((op.op === "replace" || op.op === "insert_after") && op.content) {
      if (op.op === "replace") {
        const existing = result[idx];
        const label = extractLabel(op.content);
        // Update the container element's label.
        const updatedLabel = label && label !== `"${existing.text || ""}"`
          ? label
          : undefined;
        if (updatedLabel) {
          result[idx] = {
            ...existing,
            text: updatedLabel,
            label: existing.label ? { text: updatedLabel } : existing.label,
          } as ExcalidrawElement;
        }
        // Update bound text element if one exists.
        if (existing.boundElements) {
          for (const bound of existing.boundElements) {
            if (bound.type === "text" && updatedLabel) {
              const textIdx = result.findIndex((e) => e.id === bound.id);
              if (textIdx >= 0) {
                result[textIdx] = {
                  ...result[textIdx],
                  text: updatedLabel,
                } as ExcalidrawElement;
              }
            }
          }
        }
      } else {
        // insert_after — generate full elements (container + bound text).
        const newElements = parseElementDesc(op.content, aiElementId, topicMap);
        if (!newElements || newElements.length === 0) continue;

        const insertAt = op.line === 0 ? 0 : Math.min(idx + 1, result.length);
        // Position relative to the reference element if one exists.
        if (idx < result.length && newElements[0]) {
          newElements[0].x = ((result[idx].x as number) ?? 100) + 180;
          newElements[0].y = (result[idx].y as number) ?? 100;
          // Offset bound text children by the same amount.
          const dx = newElements[0].x - ((result[idx].x as number) ?? 100);
          for (let i = 1; i < newElements.length; i++) {
            newElements[i].x = (newElements[i].x ?? 0) + dx;
          }
        }
        result.splice(insertAt, 0, ...newElements);
      }
    }
  }

  // Ensure every element has an id.
  for (const el of result) {
    if (!el.id) el.id = aiElementId();
  }

  return result;
}
