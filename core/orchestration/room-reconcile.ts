/**
 * Room Reconcile — symmetric three-way merge for live collaborative rooms.
 *
 * Unlike AI Append Reconcile (where the AI only grows the map and never deletes),
 * live room collaboration involves human peers who actively:
 *   - delete topics
 *   - delete action items
 *   - merge topics (absorbing one into another)
 *   - move nodes
 *   - toggle action items
 *   - edit descriptions / labels
 *
 * BASE   = common ancestor room snapshot (headData before local edits)
 * MINE   = current local conversationData (BASE + local edits)
 * THEIRS = incoming room snapshot from remote peer/server
 *
 * Core Invariants:
 * 1. Quiet peer: if MINE didn't modify shared state relative to BASE, THEIRS wins completely.
 *    If THEIRS deleted it, it stays deleted (no resurrection).
 * 2. Concurrent edits:
 *    - An entity in BASE that was deleted in THEIRS and untouched in MINE is DELETED.
 *    - An entity deleted in MINE stays DELETED.
 *    - Deletion tombstones (deletedTopicLabels, deletedActionDescriptions) beat additions.
 *    - Topic merges (aliases) are preserved; absorbed nodes stay deleted.
 *    - User dragging a node wins if MINE moved it; otherwise THEIRS position is kept.
 *    - Action item status toggle wins if MINE changed it; otherwise THEIRS status is kept.
 * 3. Client-only fields (notes, magpie, whiteboardScene, warnings) belong to MINE and are preserved.
 */

import type { ConversationData } from "../types/conversation-data.ts";
import { normalizeDescription } from "./append-merge.ts";

type Node = ConversationData["nodes"][number];
type Edge = ConversationData["edges"][number];
type ActionItem = ConversationData["actionItems"][number];

function byId<T extends { id?: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (item?.id) map.set(item.id, item);
  }
  return map;
}

function positionsDiffer(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return a.x !== b.x || a.y !== b.y;
}

function edgeKey(edge: Edge): string {
  return `${edge.source_topic_id}->${edge.target_topic_id}`;
}

function stripClientFields(data: ConversationData): Record<string, unknown> {
  const {
    whiteboardScene: _s,
    notes: _notes,
    magpie: _m,
    warnings: _w,
    ...rest
  } = data;
  return rest as Record<string, unknown>;
}

export function isQuietPeer(
  base: ConversationData,
  mine: ConversationData,
): boolean {
  return JSON.stringify(stripClientFields(base)) ===
    JSON.stringify(stripClientFields(mine));
}

function nodeModified(mineNode: Node, baseNode: Node): boolean {
  const aliasesA = (mineNode.aliases ?? []).join(",");
  const aliasesB = (baseNode.aliases ?? []).join(",");
  return (
    mineNode.label !== baseNode.label ||
    mineNode.emoji !== baseNode.emoji ||
    mineNode.color !== baseNode.color ||
    aliasesA !== aliasesB ||
    positionsDiffer(mineNode.position, baseNode.position)
  );
}

function reconcileNodes(
  base: Node[],
  mine: Node[],
  theirs: Node[],
  theirsTombstones: Set<string>,
  mineTombstones: Set<string>,
): Node[] {
  const baseById = byId(base);
  const mineById = byId(mine);
  const result: Node[] = [];
  const emittedIds = new Set<string>();

  // 1. Walk THEIRS (authoritative order of incoming room head)
  for (const theirsNode of theirs) {
    const baseNode = baseById.get(theirsNode.id);
    const mineNode = mineById.get(theirsNode.id);

    if (!baseNode) {
      // Node was added by THEIRS.
      if (mineTombstones.has(normalizeDescription(theirsNode.label))) {
        continue;
      }
      result.push(theirsNode);
      emittedIds.add(theirsNode.id);
      continue;
    }

    if (!mineNode) {
      // Node was in BASE, but MINE deleted it. Local deletion wins.
      continue;
    }

    // Node is present in all three. Merge three-way:
    const moved = positionsDiffer(mineNode.position, baseNode.position);
    const position = moved ? mineNode.position : theirsNode.position;

    const labelChanged = mineNode.label !== baseNode.label;
    const label = labelChanged ? mineNode.label : theirsNode.label;

    const emojiChanged = mineNode.emoji !== baseNode.emoji;
    const emoji = emojiChanged ? mineNode.emoji : theirsNode.emoji;

    const colorChanged = mineNode.color !== baseNode.color;
    const color = colorChanged ? mineNode.color : theirsNode.color;

    // Union aliases so topic merge synonyms from both sides survive:
    const combinedAliases = [
      ...new Set([
        ...(theirsNode.aliases ?? []),
        ...(mineNode.aliases ?? []),
      ]),
    ];

    result.push({
      ...theirsNode,
      label,
      emoji,
      color,
      position,
      ...(combinedAliases.length ? { aliases: combinedAliases } : {}),
    });
    emittedIds.add(theirsNode.id);
  }

  // 2. Walk MINE for nodes added by MINE or kept despite THEIRS
  for (const mineNode of mine) {
    if (emittedIds.has(mineNode.id)) continue;
    const baseNode = baseById.get(mineNode.id);

    if (!baseNode) {
      // Added by MINE in-flight.
      if (theirsTombstones.has(normalizeDescription(mineNode.label))) {
        continue;
      }
      result.push(mineNode);
      emittedIds.add(mineNode.id);
      continue;
    }

    // Was in BASE, but absent from THEIRS -> THEIRS deleted it!
    // If MINE did not modify it, THEIRS deletion wins.
    if (!nodeModified(mineNode, baseNode)) {
      continue;
    }

    // If THEIRS tombstoned it, deletion wins.
    if (theirsTombstones.has(normalizeDescription(mineNode.label))) {
      continue;
    }
  }

  return result;
}

function itemModified(mineItem: ActionItem, baseItem: ActionItem): boolean {
  return (
    mineItem.status !== baseItem.status ||
    mineItem.description !== baseItem.description ||
    mineItem.assignee !== baseItem.assignee ||
    mineItem.due_date !== baseItem.due_date ||
    mineItem.color !== baseItem.color
  );
}

function reconcileActionItems(
  base: ActionItem[],
  mine: ActionItem[],
  theirs: ActionItem[],
  theirsTombstones: Set<string>,
  mineTombstones: Set<string>,
): ActionItem[] {
  const baseById = byId(base);
  const mineById = byId(mine);
  const result: ActionItem[] = [];
  const emittedIds = new Set<string>();

  // 1. Walk THEIRS
  for (const theirsItem of theirs) {
    const baseItem = baseById.get(theirsItem.id);
    const mineItem = mineById.get(theirsItem.id);

    if (!baseItem) {
      // Added by THEIRS.
      if (mineTombstones.has(normalizeDescription(theirsItem.description))) {
        continue;
      }
      result.push(theirsItem);
      emittedIds.add(theirsItem.id);
      continue;
    }

    if (!mineItem) {
      // In BASE, but deleted in MINE. Local deletion wins.
      continue;
    }

    // Present in all three.
    const statusChanged = mineItem.status !== baseItem.status;
    const status = statusChanged ? mineItem.status : theirsItem.status;

    const descChanged = mineItem.description !== baseItem.description;
    const description = descChanged
      ? mineItem.description
      : theirsItem.description;

    const assignee = mineItem.assignee !== baseItem.assignee
      ? mineItem.assignee
      : theirsItem.assignee;
    const due_date = mineItem.due_date !== baseItem.due_date
      ? mineItem.due_date
      : theirsItem.due_date;
    const color = mineItem.color !== baseItem.color
      ? mineItem.color
      : theirsItem.color;

    // AI attribution stripped if MINE manually toggled:
    const ai_checked = statusChanged ? undefined : theirsItem.ai_checked;
    const checked_reason = statusChanged
      ? undefined
      : theirsItem.checked_reason;

    result.push({
      ...theirsItem,
      description,
      status,
      assignee,
      due_date,
      color,
      ...(ai_checked !== undefined ? { ai_checked } : {}),
      ...(checked_reason !== undefined ? { checked_reason } : {}),
      updated_at: statusChanged || descChanged
        ? mineItem.updated_at
        : theirsItem.updated_at,
    });
    emittedIds.add(theirsItem.id);
  }

  // 2. Walk MINE
  for (const mineItem of mine) {
    if (emittedIds.has(mineItem.id)) continue;
    const baseItem = baseById.get(mineItem.id);

    if (!baseItem) {
      // Added in MINE.
      if (theirsTombstones.has(normalizeDescription(mineItem.description))) {
        continue;
      }
      result.push(mineItem);
      emittedIds.add(mineItem.id);
      continue;
    }

    // In BASE, but absent from THEIRS -> THEIRS deleted it!
    if (!itemModified(mineItem, baseItem)) {
      continue;
    }

    if (theirsTombstones.has(normalizeDescription(mineItem.description))) {
      continue;
    }
  }

  return result;
}

function reconcileEdges(
  base: Edge[],
  mine: Edge[],
  theirs: Edge[],
  survivingNodeIds: Set<string>,
): Edge[] {
  const baseKeys = new Set(base.map(edgeKey));
  const mineKeys = new Set(mine.map(edgeKey));

  const result: Edge[] = [];
  const emittedKeys = new Set<string>();

  // Process THEIRS
  for (const edge of theirs) {
    const key = edgeKey(edge);
    if (
      !survivingNodeIds.has(edge.source_topic_id) ||
      !survivingNodeIds.has(edge.target_topic_id)
    ) {
      continue;
    }
    const inBase = baseKeys.has(key);
    const inMine = mineKeys.has(key);

    if (inBase && !inMine) {
      // Was in BASE, but deleted in MINE. Local deletion wins.
      continue;
    }

    const mineEdge = mine.find((e) => edgeKey(e) === key);
    const baseEdge = base.find((e) => edgeKey(e) === key);
    let color = edge.color;
    let kind = edge.kind;
    if (mineEdge && baseEdge) {
      if (mineEdge.color !== baseEdge.color) color = mineEdge.color;
      if (mineEdge.kind !== baseEdge.kind) kind = mineEdge.kind;
    }

    result.push({ ...edge, color, kind });
    emittedKeys.add(key);
  }

  // Process MINE (added edges)
  for (const edge of mine) {
    const key = edgeKey(edge);
    if (emittedKeys.has(key)) continue;
    if (
      !survivingNodeIds.has(edge.source_topic_id) ||
      !survivingNodeIds.has(edge.target_topic_id)
    ) {
      continue;
    }
    const inBase = baseKeys.has(key);
    if (inBase) {
      // In BASE, absent in THEIRS -> THEIRS deleted it.
      continue;
    }
    result.push(edge);
    emittedKeys.add(key);
  }

  return result;
}

/**
 * Perform a three-way symmetric merge of room updates.
 */
export function reconcileRoomUpdate(
  base: ConversationData,
  mine: ConversationData,
  theirs: ConversationData,
): ConversationData {
  // Fast path: if MINE is quiet (has not changed shared data since BASE),
  // THEIRS is authoritative. Adopt THEIRS directly while preserving client-only fields.
  if (isQuietPeer(base, mine)) {
    return {
      ...theirs,
      ...(mine.notes !== undefined ? { notes: mine.notes } : {}),
      ...(mine.magpie !== undefined ? { magpie: mine.magpie } : {}),
      ...(mine.whiteboardScene !== undefined
        ? { whiteboardScene: mine.whiteboardScene }
        : {}),
      ...(mine.warnings !== undefined ? { warnings: mine.warnings } : {}),
    };
  }

  const theirsTopicTombs = new Set(
    (theirs.deletedTopicLabels ?? []).map(normalizeDescription),
  );
  const mineTopicTombs = new Set(
    (mine.deletedTopicLabels ?? []).map(normalizeDescription),
  );
  const theirsActionTombs = new Set(
    (theirs.deletedActionDescriptions ?? []).map(normalizeDescription),
  );
  const mineActionTombs = new Set(
    (mine.deletedActionDescriptions ?? []).map(normalizeDescription),
  );

  const nodes = reconcileNodes(
    base.nodes ?? [],
    mine.nodes ?? [],
    theirs.nodes ?? [],
    theirsTopicTombs,
    mineTopicTombs,
  );
  const survivingNodeIds = new Set(nodes.map((n) => n.id));

  const actionItems = reconcileActionItems(
    base.actionItems ?? [],
    mine.actionItems ?? [],
    theirs.actionItems ?? [],
    theirsActionTombs,
    mineActionTombs,
  );

  const edges = reconcileEdges(
    base.edges ?? [],
    mine.edges ?? [],
    theirs.edges ?? [],
    survivingNodeIds,
  );

  // Union tombstones, capped at 100:
  const deletedTopicLabels = [
    ...new Set([
      ...(theirs.deletedTopicLabels ?? []),
      ...(mine.deletedTopicLabels ?? []),
    ]),
  ].slice(0, 100);

  const deletedActionDescriptions = [
    ...new Set([
      ...(theirs.deletedActionDescriptions ?? []),
      ...(mine.deletedActionDescriptions ?? []),
    ]),
  ].slice(0, 100);

  // Summary & title:
  const title = mine.conversation?.title !== base.conversation?.title
    ? mine.conversation?.title
    : theirs.conversation?.title;

  const summary = mine.summary !== base.summary ? mine.summary : theirs.summary;

  // Transcript: longest / union of speakers:
  const transcriptText = (mine.transcript?.text?.length ?? 0) >
      (theirs.transcript?.text?.length ?? 0)
    ? mine.transcript?.text ?? ""
    : theirs.transcript?.text ?? "";

  const speakers = [
    ...new Set([
      ...(theirs.transcript?.speakers ?? []),
      ...(mine.transcript?.speakers ?? []),
    ]),
  ];

  return {
    ...theirs,
    conversation: {
      ...theirs.conversation,
      ...(title !== undefined ? { title } : {}),
      transcript: transcriptText,
    },
    transcript: {
      text: transcriptText,
      speakers,
    },
    nodes,
    edges,
    actionItems,
    summary,
    ...(deletedTopicLabels.length ? { deletedTopicLabels } : {}),
    ...(deletedActionDescriptions.length ? { deletedActionDescriptions } : {}),
    // Client-only fields from MINE:
    ...(mine.notes !== undefined ? { notes: mine.notes } : {}),
    ...(mine.magpie !== undefined ? { magpie: mine.magpie } : {}),
    ...(mine.whiteboardScene !== undefined
      ? { whiteboardScene: mine.whiteboardScene }
      : {}),
    ...(mine.warnings !== undefined ? { warnings: mine.warnings } : {}),
  };
}
