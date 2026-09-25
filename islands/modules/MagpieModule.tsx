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
  magpieFilesAvailable,
  saveMagpieFile,
} from "@core/storage/magpieFilesDB.ts";
import { isModuleEnabled, toggleModule } from "@signals/moduleStore.ts";
import { resampleIntoFreshMap } from "@utils/resample.ts";
import { soundBloom, soundTick } from "@utils/sound.ts";
import { copyToClipboard, showToast, showUndoToast } from "@utils/toast.ts";
import BodyPortal from "../../components/BodyPortal.tsx";

/** Matches showUndoToast's default visible duration — the deferred delete
 * must outlive the button that can cancel it. */
const UNDO_WINDOW_MS = 6000;

export default function MagpieModule() {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useSignal("");
  const isDragging = useSignal(false);
  const activeLightbox = useSignal<{ url: string; name?: string } | null>(null);
  // One object URL per shelved FILE (not just images), minted up front and
  // held in a ref so unmount can revoke every one.
  //
  // Minting eagerly is the whole trick behind the row being a real <a href>:
  // resolving the blob at click time means awaiting IndexedDB first, which
  // spends the user-gesture budget, and Safari and Firefox then swallow the
  // window.open — the click silently did nothing. A pre-minted href is an
  // ordinary link that every browser opens without argument.
  const fileUrls = useRef(new Map<string, string>());
  const urls = useSignal<Record<string, string>>({});
  const items = conversationData.value?.magpie ?? [];

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(
      items.filter((i) => i.kind === "file").map((i) => i.id),
    );

    // Revoke URLs for rows that are gone, and forget them in the SIGNAL too.
    // Dropping only the ref left the stale href rendered on the next pass —
    // undo restored a row still pointing at its revoked URL, which the
    // browser reports as ERR_FILE_NOT_FOUND until the re-mint lands.
    const stale: string[] = [];
    for (const [id, url] of fileUrls.current) {
      if (!wanted.has(id)) {
        URL.revokeObjectURL(url);
        fileUrls.current.delete(id);
        stale.push(id);
      }
    }
    if (stale.length) {
      const next = { ...urls.value };
      for (const id of stale) delete next[id];
      urls.value = next;
    }

    (async () => {
      const ghosts: string[] = [];
      for (const item of items) {
        if (!wanted.has(item.id) || fileUrls.current.has(item.id)) continue;
        const rec = await getMagpieFile(item.value);
        if (cancelled) return;
        if (!rec) {
          // The bytes are gone but the row survived — the global store cap
          // evicted them (a big drop in ANOTHER conversation can do this), or
          // this shelf arrived from a JSON backup that could not carry them.
          // A row that cannot open is a lie; drop it rather than let someone
          // click it and be told it isn't there.
          ghosts.push(item.id);
          continue;
        }
        const url = URL.createObjectURL(rec.data);
        fileUrls.current.set(item.id, url);
        urls.value = { ...urls.value, [item.id]: url };
      }
      // Only ever prune when the store could actually answer. Without
      // IndexedDB every lookup is null, and pruning then would wipe the shelf
      // of someone whose browser simply doesn't do Blob storage.
      if (!cancelled && ghosts.length && magpieFilesAvailable()) {
        const current = conversationData.value;
        if (current) {
          conversationData.value = {
            ...current,
            magpie: (current.magpie ?? []).filter((i) =>
              !ghosts.includes(i.id)
            ),
          };
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.id).join(",")]);

  useEffect(() => {
    const held = fileUrls.current;
    return () => {
      for (const url of held.values()) URL.revokeObjectURL(url);
      held.clear();
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
    // Whose shelf this is, decided ONCE. Writing a 12MB file takes long
    // enough to switch conversations mid-flight, and re-reading the signal
    // after the await would file the pointer on whatever map is open now
    // while the bytes still claim the old one.
    const owner = conversationData.value?.conversation?.id ?? "";
    const tooBig: string[] = [];

    for (const file of files) {
      if (!canAdd()) break;
      if (file.size === 0) continue; // nothing to keep
      if (file.size > MAGPIE_MAX_FILE_BYTES) {
        tooBig.push(file.name);
        continue;
      }
      // Drag-and-drop is the least reliable gesture there is, so "did that
      // work? let me do it again" is a normal thing to do. Don't punish it
      // with a double row and double the storage.
      const already = (conversationData.value?.magpie ?? []).some((i) =>
        i.kind === "file" && i.name === file.name && i.size === file.size
      );
      if (already) continue;

      const fileId = crypto.randomUUID();
      const stored = await saveMagpieFile({
        id: fileId,
        conversationId: owner,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: file,
        createdAt: new Date().toISOString(),
      });
      if (conversationData.value?.conversation?.id !== owner) return; // moved on
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

    // ONE sentence for the whole drop. A toast per rejected file stacked
    // twenty identical cards in the same corner and read as a single stuck
    // message.
    if (tooBig.length) {
      showToast(
        tooBig.length === 1
          ? `${
            tooBig[0]
          } is a bit big for the shelf — keep a link to it instead`
          : `${tooBig.length} of those are too big for the shelf — links keep better`,
        "warning",
        5000,
      );
    }
  }

  // Close lightbox on Escape
  useEffect(() => {
    if (!activeLightbox.value) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") activeLightbox.value = null;
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [activeLightbox.value]);

  function sampleIntoNotes(text: string) {
    const current = conversationData.value;
    if (!current || isViewingShared.value) return;
    const currentNotes = current.notes ? `${current.notes}\n\n` : "";
    const snippet = text.trim();
    conversationData.value = {
      ...current,
      notes: `${currentNotes}📌 From Magpie:\n> ${snippet}`,
    };
    if (!isModuleEnabled("notes")) {
      toggleModule("notes");
    }
    soundBloom();
    showToast("Sampled into Notes!", "success");
  }

  async function copyItem(text: string) {
    await copyToClipboard(text);
    showToast("Copied to clipboard!", "success");
  }

  function resampleScrap(text: string) {
    void resampleIntoFreshMap(text, {
      start: "Resampling scrap into a fresh map…",
      failed: "Couldn't resample that scrap.",
    });
  }

  function remove(id: string) {
    const current = conversationData.value;
    if (!current || isViewingShared.value) return;
    const targetConversationId = current.conversation?.id;
    const gone = (current.magpie ?? []).find((i) => i.id === id);
    conversationData.value = {
      ...current,
      magpie: (current.magpie ?? []).filter((i) => i.id !== id),
    };
    soundTick();
    if (!gone) return;

    // Undo lands only on the map the scrap was tossed from. The toast
    // outlives a map switch, and push() writes to whatever map is open — so
    // Undo after switching used to drop the scrap onto the wrong map.
    const restore = (): boolean => {
      if (conversationData.value?.conversation?.id !== targetConversationId) {
        return false;
      }
      push(gone);
      return true;
    };

    if (gone.kind !== "file") {
      showUndoToast("Tossed", restore);
      return;
    }
    // The X is a small glyph in a scrolling list and the bytes are the only
    // copy — every other destructive action here is undoable, so this one is
    // too. The delete is DEFERRED until the toast expires; taking the bytes
    // immediately would leave undo restoring a row that can never open.
    let undone = false;
    showUndoToast("Tossed", () => {
      // A refused undo still lets the delete run — otherwise the bytes are
      // orphaned in IndexedDB with no row pointing at them.
      undone = restore();
    });
    setTimeout(() => {
      if (!undone) deleteMagpieFile(gone.value);
    }, UNDO_WINDOW_MS);
  }

  const readOnly = isViewingShared.value;

  return (
    <div class="w-full h-full">
      <div
        data-dropzone
        class={`dashboard-card action-items-card${
          isDragging.value ? " magpie-card--dropping" : ""
        }`}
        onPaste={(e) => {
          // A pasted screenshot is the single best thing this shelf can
          // catch, and it arrives as a clipboard FILE, not as text. Caught on
          // the card so focus anywhere inside it counts. Keep it the ONLY
          // paste handler in here: paste bubbles, and a second one on the
          // input runs addFiles twice before either has pushed a row, so the
          // name+size dedupe sees nothing and every paste lands double.
          if (readOnly) return;
          const pasted = Array.from(e.clipboardData?.files ?? []);
          if (pasted.length) {
            e.preventDefault();
            addFiles(pasted);
          }
        }}
        onDragOver={(e) => {
          // preventDefault FIRST, guard second. The other order leaves a
          // read-only shared map as a non-target, so the browser handles the
          // drop and navigates the tab away from the map someone shared.
          e.preventDefault();
          if (readOnly) return;
          isDragging.value = true;
        }}
        onDragLeave={(e) => {
          // relatedTarget is where the pointer went. Comparing target to
          // currentTarget instead meant leaving via a CHILD row never cleared
          // the state, and the card stayed lit up as a drop target forever.
          const to = e.relatedTarget as Node | null;
          if (!to || !(e.currentTarget as Node).contains(to)) {
            isDragging.value = false;
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          isDragging.value = false;
          if (readOnly) return;
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
                      ? (
                        <div class="magpie-scrap-card flex-1 min-w-0">
                          <p class="magpie-scrap">{item.value}</p>
                        </div>
                      )
                      : item.kind === "file"
                      ? (
                        <div class="flex-1 min-w-0 flex flex-col gap-1">
                          <a
                            href={urls.value[item.id] ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="magpie-file"
                            title={`${item.name} — opens in a new tab`}
                            aria-busy={urls.value[item.id] ? undefined : "true"}
                          >
                            {(item.mime ?? "").startsWith("image/") &&
                                urls.value[item.id]
                              ? (
                                <img
                                  src={urls.value[item.id]}
                                  alt=""
                                  class="magpie-image cursor-zoom-in"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    activeLightbox.value = {
                                      url: urls.value[item.id],
                                      name: item.name,
                                    };
                                  }}
                                  onError={(e) =>
                                    (e.currentTarget as HTMLElement).style
                                      .display = "none"}
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
                                {magpieFileSize(item.size ?? 0)}{" "}
                                · on this device
                              </span>
                            </span>
                          </a>
                          {(item.mime ?? "").startsWith("audio/") &&
                            urls.value[item.id] && (
                            <audio
                              controls
                              src={urls.value[item.id]}
                              class="magpie-audio-player w-full"
                              preload="metadata"
                            />
                          )}
                        </div>
                      )
                      : (
                        <div class="flex-1 min-w-0">
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
                                class="magpie-image cursor-zoom-in"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  activeLightbox.value = { url: item.value };
                                }}
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
                        </div>
                      )}

                    {/* Action cluster on hover / focus */}
                    <div class="magpie-actions">
                      {item.kind === "text" && (
                        <>
                          <button
                            type="button"
                            class="magpie-action-btn"
                            onClick={() => sampleIntoNotes(item.value)}
                            aria-label="Sample into notes"
                            data-tip="Sample to Notes"
                          >
                            <i class="fa fa-note-sticky" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            class="magpie-action-btn"
                            onClick={() => resampleScrap(item.value)}
                            aria-label="Resample as map"
                            data-tip="Resample as Map"
                          >
                            <i
                              class="fa fa-wand-magic-sparkles"
                              aria-hidden="true"
                            >
                            </i>
                          </button>
                          <button
                            type="button"
                            class="magpie-action-btn"
                            onClick={() => copyItem(item.value)}
                            aria-label="Copy scrap"
                            data-tip="Copy"
                          >
                            <i class="fa fa-copy" aria-hidden="true"></i>
                          </button>
                        </>
                      )}

                      {item.kind === "link" && (
                        <>
                          <button
                            type="button"
                            class="magpie-action-btn"
                            onClick={() => sampleIntoNotes(item.value)}
                            aria-label="Sample link to notes"
                            data-tip="Sample to Notes"
                          >
                            <i class="fa fa-note-sticky" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            class="magpie-action-btn"
                            onClick={() => copyItem(item.value)}
                            aria-label="Copy link"
                            data-tip="Copy link"
                          >
                            <i class="fa fa-copy" aria-hidden="true"></i>
                          </button>
                        </>
                      )}

                      {item.kind === "file" && (
                        <button
                          type="button"
                          class="magpie-action-btn"
                          onClick={() => sampleIntoNotes(item.name || "File")}
                          aria-label="Sample file to notes"
                          data-tip="Sample to Notes"
                        >
                          <i class="fa fa-note-sticky" aria-hidden="true"></i>
                        </button>
                      )}

                      <button
                        type="button"
                        class="magpie-action-btn magpie-remove"
                        onClick={() => remove(item.id)}
                        aria-label="Toss this off the shelf"
                        data-tip="Toss"
                        data-tip-align="right"
                      >
                        <i class="fa fa-times text-xs" aria-hidden="true"></i>
                      </button>
                    </div>
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

      {/* Image Lightbox */}
      {activeLightbox.value && (
        <BodyPortal>
          <div
            class="magpie-lightbox-backdrop"
            onClick={() => activeLightbox.value = null}
          >
            <div
              class="magpie-lightbox-content"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                class="magpie-lightbox-close"
                onClick={() => activeLightbox.value = null}
                aria-label="Close preview"
              >
                <i class="fa fa-xmark" aria-hidden="true"></i>
              </button>
              <img
                src={activeLightbox.value.url}
                alt={activeLightbox.value.name || "Preview"}
                class="magpie-lightbox-img"
              />
            </div>
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
