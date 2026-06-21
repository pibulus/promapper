/**
 * Sound Toggle — a small header control to mute/unmute the warm UI audio.
 * Persists via utils/sound.ts; un-muting plays a soft confirmation cue.
 */

import { useSignal } from "@preact/signals";
import { isSoundMuted, setSoundMuted } from "@utils/sound.ts";

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
      class="action-header-btn"
      style={{
        background: "var(--surface-cream)",
        padding: "0.4rem 0.6rem",
        borderRadius: "var(--border-radius-sm)",
        fontSize: "var(--small-size)",
        lineHeight: "1",
      }}
      aria-pressed={!muted.value}
      aria-label={muted.value ? "Unmute sound" : "Mute sound"}
      title={muted.value ? "Sound off" : "Sound on"}
    >
      <span aria-hidden="true">{muted.value ? "🔇" : "🔊"}</span>
    </button>
  );
}
