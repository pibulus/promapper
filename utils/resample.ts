// ===================================================================
// Resample — turn a piece of text (a Magpie scrap, the notes, an export)
// into a fresh map.
//
// The open map steps aside for the brew state while the request runs, and
// steps BACK if the request fails. It used to stay aside: a failed resample
// left an empty table where the map had been, with its modules switched off.
// The map was still in history, but nothing on screen said so. This was
// three copy-pasted functions (Magpie, Notes, MarkdownMaker) with the same
// bug; one lives here now.
// ===================================================================

import {
  conversationData,
  processingConversation,
} from "@signals/conversationStore.ts";
import { resetModules } from "@signals/moduleStore.ts";
import { flushPendingSave } from "@core/storage/localStorage.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { enqueueApiRequest } from "@utils/requestQueue.ts";
import { coerceFlowResult } from "@utils/coerceFlowResult.ts";
import { soundBloom } from "@utils/sound.ts";
import { showErrorToast, showToast } from "@utils/toast.ts";

export async function resampleIntoFreshMap(
  text: string,
  messages: { start: string; failed: string },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const previous = conversationData.value;
  flushPendingSave();
  conversationData.value = null;
  processingConversation.value = true;
  showToast(messages.start, "info");
  try {
    await ensureApiSession();
    const result = await enqueueApiRequest(async ({ signal }) => {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Processing failed");
      }
      return response.json();
    });
    const flowResult = coerceFlowResult(result);
    if (!flowResult) {
      throw new Error("Server returned an unexpected response — try again.");
    }
    // Modules reset only once the new map is real — resetting up front is
    // what switched them off on the map a failure handed back.
    resetModules();
    conversationData.value = flowResult;
    soundBloom();
    showToast(
      `Resampled! Found ${flowResult.actionItems.length} action items, ${flowResult.nodes.length} topics`,
      "success",
    );
  } catch (err) {
    console.error("❌ Resample failed:", err);
    // Only if nothing else took the table meanwhile (a history pick, say).
    if (conversationData.value === null) conversationData.value = previous;
    showErrorToast(err, messages.failed);
  } finally {
    processingConversation.value = false;
  }
}
