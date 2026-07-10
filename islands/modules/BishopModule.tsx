/**
 * Bishop — the quiet advisor. Ask your memory a question; it answers from
 * the conversation context through the same guarded AI seam as everything
 * else. Q&A history is session-ephemeral on purpose (the conversation is
 * the record; Bishop is just a lens on it).
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import { ensureApiSession } from "@utils/apiAuth.ts";
import { enqueueApiRequest } from "@utils/requestQueue.ts";
import { formatMarkdownSafe } from "@utils/sanitize.ts";
import { showToast } from "@utils/toast.ts";

interface Exchange {
  question: string;
  answer: string;
}

export default function BishopModule() {
  const exchanges = useSignal<Exchange[]>([]);
  const asking = useSignal(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the newest exchange (effect, not a timing hack).
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [exchanges.value.length]);

  async function ask() {
    const question = inputRef.current?.value.trim() ?? "";
    const data = conversationData.value;
    if (!question || !data || asking.value) return;
    const askedId = data.conversation.id;

    asking.value = true;
    try {
      await ensureApiSession();
      const answer = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            text: data.transcript?.text ?? "",
            conversation: data,
          }),
          signal,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Bishop couldn't answer");
        }
        const json = await response.json();
        return String(json.answer ?? "");
      });

      // The conversation switched while Bishop was thinking — an answer
      // about A must not appear on B's board (Bumblefuzz #4). The remount
      // key usually destroys us first; this is the belt to that braces.
      if (conversationData.value?.conversation.id !== askedId) return;

      exchanges.value = [...exchanges.value, { question, answer }];
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Bishop couldn't answer",
        "error",
      );
    } finally {
      asking.value = false;
    }
  }

  return (
    <div class="w-full h-full">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Bishop</h3>
          <span class="card-header-tagline">ask your memory</span>
        </div>
        <div class="dashboard-card-body bishop-body">
          <div class="bishop-log" ref={logRef}>
            {exchanges.value.length === 0 && (
              <p class="bishop-empty">
                <i class="fa fa-chess-bishop" aria-hidden="true"></i>
                Ask anything about this conversation — who said what, what's
                still open, what it all means.
              </p>
            )}
            {exchanges.value.map((ex, i) => (
              <div key={i} class="bishop-exchange">
                <p class="bishop-question">{ex.question}</p>
                <div
                  class="bishop-answer"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdownSafe(ex.answer),
                  }}
                />
              </div>
            ))}
          </div>
          <form
            class="bishop-ask-row"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              class="bishop-input"
              placeholder="Ask about this conversation…"
              aria-label="Ask Bishop a question"
              maxLength={1000}
              disabled={asking.value}
            />
            <button
              type="submit"
              class="bishop-send"
              disabled={asking.value}
              aria-label="Ask"
              data-tip="Ask"
              data-tip-align="right"
            >
              <i
                class={`fa ${
                  asking.value ? "fa-spinner fa-spin" : "fa-chess-bishop"
                }`}
                aria-hidden="true"
              >
              </i>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
