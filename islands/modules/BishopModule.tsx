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
  // The in-flight answer, rendered live as chunks arrive. null = not asking.
  const draft = useSignal<Exchange | null>(null);
  // While Bishop thinks, one of these shows with slow dots — picked fresh
  // per ask so every fire is a little different.
  const THINKING_LINES = [
    "consulting the record",
    "turning the pages back",
    "weighing what was said",
    "reading between the lines",
    "thinking it over, properly",
    "finding where that thread went",
  ];
  const thinkingLine = useSignal(THINKING_LINES[0]);

  // Keep the log pinned to the newest exchange (effect, not a timing hack).
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [exchanges.value.length, draft.value?.answer.length]);

  async function ask() {
    const question = inputRef.current?.value.trim() ?? "";
    const data = conversationData.value;
    if (!question || !data || asking.value) return;
    const askedId = data.conversation.id;

    asking.value = true;
    thinkingLine.value =
      THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)];
    draft.value = { question, answer: "" };
    try {
      await ensureApiSession();
      // Follow-ups keep their thread: recent exchanges ride along.
      const history = exchanges.value.slice(-6);
      const body = {
        question,
        text: data.transcript?.text ?? "",
        conversation: data,
        history,
      };

      const answer = await enqueueApiRequest(async ({ signal }) => {
        // Streaming first — the answer appears as it's written. If the
        // stream won't START (proxy, 502), fall back to the JSON path.
        try {
          const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, stream: true }),
            signal,
          });
          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let text = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              text += decoder.decode(value, { stream: true });
              if (draft.value) draft.value = { question, answer: text };
            }
            if (text.trim()) return text;
            // Empty stream = upstream died before a word — fall through.
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            throw err;
          }
          // Stream path failed — try the JSON path below.
        }

        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
      draft.value = null;
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
            {draft.value && (
              <div class="bishop-exchange">
                <p class="bishop-question">{draft.value.question}</p>
                {draft.value.answer
                  ? (
                    <div
                      class="bishop-answer"
                      dangerouslySetInnerHTML={{
                        __html: formatMarkdownSafe(draft.value.answer),
                      }}
                    />
                  )
                  : (
                    <p class="bishop-answer bishop-thinking">
                      <span>{thinkingLine.value}</span>
                      <span class="bishop-dot" aria-hidden="true" />
                      <span class="bishop-dot" aria-hidden="true" />
                      <span class="bishop-dot" aria-hidden="true" />
                    </p>
                  )}
              </div>
            )}
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
