/**
 * Bishop — the quiet advisor's brain, as pure functions.
 *
 * Builds the multi-turn message array for /api/ask: persona + conversation
 * context in the system turn, recent Q&A exchanges as real chat turns (so
 * follow-ups like "what about the pig?" keep their thread), the new question
 * last. All caps live here and are unit-tested; the route just sanitizes
 * transport-level input and calls this.
 */

import type { ChatTurn } from "./types.ts";

/** Follow-up memory: how many past exchanges ride along. */
export const BISHOP_MAX_HISTORY = 6;
/** Per-side cap on a history entry — a runaway answer shouldn't eat the
 *  context budget for the actual conversation. */
export const BISHOP_MAX_HISTORY_CHARS = 4_000;

export interface BishopExchange {
  question: string;
  answer: string;
}

const BISHOP_PERSONA = `You are Bishop, the quiet advisor inside ProMapper — a
tool that turns conversations into living project maps. Answer the user's
question using ONLY the conversation context below. Be concise and warm;
plain prose or a short list, no headings. If the answer isn't in the
context, say so honestly rather than inventing one. Earlier questions and
answers in this chat are your shared thread with the user — follow-ups may
refer back to them.`;

/**
 * Assemble the full message array. History is trimmed to the most recent
 * BISHOP_MAX_HISTORY exchanges, each side clipped to BISHOP_MAX_HISTORY_CHARS;
 * empty questions/answers are dropped (a half-exchange would break the
 * user/assistant alternation some models require).
 */
export function buildBishopMessages(
  context: string,
  history: BishopExchange[],
  question: string,
): ChatTurn[] {
  const messages: ChatTurn[] = [
    {
      role: "system",
      content: `${BISHOP_PERSONA}\n\nCONVERSATION CONTEXT:\n${context}`,
    },
  ];

  for (const exchange of history.slice(-BISHOP_MAX_HISTORY)) {
    const q = exchange.question.trim().slice(0, BISHOP_MAX_HISTORY_CHARS);
    const a = exchange.answer.trim().slice(0, BISHOP_MAX_HISTORY_CHARS);
    if (!q || !a) continue;
    messages.push({ role: "user", content: q });
    messages.push({ role: "assistant", content: a });
  }

  messages.push({ role: "user", content: question.trim() });
  return messages;
}
