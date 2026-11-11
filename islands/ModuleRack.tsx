/**
 * Board Shelf (ModuleRack) — content-aware card shelf & customization drawer.
 *
 * Renders across the foot of the dashboard grid (col-span-full) as a warm,
 * compact tactile shelf: any card hidden because it currently has no content
 * (e.g. Actions, Topic Map, Notes, Ask, Magpie, Sound, Dice, Takes) can be
 * summoned onto the board in 1 tap, alongside a "Customize" modal for full
 * descriptions, toggles, and layout reset.
 */

import { useSignal } from "@preact/signals";
import Modal from "../components/Modal.tsx";
import { moduleRegistry } from "@utils/moduleRegistry.ts";
import { hideModule, showModule } from "@signals/moduleStore.ts";
import { boardCustomized, resetBoard } from "@signals/boardOrderStore.ts";
import { hapticTap } from "@utils/haptics.ts";
import { soundHover, soundToggle } from "@utils/sound.ts";
import { showToast } from "@utils/toast.ts";

export interface HiddenCoreCard {
  id: string;
  name: string;
  icon: string;
}

export interface ModuleRackProps {
  /** Core cards hidden right now because they have no content yet. */
  hiddenCoreCards?: HiddenCoreCard[];
  /** Reveal an empty core card onto the board so the user can add to it. */
  onRevealCoreCard?: (id: string) => void;
  /** Optional module ids currently visible on the board (enabled or auto-shown). */
  visibleModuleIds?: string[];
}

export default function ModuleRack({
  hiddenCoreCards = [],
  onRevealCoreCard,
  visibleModuleIds = [],
}: ModuleRackProps = {}) {
  const open = useSignal(false);
  const visibleSet = new Set(visibleModuleIds);
  const hiddenModules = moduleRegistry.filter((m) => !visibleSet.has(m.id));
  const hasQuickAdd = hiddenCoreCards.length > 0 || hiddenModules.length > 0;

  return (
    <>
      <div class="board-shelf" role="region" aria-label="Board tools and cards">
        <div class="board-shelf__pills">
          {hasQuickAdd && (
            <span class="board-shelf__label">
              Add card
            </span>
          )}
          {hiddenCoreCards.map((card) => (
            <button
              key={card.id}
              type="button"
              class="board-shelf__pill board-shelf__pill--core"
              onMouseEnter={soundHover}
              onClick={() => {
                onRevealCoreCard?.(card.id);
                hapticTap();
                soundToggle(true);
              }}
              data-tip={`Open ${card.name} on this board`}
            >
              <i class={`fa ${card.icon}`} aria-hidden="true"></i>
              <span>+ {card.name}</span>
            </button>
          ))}
          {hiddenModules.map((m) => (
            <button
              key={m.id}
              type="button"
              class="board-shelf__pill"
              onMouseEnter={soundHover}
              onClick={() => {
                showModule(m.id);
                hapticTap();
                soundToggle(true);
              }}
              data-tip={m.tagline}
            >
              <i class={`fa ${m.icon}`} aria-hidden="true"></i>
              <span>+ {m.name}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          class="board-shelf__customize"
          onMouseEnter={soundHover}
          onClick={() => open.value = true}
          aria-haspopup="dialog"
          data-tip="Customize board cards and arrangement"
          data-tip-align="right"
        >
          <i class="fa fa-puzzle-piece" aria-hidden="true"></i>
          <span>Customize</span>
        </button>
      </div>

      <Modal
        open={open.value}
        onClose={() => open.value = false}
        titleId="module-rack-title"
      >
        <h2 id="module-rack-title" class="module-rack-title">
          Board cards
        </h2>
        <p class="module-rack-sub">
          Empty cards stay tucked out of your way until they have something to
          show — or flip any tool on here whenever you want it on the table.
        </p>
        <ul class="module-rack-list">
          {moduleRegistry.map((m) => {
            const on = visibleSet.has(m.id);
            return (
              <li key={m.id} class="module-rack-row">
                <span class="module-rack-icon" aria-hidden="true">
                  <i class={`fa ${m.icon}`}></i>
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
                    if (on) {
                      hideModule(m.id);
                    } else {
                      showModule(m.id);
                    }
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
        {boardCustomized() && (
          <button
            type="button"
            class="module-rack-reset"
            onClick={() => {
              resetBoard();
              hapticTap();
              showToast("Board back to its designed arrangement", "success");
            }}
          >
            <i class="fa fa-rotate-left" aria-hidden="true"></i>
            Reset card sizes &amp; arrangement
          </button>
        )}
      </Modal>
    </>
  );
}
