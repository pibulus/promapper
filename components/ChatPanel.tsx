/**
 * ChatPanel — in-session text chat for live rooms.
 *
 * Renders as a floating FAB (with unread badge) that expands into a small
 * panel: message log + input. Presentational — messages and callbacks come
 * from the live-session wiring in HomeIsland; the room protocol, store
 * signals, and all the .chat-* CSS already existed (the old ChatSidebar was
 * dropped in the HomeIsland absorption, leaving chat a dead feature).
 */

import { useEffect, useRef } from "preact/hooks";

export interface ChatPanelMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  at: number;
}

interface ChatPanelProps {
  open: boolean;
  messages: ChatPanelMessage[];
  unread: number;
  onToggle: () => void;
  onSend: (text: string) => void;
}

/** Stable per-sender hue so names keep their color across the session. */
function senderHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export default function ChatPanel(
  { open, messages, unread, onToggle, onSend }: ChatPanelProps,
) {
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view while the panel is open.
  useEffect(() => {
    if (open) logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages.length, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function send() {
    const value = inputRef.current?.value.trim();
    if (!value) return;
    onSend(value);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!open) {
    return (
      <button
        type="button"
        class="chat-fab"
        onClick={onToggle}
        aria-label={unread > 0 ? `Open chat (${unread} unread)` : "Open chat"}
      >
        <i class="fa fa-comment" aria-hidden="true"></i> Chat
        {unread > 0 && <span class="chat-fab-badge">{unread}</span>}
      </button>
    );
  }

  return (
    <div class="chat-panel" aria-label="Room chat">
      <div class="chat-header flex items-center justify-between">
        <span class="chat-header-title">
          <i class="fa fa-comment" aria-hidden="true"></i> Room chat
        </span>
        <button
          type="button"
          class="chat-minimize-btn"
          onClick={onToggle}
          aria-label="Minimize chat"
          data-tip="Minimize"
          data-tip-align="right"
        >
          <i class="fa fa-chevron-down" aria-hidden="true"></i>
        </button>
      </div>

      <div class="chat-log" ref={logRef} role="log" aria-live="polite">
        {messages.length === 0
          ? (
            <p class="chat-empty">
              Nothing yet — say hi, it goes to everyone in the room.
            </p>
          )
          : messages.map((m) => (
            <div key={m.id} class="mb-2">
              <span class="chat-sender-name flex items-center gap-1.5">
                {
                  /* DiceBear thumbs: the same face for the same name in every
                    room — friendlier than a colored dot. Falls back to the
                    hue dot underneath while the SVG loads/if offline. */
                }
                <span
                  class="chat-avatar"
                  style={{
                    background: `hsl(${senderHue(m.senderId)} 70% 45%)`,
                  }}
                  aria-hidden="true"
                >
                  <img
                    src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${
                      encodeURIComponent(m.senderName)
                    }&radius=50`}
                    alt=""
                    loading="lazy"
                    width={20}
                    height={20}
                  />
                </span>
                {m.senderName}
              </span>
              <p class="chat-message-body">{m.text}</p>
            </div>
          ))}
      </div>

      <div class="chat-input-row flex gap-2">
        <input
          ref={inputRef}
          type="text"
          class="chat-message-input min-w-0 flex-1 rounded px-2 py-1"
          placeholder="Message the room…"
          maxLength={2000}
          aria-label="Chat message"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          class="chat-send-btn"
          onClick={send}
          aria-label="Send message"
        >
          <i class="fa fa-paper-plane" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
