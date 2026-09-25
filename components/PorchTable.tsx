/**
 * PorchTable — the porch's second screen, below the membrane.
 *
 * One finished board laid out on the table as fun-size specimens of the REAL
 * cards: the same .dashboard-card / action-item / transcript classes and the
 * same formatTranscriptSafe renderer, so they re-theme with every roll and
 * can't drift from the dashboard. Pictures of the tool, not the tool — nothing
 * in a specimen takes a tap (CSS: pointer-events), only the two doors do.
 *
 * The content IS the /example board (The Halloran Situation, the same weird
 * human material as DemoSeedIsland), so "Open the whole board" lands on exactly
 * what's shown here. It stays English on /es — the board it opens is English
 * too; only the words around it are translated.
 */

import { formatTranscriptSafe } from "../utils/sanitize.ts";
import { speakerColor } from "@core/theme/speakerColors.ts";
import { t } from "../utils/i18n.ts";

const SPEAKERS = ["Sheriff Dun", "Deputy Ruiz"];

const TRANSCRIPT =
  `Sheriff Dun: Right, third callout this week. Start from the top.
Deputy Ruiz: Marge Halloran. Bit the postman Tuesday, Terry at the feed store Thursday, and this morning, the vet.
Sheriff Dun: She bit the vet.
Deputy Ruiz: Doc Feeney already ran bloods. Came back clean. Better than clean, actually.`;

const ACTIONS: {
  text: string;
  who: string;
  when?: string;
  why?: string;
}[] = [
  // One still open, one that ticked itself off (the real board keeps done
  // items last, so this order matches it).
  {
    text: "Fence the sinkhole before anyone else goes down",
    who: "Dun",
    when: "this week",
  },
  {
    text: "Get Doc Feeney to run the bloods",
    who: "Ruiz",
    why: "Ruiz says Feeney already ran them — came back clean.",
  },
];

// Hand-placed on a 320×232 board. The real map is a D3 force layout — far too
// much machinery for a picture on the porch.
const NODES = [
  { x: 160, y: 108, emoji: "🧑‍🌾", label: "Marge Halloran" },
  { x: 66, y: 58, emoji: "🦷", label: "The biting" },
  { x: 254, y: 58, emoji: "🕳️", label: "The sinkhole" },
  { x: 62, y: 164, emoji: "🩸", label: "Bloodwork" },
  { x: 248, y: 164, emoji: "🔮", label: "Cormac's curse theory" },
  { x: 160, y: 194, emoji: "🦙", label: "The alpacas" },
  { x: 160, y: 24, emoji: "🎟️", label: "Terry's ticket stand" },
];
const EDGES = [
  [0, 1],
  [0, 2],
  [2, 4],
  [0, 3],
  [1, 3],
  [0, 5],
  [2, 6],
  [1, 6],
];

/** A gentle bow, like the real map's quadratic edges. */
function curve(a: typeof NODES[number], b: typeof NODES[number]): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bow = 0.12;
  const cx = (a.x + b.x) / 2 - dy * bow;
  const cy = (a.y + b.y) / 2 + dx * bow;
  return `M${a.x} ${a.y}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

export default function PorchTable() {
  const i18n = t();

  return (
    <section
      id="table"
      class="porch-table"
      aria-labelledby="porch-table-title"
    >
      <header class="porch-table__head">
        <h2 id="porch-table-title" class="porch-table__title">
          {i18n.tableTitle}
        </h2>
        <p class="porch-table__lede">{i18n.tableLede}</p>
      </header>

      <div class="porch-table__grid">
        <figure class="porch-specimen" style={{ "--tilt": "-1deg" }}>
          <div class="dashboard-card porch-card">
            <div class="dashboard-card-header">
              <h3>Transcript</h3>
            </div>
            <div
              class="porch-card__body transcript-content"
              dangerouslySetInnerHTML={{
                __html: formatTranscriptSafe(TRANSCRIPT, SPEAKERS),
              }}
            />
          </div>
          <figcaption class="porch-note">{i18n.tableTranscriptNote}</figcaption>
        </figure>

        <figure class="porch-specimen" style={{ "--tilt": "0.7deg" }}>
          <div class="dashboard-card porch-card">
            <div class="dashboard-card-header">
              <h3>Actions</h3>
            </div>
            <ul class="porch-card__body porch-actions">
              {ACTIONS.map((item) => (
                <li class="action-item-card" key={item.text}>
                  <div class="porch-action">
                    <div class="porch-action__words">
                      <p
                        class={`action-item-description${
                          item.why ? " is-completed" : ""
                        }`}
                      >
                        {item.text}
                      </p>
                      <div class="action-item-meta">
                        <span
                          class="action-person-chip"
                          style={{
                            "--person-color": speakerColor(
                              item.who,
                              SPEAKERS,
                            ),
                          }}
                        >
                          @{item.who}
                        </span>
                        {item.when && (
                          <span class="action-when-chip">
                            <i class="fa fa-clock" aria-hidden="true"></i>
                            {item.when}
                          </span>
                        )}
                      </div>
                      {item.why && (
                        <div class="action-item-ai">
                          <span class="action-item-chip action-item-chip--ai">
                            ticked itself off
                          </span>
                          <p class="action-item-ai-reason">“{item.why}”</p>
                        </div>
                      )}
                    </div>
                    <span
                      class={`action-item-checkbox-button${
                        item.why ? " is-checked" : ""
                      }`}
                      aria-hidden="true"
                    >
                      {item.why && <i class="fa fa-check"></i>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <figcaption class="porch-note">{i18n.tableActionsNote}</figcaption>
        </figure>

        <figure class="porch-specimen" style={{ "--tilt": "-0.5deg" }}>
          <div class="dashboard-card porch-card">
            <div class="dashboard-card-header">
              <h3>Map</h3>
            </div>
            <svg
              class="porch-card__body porch-map"
              viewBox="0 0 320 232"
              role="img"
              aria-label={i18n.tableMapLabel}
            >
              {EDGES.map(([a, b]) => (
                <path key={`${a}-${b}`} d={curve(NODES[a], NODES[b])} />
              ))}
              {NODES.map((node) => (
                <g
                  key={node.label}
                  transform={`translate(${node.x} ${node.y})`}
                >
                  <circle r="14" />
                  <text class="porch-map__emoji" dy="0.35em">{node.emoji}</text>
                  <text class="porch-map__label" y="27">{node.label}</text>
                </g>
              ))}
            </svg>
          </div>
          <figcaption class="porch-note">{i18n.tableMapNote}</figcaption>
        </figure>
      </div>

      {
        /* The header's loop, in order — Add · Invite · Export — said as what
          happens, not as buttons to go find. */
      }
      <ul class="porch-loop">
        <li>
          <i class="fa fa-microphone" aria-hidden="true"></i>
          {i18n.tableLoopAdd}
        </li>
        <li>
          <i class="fa fa-user-plus" aria-hidden="true"></i>
          {i18n.tableLoopInvite}
        </li>
        <li>
          <i class="fa fa-file-export" aria-hidden="true"></i>
          {i18n.tableLoopExport}
        </li>
      </ul>

      <div class="porch-doors">
        <a href="/example" class="porch-door">
          {i18n.tableOpen}
          <i class="fa fa-arrow-right" aria-hidden="true"></i>
        </a>
        <a href="#porch" class="porch-back">
          <i class="fa fa-microphone" aria-hidden="true"></i>
          {i18n.tableBack}
        </a>
      </div>
    </section>
  );
}
