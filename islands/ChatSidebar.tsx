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
        class="action-header-btn"
        style={{
          position: "fixed",
          right: "1rem",
          bottom: "1rem",
          zIndex: "var(--z-drawer)",
          padding: "0.6rem 0.9rem",
          borderRadius: "999px",
          background: "var(--color-accent)",
          color: "#fff",
          fontWeight: "700",
          boxShadow: "var(--shadow-lg)",
        }}
        aria-label="Open chat"
      >
        💬 Chat{unread > 0 ? ` · ${unread}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        zIndex: "var(--z-drawer)",
        width: "min(320px, calc(100vw - 2rem))",
        height: "min(420px, 60vh)",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-cream)",
        border: "2px solid var(--color-border)",
        borderRadius: "var(--border-radius)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      <div
        class="flex items-center justify-between"
        style={{
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--soft-cream-dark)",
        }}
      >
        <span style={{ fontWeight: "700", fontSize: "var(--small-size)" }}>
          💬 Room chat
        </span>
        <button
          onClick={() => (open.value = false)}
          aria-label="Minimize chat"
          style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}
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
        style={{ flex: "1", overflowY: "auto", padding: "0.5rem 0.75rem" }}
      >
        {messages.length === 0
          ? (
            <p
              style={{
                fontSize: "var(--tiny-size)",
                color: "var(--color-text-secondary)",
                textAlign: "center",
                marginTop: "1rem",
              }}
            >
              Say hi 👋
            </p>
          )
          : messages.map((m) => (
            <div key={m.id} style={{ marginBottom: "0.5rem" }}>
              <span
                class="inline-flex items-center gap-1"
                style={{
                  fontSize: "var(--tiny-size)",
                  fontWeight: "700",
                  color: "var(--color-text)", // readable; color moves to the dot
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: userColor(m.senderId),
                    display: "inline-block",
                  }}
                />
                {m.senderName}
              </span>
              <div
                style={{
                  fontSize: "var(--small-size)",
                  color: "var(--color-text)",
                  wordBreak: "break-word",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
      </div>

      <div
        class="flex gap-2"
        style={{
          padding: "0.5rem 0.75rem",
          borderTop: "1px solid var(--color-border)",
        }}
      >
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
          class="flex-1 rounded px-2 py-1 focus:outline-none"
          style={{
            fontSize: "var(--small-size)",
            border: "2px solid var(--color-border)",
            background: "var(--soft-cream)",
          }}
        />
        <button
          onClick={submit}
          class="action-header-btn"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
            padding: "0 0.75rem",
            borderRadius: "var(--border-radius-sm)",
            fontWeight: "700",
          }}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
