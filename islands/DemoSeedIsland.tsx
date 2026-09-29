/**
 * Example / Demo seeder — behind /demo and /example.
 *
 * Randomly rolls one of our rich pop-culture or twisted narrative boards:
 * - Terminator 2: Cyberdyne Raid
 * - Sailor Moon: Tokyo Exam Prep
 * - Evil Wizard: Obsidian Spire Logistics
 * - Dusty Gulch: The Prize Pig Biting Incident
 *
 * Saves it straight into localStorage and bounces to the dashboard,
 * showing the TactileLoader during the transition.
 */

import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { saveConversation } from "@core/storage/localStorage.ts";
import { ALL_DEMOS, getRandomDemo } from "../utils/demoPresets.ts";
import TactileLoader from "../components/TactileLoader.tsx";

export default function DemoSeedIsland() {
  const status = useSignal("Rolling demo…");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if a specific preset was requested via ?preset=t2 | sailor | wizard | dusty
    const params = new URLSearchParams(window.location.search);
    const presetParam = params.get("preset")?.toLowerCase();

    let chosenDemo = getRandomDemo();
    if (presetParam) {
      const match = ALL_DEMOS.find((d) =>
        d.conversation.id.toLowerCase().includes(presetParam)
      );
      if (match) chosenDemo = match;
    }

    if (saveConversation(chosenDemo)) {
      status.value = `Opening ${chosenDemo.conversation.title}…`;
      // Brief pause to allow the TactileLoader to flash its playful vibe before landing
      setTimeout(() => {
        globalThis.location.replace(`/?open=${chosenDemo.conversation.id}`);
      }, 700);
    } else {
      status.value = "Storage write failed (full?). Nothing was seeded.";
    }
  }, []);

  return (
    <div>
      <TactileLoader isOpen demoMode />
      <p
        style={{
          textAlign: "center",
          padding: "2rem",
          color: "var(--color-text-secondary)",
        }}
      >
        {status.value}
      </p>
    </div>
  );
}
