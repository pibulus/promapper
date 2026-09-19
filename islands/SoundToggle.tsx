/**
 * Sound Toggle — a small header control to mute/unmute the warm UI audio.
 * Persists via utils/sound.ts; un-muting plays a soft confirmation cue.
 */

import { useSignal } from "@preact/signals";
import { isSoundMuted, setSoundMuted } from "@utils/sound.ts";
import { isSpanish } from "@utils/i18n.ts";

export default function SoundToggle() {
  const muted = useSignal(isSoundMuted());

  function toggle() {
    const next = !muted.value;
    setSoundMuted(next);
    muted.value = next;
  }

  return (
    <button
      onClick={toggle}
      class="header-icon-btn"
      data-tip={isSpanish()
        ? (muted.value ? "Sin sonido" : "Con sonido")
        : (muted.value ? "Sound off" : "Sound on")}
      data-tip-align="right"
      aria-pressed={!muted.value}
      aria-label={isSpanish()
        ? (muted.value ? "Activar sonido" : "Silenciar sonido")
        : (muted.value ? "Unmute sound" : "Mute sound")}
    >
      <i
        class={`fa ${muted.value ? "fa-volume-xmark" : "fa-volume-high"}`}
        aria-hidden="true"
      >
      </i>
    </button>
  );
}
