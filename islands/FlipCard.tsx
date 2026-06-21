/**
 * FlipCard — a reusable dashboard-card shell that flips front <-> back in 3D.
 *
 * Wrap any dashboard component's content as the `front`; pass `back` content for
 * the flip side (utility, stats, settings — whatever fits that card). A small
 * corner button (and the back's own "flip back" button) toggle the rotation.
 *
 * Layout notes:
 * - The flip needs a 3D context (perspective) on an OUTER element and the two
 *   faces stacked with backface-visibility:hidden. .dashboard-card has
 *   overflow:hidden which would clip the rotation, so the perspective/faces live
 *   OUTSIDE it — each face is its own .dashboard-card.
 * - The grid stretches cards to equal row height; the wrapper fills that so the
 *   absolutely-positioned back face has a height to match the front.
 *
 * Island (not a component) because it owns flip state + browser interaction.
 */

import type { ComponentChildren } from "preact";
import { useSignal } from "@preact/signals";
import { hapticTap } from "@utils/haptics.ts";
import { soundToggle } from "@utils/sound.ts";

interface FlipCardProps {
  /** Front face content (typically an existing dashboard card's inner markup). */
  front: ComponentChildren;
  /** Back face content. */
  back: ComponentChildren;
  /** Accessible label for the flip control (e.g. "Action Items options"). */
  label?: string;
}

export default function FlipCard({ front, back, label }: FlipCardProps) {
  const flipped = useSignal(false);

  function toggle() {
    flipped.value = !flipped.value;
    hapticTap();
    soundToggle(flipped.value);
  }

  return (
    <div class="w-full flip-card-perspective">
      <div class={`flip-card-inner${flipped.value ? " is-flipped" : ""}`}>
        {
          /* FRONT — `inert` (not aria-hidden) on the hidden face: it removes the
            face from the a11y tree AND blocks focus, so a focused flip button
            can't be left inside an aria-hidden ancestor (invalid). */
        }
        <div
          class="flip-card-face flip-card-front"
          // @ts-ignore inert is valid HTML; Preact's types lag.
          inert={flipped.value ? true : undefined}
        >
          {front}
          <button
            type="button"
            onClick={toggle}
            class="flip-card-btn"
            title={label ? `${label} — flip` : "Flip card"}
            aria-label={label ? `${label} — flip` : "Flip card"}
          >
            <i class="fa fa-rotate" aria-hidden="true"></i>
          </button>
        </div>

        {/* BACK */}
        <div
          class="flip-card-face flip-card-back"
          // @ts-ignore inert is valid HTML; Preact's types lag.
          inert={flipped.value ? undefined : true}
        >
          {back}
          <button
            type="button"
            onClick={toggle}
            class="flip-card-btn"
            title="Flip back"
            aria-label="Flip back to front"
          >
            <i class="fa fa-rotate-left" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
