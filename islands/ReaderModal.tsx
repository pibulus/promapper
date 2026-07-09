/**
 * ReaderModal — a roomy fullscreen reader for long card content.
 *
 * Mounted once; opens whenever `reader` signal is set (via openReader from a
 * card's expand button). Escape or backdrop click closes it. Lets the dashboard
 * cards stay compact + equal-height while full content is one click away.
 */

import { useEffect } from "preact/hooks";
import { closeReader, reader } from "@signals/readerStore.ts";

export default function ReaderModal() {
  const content = reader.value;

  useEffect(() => {
    if (!content) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeReader();
    }
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the reader is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [content]);

  if (!content) return null;

  return (
    <div
      class="reader-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeReader();
      }}
    >
      <div class="reader-panel" role="dialog" aria-modal="true">
        <div class="reader-panel__header">
          <h3>{content.title}</h3>
          <button
            type="button"
            class="reader-panel__close"
            onClick={closeReader}
            data-tip="Close"
            data-tip-align="right"
            aria-label="Close reader"
          >
            <i class="fa fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div
          class={`reader-panel__body${content.mono ? " is-mono" : ""}`}
          dangerouslySetInnerHTML={{ __html: content.html }}
        />
      </div>
    </div>
  );
}
