/**
 * Dice Module — Tactile tabletop dice tray for D&D / TTRPGs.
 *
 * Supports polyhedral dice (d4, d6, d8, d10, d12, d20, d100), count multipliers,
 * flat modifiers (+/-), and d20 Advantage / Disadvantage with natural 20/1 feedback.
 *
 * The JSON is the bus: rolls can be logged straight to the session Notes card with 1 tap.
 */

import { useSignal } from "@preact/signals";
import {
  soundBloom,
  soundHover,
  soundSettle,
  soundTick,
} from "../../utils/sound.ts";
import {
  conversationData,
  isViewingShared,
} from "@signals/conversationStore.ts";
import { showToast } from "@utils/toast.ts";

export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
export type RollMode = "norm" | "adv" | "dis";

export interface RollResult {
  id: string;
  timestamp: string;
  type: DieType;
  count: number;
  modifier: number;
  mode: RollMode;
  rolls: number[];
  discarded?: number;
  total: number;
  notation: string;
  isNat20: boolean;
  isNat1: boolean;
}

const DIE_SIDES: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

const DICE_LIST: DieType[] = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

export default function DiceModule() {
  const selectedDie = useSignal<DieType>("d20");
  const count = useSignal<number>(1);
  const modifier = useSignal<number>(0);
  const rollMode = useSignal<RollMode>("norm");
  const isRolling = useSignal<boolean>(false);
  const lastRoll = useSignal<RollResult | null>(null);
  const history = useSignal<RollResult[]>([]);

  function rollDie(sides: number): number {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return (arr[0] % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  function performRoll(dieType: DieType = selectedDie.value) {
    if (isRolling.value) return;
    isRolling.value = true;
    selectedDie.value = dieType;

    // Rapid tactile sound burst
    soundTick();
    setTimeout(soundTick, 40);
    setTimeout(soundTick, 85);

    const sides = DIE_SIDES[dieType];
    const n = Math.max(1, Math.min(count.value, 10));
    const mod = modifier.value;
    const mode = dieType === "d20" && n === 1 ? rollMode.value : "norm";

    setTimeout(() => {
      let rolls: number[] = [];
      let discarded: number | undefined;
      let sum = 0;
      let isNat20 = false;
      let isNat1 = false;

      if (dieType === "d20" && mode !== "norm") {
        const r1 = rollDie(20);
        const r2 = rollDie(20);
        if (mode === "adv") {
          const keep = Math.max(r1, r2);
          discarded = Math.min(r1, r2);
          rolls = [keep];
          sum = keep;
        } else {
          const keep = Math.min(r1, r2);
          discarded = Math.max(r1, r2);
          rolls = [keep];
          sum = keep;
        }
      } else {
        for (let i = 0; i < n; i++) {
          const r = rollDie(sides);
          rolls.push(r);
          sum += r;
        }
      }

      const total = sum + mod;
      if (dieType === "d20" && rolls.length === 1) {
        if (rolls[0] === 20) isNat20 = true;
        if (rolls[0] === 1) isNat1 = true;
      }

      let notation = `${n > 1 ? n : ""}${dieType}`;
      if (discarded !== undefined) {
        notation += ` (${mode === "adv" ? "Adv" : "Dis"}: ${
          rolls[0]
        }, [${discarded}])`;
      } else if (rolls.length > 1) {
        notation += ` [${rolls.join(", ")}]`;
      }
      if (mod > 0) notation += ` + ${mod}`;
      if (mod < 0) notation += ` - ${Math.abs(mod)}`;
      notation += ` = ${total}`;

      const result: RollResult = {
        id: `roll-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        type: dieType,
        count: n,
        modifier: mod,
        mode,
        rolls,
        discarded,
        total,
        notation,
        isNat20,
        isNat1,
      };

      lastRoll.value = result;
      history.value = [result, ...history.value.slice(0, 7)];
      isRolling.value = false;

      if (isNat20) {
        soundBloom();
        showToast("Natural 20! Critical Hit! ✨", "success");
      } else if (isNat1) {
        soundSettle();
        showToast("Natural 1! Critical Fumble! 💥", "warning");
      } else {
        soundSettle();
      }
    }, 140);
  }

  function logRollToNotes() {
    const roll = lastRoll.value;
    if (!roll) return;
    const current = conversationData.value;
    if (!current || isViewingShared.value) return;

    const logLine = `\n• 🎲 ${roll.notation} (${roll.timestamp})`;
    const updatedNotes = (current.notes || "").trimEnd() + logLine;
    conversationData.value = { ...current, notes: updatedNotes };
    soundBloom();
    showToast("Roll saved to session Notes ✓", "success");
  }

  function clearHistory() {
    history.value = [];
    lastRoll.value = null;
    soundTick();
  }

  const roll = lastRoll.value;

  return (
    <div class="dashboard-card dice-card">
      <div class="dashboard-card-header">
        <h3>Dice</h3>
        <div class="card-header-actions">
          {roll && !isViewingShared.value && (
            <button
              type="button"
              onClick={logRollToNotes}
              onMouseEnter={soundHover}
              class="cursor-pointer"
              data-tip="Save roll to Notes"
              aria-label="Save roll to Notes"
            >
              <i class="fa fa-note-sticky text-xs"></i>
            </button>
          )}
          {history.value.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              onMouseEnter={soundHover}
              class="cursor-pointer"
              data-tip="Clear history"
              aria-label="Clear history"
            >
              <i class="fa fa-broom text-xs"></i>
            </button>
          )}
        </div>
      </div>

      <div class="dashboard-card-body dice-body">
        {/* Active Roll Showcase Stage */}
        <div
          class={`dice-stage${isRolling.value ? " is-rolling" : ""}${
            roll?.isNat20 ? " is-nat20" : ""
          }${roll?.isNat1 ? " is-nat1" : ""}`}
        >
          <div class="dice-stage__main">
            <span class="dice-stage__total">
              {isRolling.value ? "…" : roll ? roll.total : "Roll"}
            </span>
            {roll?.isNat20 && (
              <span class="dice-nat-badge nat20">NAT 20 ✨</span>
            )}
            {roll?.isNat1 && <span class="dice-nat-badge nat1">NAT 1 💥</span>}
          </div>
          <div class="dice-stage__notation">
            {isRolling.value
              ? "Rolling " + selectedDie.value + "…"
              : roll
              ? roll.notation
              : "Tap any die to roll"}
          </div>
        </div>

        {/* Dice Selector Shelf */}
        <div class="dice-picker-grid" role="group" aria-label="Dice selector">
          {DICE_LIST.map((d) => (
            <button
              key={d}
              type="button"
              class={`dice-btn${selectedDie.value === d ? " is-selected" : ""}`}
              onMouseEnter={soundHover}
              onClick={() => performRoll(d)}
              aria-label={`Roll ${d}`}
            >
              <span class="dice-btn__name">{d}</span>
            </button>
          ))}
        </div>

        {/* Multipliers, Modifiers & Advantage Controls */}
        <div class="dice-options-row">
          {/* Count Stepper */}
          <div class="dice-stepper" title="Number of dice">
            <button
              type="button"
              onClick={() => {
                soundTick();
                count.value = Math.max(1, count.value - 1);
              }}
              aria-label="Decrease dice count"
            >
              -
            </button>
            <span class="dice-stepper__val">{count.value}d</span>
            <button
              type="button"
              onClick={() => {
                soundTick();
                count.value = Math.min(10, count.value + 1);
              }}
              aria-label="Increase dice count"
            >
              +
            </button>
          </div>

          {/* Modifier Stepper */}
          <div class="dice-stepper" title="Roll modifier">
            <button
              type="button"
              onClick={() => {
                soundTick();
                modifier.value -= 1;
              }}
              aria-label="Decrease modifier"
            >
              -
            </button>
            <span class="dice-stepper__val">
              {modifier.value >= 0 ? `+${modifier.value}` : modifier.value}
            </span>
            <button
              type="button"
              onClick={() => {
                soundTick();
                modifier.value += 1;
              }}
              aria-label="Increase modifier"
            >
              +
            </button>
          </div>

          {/* Advantage / Disadvantage Mode (for d20) */}
          <div
            class="dice-mode-toggle"
            role="group"
            aria-label="Advantage toggle"
          >
            <button
              type="button"
              class={rollMode.value === "norm" ? "is-active" : ""}
              onClick={() => {
                soundTick();
                rollMode.value = "norm";
              }}
              data-tip="Normal roll"
            >
              Norm
            </button>
            <button
              type="button"
              class={rollMode.value === "adv" ? "is-active" : ""}
              onClick={() => {
                soundTick();
                rollMode.value = "adv";
              }}
              data-tip="Advantage (roll 2, keep highest)"
            >
              Adv
            </button>
            <button
              type="button"
              class={rollMode.value === "dis" ? "is-active" : ""}
              onClick={() => {
                soundTick();
                rollMode.value = "dis";
              }}
              data-tip="Disadvantage (roll 2, keep lowest)"
            >
              Dis
            </button>
          </div>
        </div>

        {/* History Strip */}
        {history.value.length > 1 && (
          <div class="dice-history-strip" aria-label="Roll history">
            {history.value.slice(1, 5).map((h) => (
              <button
                key={h.id}
                type="button"
                class="dice-history-chip"
                onClick={() => {
                  lastRoll.value = h;
                  soundTick();
                }}
                data-tip={h.notation}
              >
                <span class="dice-history-chip__type">{h.type}:</span>
                <span class="dice-history-chip__val">{h.total}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
