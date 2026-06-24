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
 * Parse a compact element description back into an Excalidraw element.
 * Format: "type (x,y) label" or "arrow (x1,y1)→(x2,y2)"
 * If the label matches a known topic, inherits that topic's color + emoji.
 */
function parseElementDesc(
  desc: string,
  nextId: () => string,
  topicMap?: Map<string, { emoji?: string; color?: string }>,
): ExcalidrawElement | null {
  const trimmed = desc.trim();
  if (!trimmed) return null;

  // Arrow: "arrow (100,200)→(250,150)"
  const arrowMatch = trimmed.match(
    /^arrow\s*\((\d+),(\d+)\)\s*→\s*\((\d+),(\d+)\)$/i,
  );
  if (arrowMatch) {
    const [, x1, y1, x2, y2] = arrowMatch.map(Number);
    return applyVibe({
      id: nextId(),
      type: "arrow",
      x: x1,
      y: y1,
      points: [[0, 0], [x2 - x1, y2 - y1]],
      strokeColor: nextArrowColor(),
    });
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
    ? [...topicMap.entries()].find(([key]) =>
      cleanLabel.toLowerCase().includes(key.toLowerCase())
    )
    : undefined;
  const topicColor = topic?.[1]?.color;
  const topicEmoji = topic?.[1]?.emoji;
  const displayLabel = topicEmoji && !cleanLabel.includes(topicEmoji)
    ? `${topicEmoji} ${cleanLabel}`
    : cleanLabel;

  if (type === "text") {
    return applyVibe({
      id: nextId(),
      type: "text",
      x,
      y,
      width: 200,
      height: 40,
      text: displayLabel,
      strokeColor: topicColor,
    });
  }

  if (type === "rectangle" || type === "diamond" || type === "ellipse") {
    return applyVibe({
      id: nextId(),
      type,
      x,
      y,
      width: 160,
      height: 80,
      text: displayLabel || undefined,
      strokeColor: topicColor,
      backgroundColor: topicColor
        ? undefined // applyVibe will fill with the palette fill matching the topic
        : undefined,
    });
  }

  // Generic: treat as text.
  return applyVibe({
    id: nextId(),
    type: "text",
    x,
    y,
    width: 200,
    height: 40,
    text: displayLabel,
    strokeColor: topicColor,
  });
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
    const idx = Math.max(0, Math.min(op.line - 1, result.length - 1));

    if (op.op === "delete" && idx < result.length) {
      result.splice(idx, 1);
      continue;
    }

    if ((op.op === "replace" || op.op === "insert_after") && op.content) {
      const newEl = parseElementDesc(op.content, aiElementId, topicMap);
      if (!newEl) continue;

      if (op.op === "replace" && idx < result.length) {
        const existing = result[idx];
        // Only update the label/text — the model's job is to refine the
        // concept, not reposition or retype the element. Preserve the
        // existing position, type, and dimensions so the diagram stays
        // visually stable.
        result[idx] = {
          ...existing,
          text: newEl.text ?? existing.text,
          label: newEl.label ?? existing.label,
          strokeColor: newEl.strokeColor ?? existing.strokeColor,
        };
      } else if (op.op === "insert_after") {
        const insertAt = op.line === 0 ? 0 : Math.min(idx + 1, result.length);
        // Position relative to the reference element if one exists.
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
