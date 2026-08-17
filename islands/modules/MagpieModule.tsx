/**
 * Magpie — the shelf of shiny things. Paste a link, an image URL, or any
 * scrap of text; drop or paste a FILE and the bytes go to a local Blob store
 * while the shelf keeps only a pointer to them (nothing is uploaded, ever).
 * Same conversation-scoped write pattern as Notes: every mutation is pinned
 * to the conversation id it was made in.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import {
  classifyMagpie,
  MAGPIE_MAX_ITEMS,
  MAGPIE_MAX_LENGTH,
  magpieFileIcon,
  magpieFileSize,
  type MagpieItem,
  magpieLabel,
} from "@utils/magpie.ts";
import {
  deleteMagpieFile,
  getMagpieFile,
  MAGPIE_MAX_FILE_BYTES,
  saveMagpieFile,
} from "@core/storage/magpieFilesDB.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";
import { showToast } from "@utils/toast.ts";

export default function MagpieModule() {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useSignal("");
  const isDragging = useSignal(false);
  // Object URLs minted for image thumbnails, by item id. Kept in a ref so the
  // unmount cleanup can revoke every one — a thumbnail is the easiest object
  // URL in the app to leak, because it is created during render-adjacent work
  // rather than by a click.
  const thumbUrls = useRef(new Map<string, string>());
  const thumbs = useSignal<Record<string, string>>({});
  const items = conversationData.value?.magpie ?? [];

  // Mint thumbnails for file items that are images, and revoke them when the
  // item goes away (tossed, conversation switched) or the card unmounts.
  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(
      items.filter((i) =>
        i.kind === "file" && (i.mime ?? "").startsWith("image/")
      ).map((i) => i.id),
    );

    for (const [id, url] of thumbUrls.current) {
      if (!wanted.has(id)) {
        URL.revokeObjectURL(url);
        thumbUrls.current.delete(id);
      }
    }

    (async () => {
      for (const item of items) {
        if (!wanted.has(item.id) || thumbUrls.current.has(item.id)) continue;
        const rec = await getMagpieFile(item.value);
        if (cancelled || !rec) continue;
        const url = URL.createObjectURL(rec.data);
        thumbUrls.current.set(item.id, url);
        if (!cancelled) thumbs.value = { ...thumbs.value, [item.id]: url };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.id).join(",")]);

  useEffect(() => {
    const urls = thumbUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function canAdd(): boolean {
    const current = conversationData.value;
    if (!current || isViewingShared.value) return false;
    if ((current.magpie?.length ?? 0) >= MAGPIE_MAX_ITEMS) {
      showToast("The shelf is full — toss something first", "warning");
      return false;
    }
    return true;
  }

  function push(item: MagpieItem) {
    const current = conversationData.value;
    if (!current) return;
    conversationData.value = {
      ...current,
      magpie: [...(current.magpie ?? []), item],
    };
  }

  function add() {
    const value = draft.value.trim().slice(0, MAGPIE_MAX_LENGTH);
    if (!value || !canAdd()) return;
    push({
      id: crypto.randomUUID(),
      kind: classifyMagpie(value),
      value,
      addedAt: new Date().toISOString(),
    });
    draft.value = "";
    soundBloom();
  }

  /** Drop / paste / picker all land here. Bytes to IDB, pointer to the shelf. */
  async function addFiles(files: File[]) {
    for (const file of files) {
      if (!canAdd()) return;
      if (file.size > MAGPIE_MAX_FILE_BYTES) {
        showToast(
          `${file.name} is a bit big for the shelf — keep a link to it instead`,
          "warning",
          5000,
        );
        continue;
      }
      const fileId = crypto.randomUUID();
      const stored = await saveMagpieFile({
        id: fileId,
        conversationId: conversationData.value?.conversation?.id ?? "",
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: file,
        createdAt: new Date().toISOString(),
      });
      if (!stored) {
        showToast(
          "This browser won't keep files for us — a link will stick, though",
          "warning",
          5000,
        );
        return;
      }
      push({
        id: crypto.randomUUID(),
        kind: "file",
        value: fileId,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        addedAt: new Date().toISOString(),
      });
      soundBloom();
    }
  }

  /** Open a shelved file in a new tab. The URL is revoked once it is claimed. */
  async function openFile(item: MagpieItem) {
    const rec = await getMagpieFile(item.value);
    if (!rec) {
      showToast("That one's no longer on the shelf", "warning");
      return;
    }
    const url = URL.createObjectURL(rec.data);
    globalThis.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function remove(id: string) {
    const current = conversationData.value;
    if (!current || isViewingShared.value) return;
    const gone = (current.magpie ?? []).find((i) => i.id === id);
    conversationData.value = {
      ...current,
      magpie: (current.magpie ?? []).filter((i) => i.id !== id),
    };
    // Take the bytes with it — an orphaned Blob would sit in the store
    // forever, counting against the cap and evicting things people kept.
    if (gone?.kind === "file") deleteMagpieFile(gone.value);
    soundTick();
  }

  const readOnly = isViewingShared.value;

  return (
    <div class="w-full h-full">
      <div
        class={`dashboard-card action-items-card${
          isDragging.value ? " magpie-card--dropping" : ""
        }`}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          isDragging.value = true;
        }}
        onDragLeave={(e) => {
          // Only when the pointer truly leaves the card, not on every child.
          if (e.currentTarget === e.target) isDragging.value = false;
        }}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          isDragging.value = false;
          const dropped = Array.from(e.dataTransfer?.files ?? []);
          if (dropped.length) {
            addFiles(dropped);
            return;
          }
          // Dragging a link or a selection from another tab arrives as text.
          const text = e.dataTransfer?.getData("text/plain")?.trim();
          if (text && canAdd()) {
            push({
              id: crypto.randomUUID(),
              kind: classifyMagpie(text),
              value: text.slice(0, MAGPIE_MAX_LENGTH),
              addedAt: new Date().toISOString(),
            });
            soundBloom();
          }
        }}
      >
        <div class="dashboard-card-header">
          <h3 data-tip="A shelf for shiny things — drop files, links, scraps">
            Magpie
          </h3>
          {!readOnly && (
            <div class="card-header-actions">
              <button
                type="button"
                class="header-icon-btn"
                onClick={() => fileInputRef.current?.click()}
                data-tip="Keep a file"
                data-tip-align="right"
                aria-label="Add a file to the shelf"
              >
                <i class="fa fa-paperclip" aria-hidden="true"></i>
              </button>
            </div>
          )}
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
                      : item.kind === "file"
                      ? (
                        <button
                          type="button"
                          class="magpie-file"
                          onClick={() => openFile(item)}
                          title={`${item.name} — opens in a new tab`}
                        >
                          {thumbs.value[item.id]
                            ? (
                              <img
                                src={thumbs.value[item.id]}
                                alt=""
                                class="magpie-image"
                              />
                            )
                            : (
                              <i
                                class={`fa ${
                                  magpieFileIcon(item.mime)
                                } magpie-file__icon`}
                                aria-hidden="true"
                              >
                              </i>
                            )}
                          <span class="magpie-file__meta">
                            <span class="magpie-file__name">{item.name}</span>
                            <span class="magpie-file__size">
                              {magpieFileSize(item.size ?? 0)} · on this device
                            </span>
                          </span>
                        </button>
                      )
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
            onPaste={(e) => {
              // A pasted screenshot is the single best thing this shelf can
              // catch, and it arrives as a clipboard FILE, not as text.
              const pasted = Array.from(e.clipboardData?.files ?? []);
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            placeholder="keep a link, a picture, a scrap…"
            aria-label="Add to the Magpie shelf — a link, an image URL, or any text"
            maxLength={MAGPIE_MAX_LENGTH}
          />
        </form>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          class="hidden"
          onChange={(e) => {
            const picked = Array.from(
              (e.target as HTMLInputElement).files ?? [],
            );
            if (picked.length) addFiles(picked);
            (e.target as HTMLInputElement).value = "";
          }}
        />
      </div>
    </div>
  );
}
