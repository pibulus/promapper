/**
 * TopicVisualizationsCard Island
 * Lazy-loading hydration wrapper for the topic visualizations. Lives in
 * islands/ (not components/) because it owns browser state — an
 * IntersectionObserver + signal — and gates the viz subtree's hydration.
 */

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
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
          // Once loaded, stop observing
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px", // Load slightly before it comes into view
        threshold: 0.1,
      },
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={cardRef} class="w-full md:col-span-2 lg:col-span-3">
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3>Topic Visualizations</h3>
        </div>
        <div class="topic-visualizations-shell">
          {isVisible.value ? <VisualizationSelector /> : (
            // Loading placeholder
            <div class="topic-visualizations-placeholder flex items-center justify-center">
              <div class="topic-visualizations-placeholder__inner">
                <div class="mb-2 topic-visualizations-placeholder__emoji">
                  📊
                </div>
                <div>Loading visualization...</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
