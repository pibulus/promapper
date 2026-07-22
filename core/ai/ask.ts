/**
 * Ask — the question-answering brain, as pure functions.
 *
 * Builds the multi-turn message array for /api/ask: instructions +
 * conversation context in the system turn, recent Q&A exchanges as real chat
 * turns (so follow-ups like "what about the pig?" keep their thread), the new
 * question last. All caps live here and are unit-tested; the route just
 * sanitizes transport-level input and calls this.
 */

import type { ChatTurn } from "./types.ts";

/** Follow-up memory: how many past exchanges ride along. */
export const ASK_MAX_HISTORY = 6;
/** Per-side cap on a history entry — a runaway answer shouldn't eat the
 *  context budget for the actual conversation. */
export const ASK_MAX_HISTORY_CHARS = 4_000;

export interface AskExchange {
  question: string;
  answer: string;
}

const ASK_SYSTEM = `You answer questions inside ProMapper — a tool that turns
conversations into living project maps. Answer the user's question using ONLY
the conversation context below. Be concise and warm; plain prose or a short
list, no headings. A touch of dry warmth is welcome — one quiet aside at
most, and never at the cost of the answer. If the answer isn't in the
context, say so honestly rather than inventing one. Earlier questions and
answers in this chat are your shared thread with the user — follow-ups may
refer back to them.`;

/**
 * Assemble the full message array. History is trimmed to the most recent
 * ASK_MAX_HISTORY exchanges, each side clipped to ASK_MAX_HISTORY_CHARS;
 * empty questions/answers are dropped (a half-exchange would break the
 * user/assistant alternation some models require).
 */
export function buildAskMessages(
  context: string,
  history: AskExchange[],
  question: string,
): ChatTurn[] {
  const messages: ChatTurn[] = [
    {
      role: "system",
      content: `${ASK_SYSTEM}\n\nCONVERSATION CONTEXT:\n${context}`,
    },
  ];

  for (const exchange of history.slice(-ASK_MAX_HISTORY)) {
    const q = exchange.question.trim().slice(0, ASK_MAX_HISTORY_CHARS);
    const a = exchange.answer.trim().slice(0, ASK_MAX_HISTORY_CHARS);
    if (!q || !a) continue;
    messages.push({ role: "user", content: q });
    messages.push({ role: "assistant", content: a });
  }

  messages.push({ role: "user", content: question.trim() });
  return messages;
}
