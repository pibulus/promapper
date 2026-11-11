/**
 * TopicVisualizationsCard Island
 * Lazy-loading hydration wrapper for the topic visualizations. Lives in
 * islands/ (not components/) because it owns browser state — an
 * IntersectionObserver + signal — and gates the viz subtree's hydration.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import VisualizationSelector from "./VisualizationSelector.tsx";

export default function TopicVisualizationsCard() {
  const isVisible = useSignal(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy load visualization when card becomes visible
  useEffect(() => {
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          isVisible.value = true;
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      },
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, []);

  const nodeCount = conversationData.value?.nodes?.length ?? 0;

  return (
    <div class="dashboard-card" ref={cardRef}>
      <div class="dashboard-card-header">
        <div class="card-header-title">
          <span class="card-header-icon" aria-hidden="true">
            <i class="fa fa-diagram-project"></i>
          </span>
          <h3 class="card-header-heading">Topic Map</h3>
          {nodeCount > 0 && (
            <span class="card-header-count">
              {nodeCount} {nodeCount === 1 ? "topic" : "topics"}
            </span>
          )}
        </div>
        <div class="card-header-actions">
          {isVisible.value && nodeCount > 0 && (
            <>
              <button
                type="button"
                class="card-icon-btn tooltip-btn"
                data-tip="Save map as PNG"
                aria-label="Save map as PNG"
                onClick={() =>
                  globalThis.dispatchEvent(
                    new CustomEvent("promapper:map-export-png"),
                  )}
              >
                <i class="fa fa-camera" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="card-icon-btn tooltip-btn"
                data-tip="Open fullscreen"
                aria-label="Open map fullscreen"
                onClick={() =>
                  globalThis.dispatchEvent(
                    new CustomEvent("promapper:map-fullscreen"),
                  )}
              >
                <i class="fa fa-maximize" aria-hidden="true"></i>
              </button>
            </>
          )}
        </div>
      </div>
      <div class="topic-visualizations-shell">
        {isVisible.value
          ? <VisualizationSelector />
          : (
            <div class="topic-visualizations-placeholder flex items-center justify-center">
              <div class="topic-visualizations-placeholder__inner">
                <div class="mb-2 topic-visualizations-placeholder__emoji">
                  🗺️
                </div>
                <div>Preparing topic map…</div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
