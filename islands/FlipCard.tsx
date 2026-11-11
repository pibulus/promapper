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
  /** Optional visible pill label on the flip button (e.g. { front: "Canvas", back: "Map" }). */
  pillLabel?: { front: string; back: string };
  /** Optional custom FA icon class on the flip button when using pillLabel. */
  pillIcon?: { front: string; back: string };
  /** Optional custom tooltip copy for front/back states. */
  tipLabel?: { front: string; back: string };
  /** Notified after every flip — lets a parent lazy-mount a heavy back face
   * or clear its own "news" state. */
  onFlip?: (flipped: boolean) => void;
  /** News dot on the FRONT face's flip button ("the back has something new").
   */
  frontBadge?: boolean;
  /** News dot on the BACK face's flip button ("the front moved on"). */
  backBadge?: boolean;
}

export default function FlipCard(
  {
    front,
    back,
    label,
    pillLabel,
    pillIcon,
    tipLabel,
    onFlip,
    frontBadge,
    backBadge,
  }: FlipCardProps,
) {
  const flipped = useSignal(false);

  function toggle() {
    flipped.value = !flipped.value;
    hapticTap();
    soundToggle(flipped.value);
    onFlip?.(flipped.value);
  }

  const currentPillText = pillLabel
    ? (flipped.value ? pillLabel.back : pillLabel.front)
    : null;
  const currentIcon = pillIcon
    ? (flipped.value ? pillIcon.back : pillIcon.front)
    : (flipped.value ? "fa-rotate-left" : "fa-rotate");
  const currentTip = tipLabel
    ? (flipped.value ? tipLabel.back : tipLabel.front)
    : (flipped.value ? "Flip back" : "Flip card");

  return (
    <div
      class={`w-full flip-card-perspective${pillLabel ? " has-flip-pill" : ""}`}
    >
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
        </div>

        {/* BACK */}
        <div
          class="flip-card-face flip-card-back"
          // @ts-ignore inert is valid HTML; Preact's types lag.
          inert={flipped.value ? undefined : true}
        >
          {back}
        </div>
      </div>

      {
        /* The flip button lives OUTSIDE the rotating plane so its glyph never
          mirrors mid-turn — only the card flips, the control stays upright. */
      }
      <button
        type="button"
        onClick={toggle}
        class={`flip-card-btn${pillLabel ? " flip-card-btn--pill" : ""}${
          flipped.value ? " is-flipped" : ""
        }`}
        data-tip={currentTip}
        data-tip-align="right"
        aria-pressed={flipped.value}
        aria-label={flipped.value
          ? (currentPillText
            ? `Switch to ${currentPillText}`
            : "Flip back to front")
          : (currentPillText
            ? `Switch to ${currentPillText}`
            : (label ? `${label} — flip` : "Flip card"))}
      >
        <i
          class={`fa ${currentIcon} flip-card-btn__icon`}
          aria-hidden="true"
        >
        </i>
        {currentPillText && <span>{currentPillText}</span>}
        {(flipped.value ? backBadge : frontBadge) && (
          <span class="flip-card-btn__dot" aria-hidden="true"></span>
        )}
      </button>
    </div>
  );
}
