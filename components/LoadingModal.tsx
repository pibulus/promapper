/**
 * Loading Modal - Beautiful Animated Fullscreen Loader
 *
 * Features:
 * - Random loading messages with personality
 * - Random emoji animations (pulse & glow)
 * - Letter-by-letter bounce animation
 * - Floating glass-morphism card
 * - Animated gradient border
 * - Prevents body scroll when active
 */

import { useEffect } from "preact/hooks";

interface LoadingModalProps {
  isOpen: boolean;
  message?: string;
}

// Chill, vibey loading messages
const LOADING_MESSAGES = [
  "loading your vibe...",
  "syncing the wavelengths...",
  "tuning the frequencies...",
  "assembling your dashboard...",
  "connecting the dots...",
  "setting the mood...",
  "capturing conversations...",
  "mapping the topics...",
  "finding the insights...",
  "organizing your thoughts...",
];

// Modern, chill vibes emoji sets
const LOADING_EMOJIS = ["🪩", "✨", "💫", "🔮", "💎", "🌟", "🌊", "⚡"];

// Get random item from array
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export default function LoadingModal({ isOpen, message }: LoadingModalProps) {
  const loadingMessage = message ?? getRandomItem(LOADING_MESSAGES);
  const loadingEmoji = getRandomItem(LOADING_EMOJIS);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div class="loading-container">
        <div class="loading-box">
          {/* Emoji Row */}
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <span class="emoji-pulse" style={{ fontSize: "2.2rem" }}>
              {loadingEmoji}
            </span>
          </div>

          {/* Loading Text with Bounce Animation */}
          <div class="loading-text">
            {loadingMessage.split("").map((letter, i) => (
              <span
                key={i}
                class="bounce-letter"
                style={{ "--delay": `${i * 0.05}s` } as any}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>
        {`
        /* Container with animated border */
        .loading-container {
          position: relative;
          padding: 2px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.1);
          box-shadow: 0 15px 25px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }

        .loading-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 16px;
          padding: 2px;
          background: linear-gradient(135deg,
            rgba(147, 51, 234, 0.4),
            rgba(147, 51, 234, 0.1),
            rgba(236, 72, 153, 0.4),
            rgba(236, 72, 153, 0.1));
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: border-glow 3s infinite linear;
          background-size: 300% 300%;
        }

        /* Main box with float animation */
        .loading-box {
          padding: 2rem 3rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          /* Clamp so it never overflows a 320px viewport (iPhone SE). */
          min-width: min(350px, calc(100vw - 2rem));
          min-height: 180px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.05);
          animation: float 3s ease-in-out infinite;
        }

        /* Emoji with pulse animation */
        .emoji-pulse {
          display: inline-block;
          animation: pulse-glow 2s ease-in-out infinite;
          filter: drop-shadow(0 0 5px rgba(147, 51, 234, 0.5));
        }

        /* Loading text */
        .loading-text {
          width: 100%;
          text-align: center;
          font-size: 1.2rem;
          font-weight: 500;
          letter-spacing: 0.5px;
          color: rgba(255, 255, 255, 0.9);
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          min-height: 1.5em;
        }

        /* Individual letter bounce */
        .bounce-letter {
          display: inline-block;
          animation: letter-bounce 1.5s infinite;
          animation-delay: var(--delay, 0s);
        }

        /* Animations */
        @keyframes letter-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-6px);
          }
          60% {
            transform: translateY(3px);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            filter: brightness(1) drop-shadow(0 0 5px rgba(147, 51, 234, 0.5));
          }
          50% {
            opacity: 0.9;
            transform: scale(1.1);
            filter: brightness(1.2) drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
          }
        }

        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes border-glow {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 300% 300%;
          }
        }
      `}
      </style>
    </div>
  );
}
