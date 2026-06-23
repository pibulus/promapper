/**
 * Chat Sidebar — in-session text chat for a live room.
 *
 * A minimize-able panel: shows the message log with an unread badge when
 * collapsed, auto-scrolls to the newest message (unless the user has scrolled
 * up), and sends on Enter. Reads chatMessages from the connection store.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  chatMessages,
  unreadChatCount,
} from "@signals/partyConnectionStore.ts";
import { sendChatMessage } from "@signals/liveSync.ts";
import { userColor } from "@signals/presenceStore.ts";
import { soundChime } from "@utils/sound.ts";

export default function ChatSidebar() {
  const open = useSignal(true);
  const draft = useSignal("");
  const stickToBottom = useSignal(true);
  const logRef = useRef<HTMLDivElement>(null);

  const messages = chatMessages.value;

  // Auto-scroll to newest unless the user scrolled up; track unread when closed.
  useEffect(() => {
    if (open.value && stickToBottom.value && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    if (open.value) unreadChatCount.value = 0;
    else unreadChatCount.value = messages.length;
  }, [messages.length, open.value]);

  function onScroll() {
    const el = logRef.current;
    if (!el) return;
    stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function submit() {
    const text = draft.value.trim();
    if (!text) return;
    sendChatMessage(text);
    soundChime();
    draft.value = "";
    stickToBottom.value = true;
  }

  if (!open.value) {
    const unread = unreadChatCount.value;
    return (
      <button
        onClick={() => (open.value = true)}
        class="action-header-btn chat-fab"
        aria-label="Open chat"
        aria-expanded={false}
      >
        💬 Chat{unread > 0 ? ` · ${unread}` : ""}
      </button>
    );
  }

  return (
    <div class="chat-panel">
      <div class="flex items-center justify-between chat-header">
        <span class="chat-header-title">💬 Room chat</span>
        <button
          onClick={() => (open.value = false)}
          class="chat-minimize-btn"
          aria-label="Minimize chat"
          aria-expanded
        >
          ▾
        </button>
      </div>

      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        aria-label="Chat messages"
        class="chat-log"
      >
        {messages.length === 0
          ? <p class="chat-empty">Say hi 👋</p>
          : messages.map((m) => (
            <div key={m.id} style={{ marginBottom: "0.5rem" }}>
              <span class="inline-flex items-center gap-1 chat-sender-name">
                <span
                  aria-hidden="true"
                  class="chat-sender-dot"
                  style={{ background: userColor(m.senderId) }}
                />
                {m.senderName}
              </span>
              <div class="chat-message-body">
                {m.text}
              </div>
            </div>
          ))}
      </div>

      <div class="flex gap-2 chat-input-row">
        <input
          value={draft.value}
          onInput={(e) => (draft.value = (e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message…"
          aria-label="Chat message"
          class="flex-1 rounded px-2 py-1 focus:outline-none chat-message-input"
        />
        <button
          onClick={submit}
          class="action-header-btn chat-send-btn"
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
