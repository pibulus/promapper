/**
 * Magpie — the shelf of shiny things. Paste a link, an image URL, or any
 * scrap of text; it stays with this conversation (pointers, not payloads —
 * nothing is uploaded anywhere). Same conversation-scoped write pattern as
 * Notes: every mutation is pinned to the conversation id it was made in.
 */

import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import {
  classifyMagpie,
  MAGPIE_MAX_ITEMS,
  MAGPIE_MAX_LENGTH,
  type MagpieItem,
  magpieLabel,
} from "@utils/magpie.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";
import { showToast } from "@utils/toast.ts";

export default function MagpieModule() {
  const inputRef = useRef<HTMLInputElement>(null);
  const draft = useSignal("");
  const items = conversationData.value?.magpie ?? [];

  function add() {
    const value = draft.value.trim().slice(0, MAGPIE_MAX_LENGTH);
    const current = conversationData.value;
    if (!value || !current) return;
    if ((current.magpie?.length ?? 0) >= MAGPIE_MAX_ITEMS) {
      showToast("The shelf is full — toss something first", "warning");
      return;
    }
    const item: MagpieItem = {
      id: crypto.randomUUID(),
      kind: classifyMagpie(value),
      value,
      addedAt: new Date().toISOString(),
    };
    conversationData.value = {
      ...current,
      magpie: [...(current.magpie ?? []), item],
    };
    draft.value = "";
    soundBloom();
  }

  function remove(id: string) {
    const current = conversationData.value;
    if (!current) return;
    conversationData.value = {
      ...current,
      magpie: (current.magpie ?? []).filter((i) => i.id !== id),
    };
    soundTick();
  }

  return (
    <div class="w-full h-full">
      <div class="dashboard-card action-items-card">
        <div class="dashboard-card-header">
          <h3 data-tip="A shelf for shiny things — it holds pointers, not files">
            Magpie
          </h3>
        </div>
        <div class="action-items-scroll overflow-y-auto magpie-body">
          {items.length === 0
            ? (
              <div class="empty-state">
                <div class="empty-state-face" aria-hidden="true">
                  ( o ᴗ o )
                </div>
              </div>
            )
            : (
              <div class="magpie-list">
                {items.map((item) => (
                  <div key={item.id} class="magpie-row">
                    {item.kind === "text"
                      ? <p class="magpie-scrap">{item.value}</p>
                      : (
                        <a
                          href={item.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="magpie-link"
                          title={item.value}
                        >
                          {item.kind === "image" && (
                            <img
                              src={item.value}
                              alt=""
                              loading="lazy"
                              class="magpie-image"
                              onError={(e) =>
                                (e.currentTarget as HTMLElement).style
                                  .display = "none"}
                            />
                          )}
                          <span class="magpie-link-label">
                            <i class="fa fa-link" aria-hidden="true"></i>
                            {magpieLabel(item.value, item.kind)}
                          </span>
                        </a>
                      )}
                    <button
                      type="button"
                      class="magpie-remove"
                      onClick={() => remove(item.id)}
                      aria-label="Toss this off the shelf"
                      data-tip="Toss"
                      data-tip-align="right"
                    >
                      <i class="fa fa-times text-xs" aria-hidden="true"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
        {/* Same quiet dashed row grammar as the Actions add row. */}
        <form
          class="action-quickadd"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            class="action-quickadd-input"
            value={draft.value}
            onInput={(e) => draft.value = (e.target as HTMLInputElement).value}
            placeholder="keep a link, a picture, a scrap…"
            aria-label="Add to the Magpie shelf — a link, an image URL, or any text"
            maxLength={MAGPIE_MAX_LENGTH}
          />
        </form>
      </div>
    </div>
  );
}
