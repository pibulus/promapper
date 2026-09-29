/**
 * TactileLoader — Pastel-Punk / Tokyo Hi-Fi In-Between Experience.
 *
 * Marries Tokyo Hi-Fi stationery (carbon borders, mechanical tabs, paper stock)
 * with the beloved pastel-punk juice:
 * - Staggered letter-by-letter spring physics bounce
 * - Glowing pulsing disco balls, crystals, and lucky dice
 * - Animated Riso / Aperol pastel border-glow
 * - Cycling soul-filled status messages ("tuning frequencies...", "connecting dots...")
 */

import { useEffect, useState } from "preact/hooks";

interface TactileLoaderProps {
  isOpen: boolean;
  title?: string;
  customMessage?: string;
  demoMode?: boolean;
}

const EMOJIS = ["🪩", "✨", "🎲", "🔮", "⚡", "💎", "🌟", "🎙️"];

const VIBEY_MESSAGES = [
  "tuning the frequencies…",
  "syncing the wavelengths…",
  "connecting the dots…",
  "assembling your board…",
  "inking what connects…",
  "setting the table…",
  "capturing conversations…",
  "loading your vibe…",
];

export default function TactileLoader({
  isOpen,
  title = "Mapping your words…",
  customMessage,
  demoMode = false,
}: TactileLoaderProps) {
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    // Cycle emoji every 1.6s
    const emojiTimer = setInterval(() => {
      setEmojiIndex((prev) => (prev + 1) % EMOJIS.length);
    }, 1600);

    // Cycle messages every 2.0s
    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % VIBEY_MESSAGES.length);
    }, 2000);

    // Prevent body scroll when loader is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      clearInterval(emojiTimer);
      clearInterval(messageTimer);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const displayTitle = demoMode ? "Rolling a sample take…" : title;
  const currentSub = customMessage || VIBEY_MESSAGES[messageIndex];
  const currentEmoji = EMOJIS[emojiIndex];

  return (
    <div
      class="tactile-loader-scrim"
      role="status"
      aria-live="polite"
      aria-label={`${displayTitle} ${currentSub}`}
    >
      <div class="tactile-loader-wrap">
        <div class="tactile-loader-glow"></div>
        <div class="tactile-loader-card">
          {/* Stamped tab header */}
          <div class="tactile-loader-header">
            <span class="stamped-tab stamped-tab--yellow stamped-tab--sm">
              {demoMode ? "00 // ROLLING DEMO" : "LIVE // INKING BOARD"}
            </span>
            <span class="tactile-loader-led"></span>
          </div>

          {/* Glowing Emoji Pulse */}
          <div class="tactile-loader-emoji-slot">
            <span class="tactile-loader-emoji">{currentEmoji}</span>
          </div>

          {/* Letter-by-letter spring bouncing title */}
          <h3 class="tactile-loader-title">
            {displayTitle.split("").map((letter, i) => (
              <span
                key={`${letter}-${i}`}
                class="tactile-bounce-letter"
                style={{ "--char-delay": `${i * 0.035}s` }}
              >
                {letter === " " ? "\u00A0" : letter}
              </span>
            ))}
          </h3>

          {/* Cycling Witty Status Message */}
          <p class="tactile-loader-sub">{currentSub}</p>

          {/* Tactile Progress Track */}
          <div class="tactile-loader-track">
            <div class="tactile-loader-bar"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
