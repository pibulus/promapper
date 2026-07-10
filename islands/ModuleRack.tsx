/**
 * The rack — where modules get switched on.
 *
 * Renders as a ghost tile at the end of the dashboard grid (same dashed
 * language as the action-items add-row) and opens a modal listing every
 * registered module with a toggle. State lives in @signals/moduleStore.
 */

import { useSignal } from "@preact/signals";
import Modal from "../components/Modal.tsx";
import { moduleRegistry } from "./modules/moduleRegistry.ts";
import { enabledModules, toggleModule } from "@signals/moduleStore.ts";
import { hapticTap } from "@utils/haptics.ts";
import { soundToggle } from "@utils/sound.ts";

export default function ModuleRack() {
  const open = useSignal(false);

  return (
    <>
      <button
        type="button"
        class="module-rack-tile"
        onClick={() => open.value = true}
        aria-haspopup="dialog"
      >
        <i class="fa fa-puzzle-piece" aria-hidden="true"></i>
        <span>Modules</span>
      </button>

      <Modal
        open={open.value}
        onClose={() => open.value = false}
        titleId="module-rack-title"
      >
        <h2 id="module-rack-title" class="module-rack-title">
          Modules
        </h2>
        <p class="module-rack-sub">
          Extra cards for this board. Everything reads and writes the same
          conversation, so they play together on their own.
        </p>
        <ul class="module-rack-list">
          {moduleRegistry.map((m) => {
            const on = enabledModules.value.includes(m.id);
            return (
              <li key={m.id} class="module-rack-row">
                <span class="module-rack-icon" aria-hidden="true">
                  <i class={`fa fa-${m.icon}`}></i>
                </span>
                <span class="module-rack-copy">
                  <span class="module-rack-name">{m.name}</span>
                  <span class="module-rack-tagline">{m.tagline}</span>
                </span>
                <button
                  type="button"
                  class={`module-rack-toggle${on ? " is-on" : ""}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${m.name} ${on ? "on" : "off"}`}
                  onClick={() => {
                    toggleModule(m.id);
                    hapticTap();
                    soundToggle(!on);
                  }}
                >
                  <span class="module-rack-toggle__knob" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
