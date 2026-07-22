/**
 * Append Reconcile — protect in-flight user edits from the append round-trip.
 *
 * THE PROBLEM (audit Findings 2/3/5). An append API call takes 5-10s. The client
 * sends a request-time snapshot (existingNodes/edges/actionItems/summary) and the
 * server merges the new AI extraction against THAT snapshot. But the user can keep
 * editing during the round-trip — toggle an action item, delete a topic, drag a
 * node, rename a speaker. Those edits land on the live signal but NOT in the
 * snapshot the server saw, so a raw `conversationData.value = result` clobbers
 * them. This reconciles the user's in-flight delta back on top of the server
 * result instead.
 *
 * THE SHAPE — entity-keyed three-way merge (like git):
 *   BASE   = the request-time snapshot the server merged against
 *   THEIRS = the server result (authoritative for AI growth + status checkoffs)
 *   MINE   = the current signal (BASE + the user's in-flight edits)
 * For each entity we ask "who changed it relative to BASE" and apply a
 * deterministic rule. Server wins for AI-derived growth; user wins for their
 * manual in-flight edits to entities that already existed.
 *
 * WHY A DATA DIFF, NOT AN OP-LOG: every action-item mutation in the UI funnels
 * through a whole-list `setActionItems` replace (ActionItemsCard.publishItems ->
 * onUpdateItems -> setActionItems), so there is no granular op stream to replay.
 * We diff the data instead.
 *
 * DETERMINISTIC BY DESIGN: this function calls no `new Date()` / no random. It
 * copies values that already carry their own `updated_at` (the toggle/rename ops
 * stamped MINE before the request resolved). That makes it idempotent, which is
 * what keeps the live-collab path safe (see S4 note at the call site): applying
 * it twice yields byte-identical output.
 *
 * REUSES audited logic rather than reinventing merges: `normalizeDescription` +
 * `mergeAppendEdges` from ./append-merge.ts, `renameSpeaker` from
 * ./conversation-ops.ts.
 */

import type { ConversationData } from "../types/conversation-data.ts";
import { mergeAppendEdges, normalizeDescription } from "./append-merge.ts";
import { renameSpeaker } from "./conversation-ops.ts";

type Node = ConversationData["nodes"][number];
type Edge = ConversationData["edges"][number];
type ActionItem = ConversationData["actionItems"][number];

// Undirected edge key, mirroring deleteEdge's order-independence: a user who
// severs A<->B must not see it resurrected as its directional reverse twin B->A.
function edgeKey(edge: Edge): string {
  return [edge.source_topic_id, edge.target_topic_id].sort().join("::");
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
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

// ===================================================================
// NODES
// ===================================================================

function reconcileNodes(base: Node[], mine: Node[], theirs: Node[]): Node[] {
  const baseById = byId(base);

  const result: Node[] = [];
  // Walk MINE's order first so survivors keep the user's current arrangement.
  for (const mineNode of mine) {
    const theirsNode = theirs.find((n) => n.id === mineNode.id);
    const baseNode = baseById.get(mineNode.id);

    // A node only in MINE (user added in-flight, server never saw it) — keep it.
    if (!theirsNode) {
      result.push(mineNode);
      continue;
    }

    // Present on both sides. Decide each field three-way against BASE.
    // Position: the server ALWAYS carries the request-time position over
    // (mergeAppendNodes does position: prior.position ?? node.position), so
    // theirs.position == base.position for an existing node. A user drag is the
    // only thing that moves it off base — so the user's position simply wins.
    const userDragged = baseNode &&
      positionsDiffer(mineNode.position, baseNode.position);
    const position = userDragged ? mineNode.position : theirsNode.position;

    // Content (label/emoji/color): user's in-flight rename wins for a field they
    // touched; otherwise take THEIRS (the latest AI understanding). [DEFAULT:
    // user-edit-wins per touched field — flip to `theirs` for content-wins.]
    const pick = <K extends keyof Node>(key: K): Node[K] => {
      if (baseNode && mineNode[key] !== baseNode[key]) return mineNode[key];
      return theirsNode[key];
    };

    // Aliases only grow (either side may have absorbed a merge while the
    // request was in flight) — union both, order: mine first.
    const aliases = [
      ...new Set([
        ...(mineNode.aliases ?? []),
        ...(theirsNode.aliases ?? []),
      ]),
    ];
    result.push({
      ...theirsNode,
      label: pick("label"),
      emoji: pick("emoji"),
      color: pick("color"),
      position,
      ...(aliases.length ? { aliases } : {}),
    });
  }

  // Server-new topics (in THEIRS, never in BASE, not already emitted) appended.
  // A node in BASE but not in MINE was deleted by the user in-flight — it is
  // simply absent from MINE so it never gets re-added here (no resurrection).
  const emitted = new Set(result.map((n) => n.id));
  for (const theirsNode of theirs) {
    if (emitted.has(theirsNode.id)) continue;
    if (baseById.has(theirsNode.id)) continue; // existed at request time
    result.push(theirsNode);
  }

  return result;
}

// ===================================================================
// EDGES
// ===================================================================

function reconcileEdges(
  base: Edge[],
  mine: Edge[],
  theirs: Edge[],
  survivingNodeIds: Set<string>,
): Edge[] {
  const baseKeys = new Set(base.map(edgeKey));
  const mineKeys = new Set(mine.map(edgeKey));

  const kept: Edge[] = [];
  const keptKeys = new Set<string>();
  const consider = (edge: Edge) => {
    const key = edgeKey(edge);
    if (keptKeys.has(key)) return;
    keptKeys.add(key);
    kept.push(edge);
  };

  // THEIRS edges: keep unless the user severed this pair in-flight (present in
  // BASE, gone from MINE). Undirected key so the reverse twin is caught too.
  for (const edge of theirs) {
    const key = edgeKey(edge);
    const userSevered = baseKeys.has(key) && !mineKeys.has(key);
    if (userSevered) continue;
    consider(edge);
  }
  // User-added edges (in MINE, never in BASE) union in.
  for (const edge of mine) {
    if (!baseKeys.has(edgeKey(edge))) consider(edge);
  }

  // Final pass through the audited merge for free dangling/self-loop/dup pruning
  // and to cascade-drop edges whose endpoints were deleted in-flight.
  return mergeAppendEdges(kept, [], survivingNodeIds);
}

// ===================================================================
// ACTION ITEMS
// ===================================================================

function statusChanged(a: ActionItem, b: ActionItem): boolean {
  return a.status !== b.status;
}

function reconcileActionItems(
  base: ActionItem[],
  mine: ActionItem[],
  theirs: ActionItem[],
): ActionItem[] {
  const baseById = byId(base);
  const mineById = byId(mine);

  // Items the user DELETED in-flight (in BASE, gone from MINE). Record their
  // normalized descriptions as tombstones so the server's fresh extraction can't
  // resurrect the same task under a NEW id.
  const tombstones = new Set<string>();
  for (const baseItem of base) {
    if (!mineById.has(baseItem.id)) {
      tombstones.add(normalizeDescription(baseItem.description));
    }
  }

  const result: ActionItem[] = [];
  const emitted = new Set<string>();

  // Survivors, in MINE's order.
  for (const mineItem of mine) {
    const theirsItem = theirs.find((i) => i.id === mineItem.id);
    const baseItem = baseById.get(mineItem.id);

    // User-added in-flight (not in BASE, not in THEIRS) — keep as-is.
    if (!theirsItem) {
      result.push(mineItem);
      emitted.add(mineItem.id);
      continue;
    }

    // Present both sides. Status three-way:
    const userToggled = baseItem ? statusChanged(mineItem, baseItem) : false;
    const serverChecked = baseItem
      ? statusChanged(theirsItem, baseItem)
      : false;

    let merged: ActionItem;
    if (userToggled) {
      // User touched the status in-flight. USER WINS even if the AI also checked
      // it off — a manual toggle deliberately strips ai_checked/checked_reason
      // (toggleActionItemStatus) precisely to override the AI, and honoring a
      // just-tapped toggle is consistent with that intent. Take MINE wholesale:
      // it already carries the toggled status, the stripped flags, and the
      // user's updated_at. Spreading theirs underneath would re-introduce the
      // ai_checked/checked_reason the strip removed. [DEFAULT: user-wins on the
      // both-changed conflict — flip to take `theirsItem` for AI-wins.]
      merged = mineItem;
    } else if (serverChecked) {
      // Only the server changed status — take the AI checkoff incl. its reason.
      // This is the headline self-checkoff feature; it must survive.
      merged = { ...mineItem, ...theirsItem };
    } else {
      // Neither changed status. Other fields (description/assignee/due_date):
      // user's in-flight edit wins per touched field, else THEIRS.
      merged = { ...theirsItem };
      if (baseItem) {
        if (mineItem.description !== baseItem.description) {
          merged.description = mineItem.description;
        }
        if (mineItem.assignee !== baseItem.assignee) {
          merged.assignee = mineItem.assignee;
        }
        if (mineItem.due_date !== baseItem.due_date) {
          merged.due_date = mineItem.due_date;
        }
      }
    }
    result.push(merged);
    emitted.add(mineItem.id);
  }

  // Server-new items (in THEIRS, never in BASE), unless tombstoned or a
  // semantic duplicate of something already kept.
  const seenDesc = new Set(
    result.map((i) => normalizeDescription(i.description)),
  );
  for (const theirsItem of theirs) {
    if (emitted.has(theirsItem.id)) continue;
    if (baseById.has(theirsItem.id)) continue; // existed at request time
    const desc = normalizeDescription(theirsItem.description);
    if (desc.length > 0 && (tombstones.has(desc) || seenDesc.has(desc))) {
      continue;
    }
    seenDesc.add(desc);
    result.push(theirsItem);
  }

  return result;
}

// ===================================================================
// SPEAKERS (in-flight rename reapplied onto the server's fresh transcript)
// ===================================================================

function applySpeakerRenames(
  base: ConversationData,
  mine: ConversationData,
  theirs: ConversationData,
): ConversationData {
  const baseSpeakers = base.transcript?.speakers ?? [];
  const mineSpeakers = mine.transcript?.speakers ?? [];
  if (baseSpeakers.length !== mineSpeakers.length) return theirs;

  // A rename shows up as a same-position swap base->mine. Reapply each renamed
  // pair onto THEIRS so it survives the server's freshly-concatenated transcript.
  let out = theirs;
  for (let i = 0; i < baseSpeakers.length; i++) {
    const oldName = baseSpeakers[i];
    const newName = mineSpeakers[i];
    if (oldName !== newName) {
      out = renameSpeaker(out, oldName, newName);
    }
  }
  return out;
}

// ===================================================================
// ENTRY POINT
// ===================================================================

/**
 * Layer the user's in-flight manual edits (delete/toggle/drag/rename made AFTER
 * the append request was sent) back on top of the server's authoritative
 * AI-growth result.
 *
 * @param base   request-time snapshot the server merged against (null for a
 *               brand-new conversation with no prior state — then `theirs` is
 *               returned unchanged).
 * @param mine   the current signal (base + in-flight edits).
 * @param theirs the server append result.
 *
 * Deterministic / globals-free → idempotent: reconcile(base, reconcile(...),
 * theirs) deep-equals reconcile(base, mine, theirs).
 */
export function reconcileAppendResult(
  base: ConversationData | null,
  mine: ConversationData | null,
  theirs: ConversationData,
): ConversationData {
  // Passthrough fast paths: nothing to reconcile.
  if (!base || !mine) return theirs;
  if (mine === base) return theirs;

  const nodes = reconcileNodes(base.nodes, mine.nodes, theirs.nodes);
  const survivingNodeIds = new Set(nodes.map((n) => n.id));
  const edges = reconcileEdges(
    base.edges,
    mine.edges,
    theirs.edges,
    survivingNodeIds,
  );
  const actionItems = reconcileActionItems(
    base.actionItems,
    mine.actionItems,
    theirs.actionItems,
  );

  // Server owns summary/transcript/title/statusUpdates/warnings — start from
  // THEIRS and only reapply in-flight speaker renames over the fresh transcript.
  const withSpeakers = applySpeakerRenames(base, mine, theirs);

  return {
    ...withSpeakers,
    nodes,
    edges,
    actionItems,
  };
}
