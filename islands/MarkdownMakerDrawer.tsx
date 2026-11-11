/**
 * MarkdownMaker Drawer Island — Export Studio
 *
 * Right-hand slide-in studio for turning mapped conversations into crisp
 * documents, summaries, decks, or custom artifacts — with instant formatted
 * document preview, inline Markdown editing, PDF/Markdown download, and local
 * snapshots.
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  buildExportPrompt,
  DECK_PROMPT_ID,
  markdownPrompts,
  parseFormatMismatch,
  pickExportFormats,
} from "../utils/markdownPrompts.ts";
import { buildDeckUrl, parseDeckJson } from "../utils/deckExport.ts";
import {
  soundBloom,
  soundHover,
  soundTick,
  soundToggle,
} from "@utils/sound.ts";
import { conversationData } from "@signals/conversationStore.ts";
import { markdownService } from "../utils/markdownService.ts";
import { formatMarkdownSafe } from "../utils/sanitize.ts";
import { showToast, showUndoToast } from "../utils/toast.ts";
import { resampleIntoFreshMap } from "@utils/resample.ts";
import ChonkyQrCard from "../components/ChonkyQrCard.tsx";
import {
  deriveSnapshotTitle,
  type ExportSnapshot,
  getAllSnapshots,
  getSnapshotsFor,
  writeSnapshots,
} from "../core/storage/exportSnapshots.ts";

interface MarkdownMakerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: string;
  conversationId: string;
}

const MIN_VISIBLE_MS = 650;

type SavedOutput = ExportSnapshot;

export default function MarkdownMakerDrawer(
  { isOpen, onClose, transcript, conversationId }: MarkdownMakerDrawerProps,
) {
  const selectedPromptId = useSignal<string | null>(null);
  const customPrompt = useSignal("");
  const customOpen = useSignal(false);
  const markdown = useSignal("");
  const previewMode = useSignal<"rendered" | "raw">("rendered");
  const justCopied = useSignal(false);
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const formatHint = useSignal<string | null>(null);
  const deckUrl = useSignal<string | null>(null);
  const savedOutputs = useSignal<SavedOutput[]>([]);
  const activeDraftId = useSignal<string | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const visiblePrompts = useComputed(() => {
    const data = conversationData.value;
    return pickExportFormats({
      actionItemCount: data?.actionItems?.length ?? 0,
      completedActionCount: data?.actionItems?.filter((a) =>
        a.status === "completed"
      ).length ?? 0,
      topicCount: data?.nodes?.length ?? 0,
      transcriptLength: transcript.length,
      speakerCount: data?.transcript?.speakers?.length ?? 0,
    });
  });

  const runningLabel = useComputed(() => {
    const id = selectedPromptId.value;
    if (!id) return "custom export";
    return markdownPrompts.find((p) => p.id === id)?.label ?? "custom export";
  });

  useEffect(() => {
    if (isOpen) return;
    loading.value = false;
    error.value = null;
    formatHint.value = null;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && conversationId) {
      loadSavedOutputs();
    }
  }, [isOpen, conversationId]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 50);
    } else {
      setIsAnimating(false);
      const timeout = setTimeout(() => setShouldRender(false), 450);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => drawerRef.current?.focus(), 80);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  function loadSavedOutputs() {
    savedOutputs.value = getSnapshotsFor(conversationId);
  }

  function saveOutput() {
    if (!markdown.value || !conversationId) return;

    const label = selectedPromptId.value
      ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
        "Custom"
      : "Custom";

    const allOutputs = getAllSnapshots();
    const existingIndex = activeDraftId.value
      ? allOutputs.findIndex((o) => o.id === activeDraftId.value)
      : -1;

    const title = deriveSnapshotTitle(
      markdown.value,
      label,
      conversationData.value?.conversation?.title,
    );

    let newId: string | null = null;
    if (existingIndex >= 0) {
      allOutputs[existingIndex] = {
        ...allOutputs[existingIndex],
        content: markdown.value,
        prompt: label,
        title,
      };
    } else {
      newId = crypto.randomUUID();
      allOutputs.push({
        id: newId,
        conversation_id: conversationId,
        content: markdown.value,
        prompt: label,
        title,
        created_at: new Date().toISOString(),
      });
    }

    if (!writeSnapshots(allOutputs)) {
      showToast(
        "Couldn't save snapshot — browser storage is full. Copy or download instead.",
        "error",
        6000,
      );
      return;
    }
    if (newId) activeDraftId.value = newId;
    loadSavedOutputs();
    showToast(
      existingIndex >= 0 ? "Snapshot updated" : "Snapshot saved",
      "success",
    );
  }

  function loadDraft(
    output: SavedOutput,
    mode: "rendered" | "raw" = "rendered",
  ) {
    markdown.value = output.content;
    activeDraftId.value = output.id;
    previewMode.value = mode;
    showToast(
      mode === "raw"
        ? "Loaded in Markdown editor"
        : "Snapshot loaded into preview",
      "info",
    );
  }

  function deleteOutput(id: string) {
    const allOutputs = getAllSnapshots();
    const removed = allOutputs.find((o) => o.id === id);
    if (!removed) return;

    if (!writeSnapshots(allOutputs.filter((o) => o.id !== id))) {
      showToast("Couldn't delete snapshot — try again", "error");
      return;
    }
    if (activeDraftId.value === id) activeDraftId.value = null;
    loadSavedOutputs();

    showUndoToast("Snapshot removed", () => {
      if (!writeSnapshots([...getAllSnapshots(), removed])) {
        showToast(
          "Couldn't restore snapshot — browser storage is full.",
          "error",
          6000,
        );
        return;
      }
      loadSavedOutputs();
    });
  }

  async function generateFromPreset(promptId: string) {
    const promptOption = markdownPrompts.find((p) => p.id === promptId);
    if (!promptOption || !transcript.trim()) {
      error.value = "No transcript content available yet.";
      showToast("No transcript content available yet", "error");
      return;
    }
    await runExport(() =>
      markdownService.generateMarkdown(
        buildExportPrompt(promptOption),
        transcript,
        conversationData.value ?? undefined,
      ), promptId);
  }

  async function generateFromCustom() {
    if (!customPrompt.value.trim() || !transcript.trim()) {
      error.value = "Describe a format first so we know what to build.";
      showToast("Describe a format first", "warning");
      return;
    }
    await runExport(() =>
      markdownService.generateMarkdown(
        customPrompt.value,
        transcript,
        conversationData.value ?? undefined,
      ), null);
  }

  async function runExport(
    work: () => Promise<string>,
    promptId: string | null,
  ) {
    loading.value = true;
    error.value = null;
    formatHint.value = null;
    deckUrl.value = null;
    selectedPromptId.value = promptId;

    const start = Date.now();
    try {
      const result = await work();

      const elapsed = Date.now() - start;
      if (elapsed < MIN_VISIBLE_MS) {
        await new Promise((r) => setTimeout(r, MIN_VISIBLE_MS - elapsed));
      }

      const mismatch = parseFormatMismatch(result);
      if (mismatch) {
        formatHint.value = mismatch;
        showToast("Suggested a better-fitting format", "info");
        return;
      }
      if (!result.trim()) {
        error.value = "The export came back empty — give it another go.";
        showToast("The export came back empty — try again", "error");
        return;
      }

      if (promptId === DECK_PROMPT_ID) {
        const slides = parseDeckJson(result);
        if (!slides) {
          error.value =
            "The deck didn't come out cleanly — give it another go.";
          showToast(
            "The deck didn't come out cleanly — try again",
            "error",
          );
          return;
        }
        const url = await buildDeckUrl(slides);
        markdown.value = JSON.stringify(slides, null, 2);
        previewMode.value = "raw";
        activeDraftId.value = null;
        deckUrl.value = url;
        showToast("Deck ready — open it below", "success");
      } else {
        markdown.value = result;
        previewMode.value = "rendered";
        activeDraftId.value = null;
        showToast("Export ready", "success");
      }

      soundBloom();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Generation failed";
      showToast(
        err instanceof Error ? err.message : "Failed to generate export",
        "error",
      );
    } finally {
      loading.value = false;
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(markdown.value);
      justCopied.value = true;
      setTimeout(() => {
        justCopied.value = false;
      }, 1600);
      showToast("Copied to clipboard", "success");
    } catch (_err) {
      showToast("Failed to copy", "error");
    }
  }

  async function copySavedOutput(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied to clipboard", "success");
    } catch (_err) {
      showToast("Failed to copy", "error");
    }
  }

  function resampleText(text: string) {
    if (!text.trim()) return;
    onClose();
    void resampleIntoFreshMap(text, {
      start: "Resampling into a fresh map…",
      failed: "Couldn't resample that export — try again.",
    });
  }

  function downloadMarkdown() {
    if (!markdown.value) return;

    try {
      const blob = new Blob([markdown.value], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const promptLabel = selectedPromptId.value
        ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
          "Export"
        : "CustomExport";
      const titleSlug = (conversationData.value?.conversation?.title ?? "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const timestamp = new Date().toISOString().split("T")[0];
      a.download = `${
        titleSlug ? titleSlug + "-" : ""
      }${promptLabel}-${timestamp}.md`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("Downloaded .md file", "success");
    } catch (_err) {
      showToast("Failed to download", "error");
    }
  }

  function downloadPDF() {
    if (!markdown.value) return;

    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        showToast("Allow popups to export PDF", "warning");
        return;
      }

      const promptLabel = selectedPromptId.value
        ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
          "Export"
        : "Custom Export";

      const escapeHtml = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const inline = (s: string) =>
        s
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
          .replace(/`([^`]+)`/g, "<code>$1</code>");
      const renderPrintHtml = (md: string): string => {
        const out: string[] = [];
        let para: string[] = [];
        let code: string[] = [];
        let list: "ul" | "ol" | null = null;
        let inCode = false;
        let table: string[][] = [];
        let sawTableSep = false;
        let quote: string[] = [];
        const closeList = () => {
          if (list) out.push(`</${list}>`);
          list = null;
        };
        const flushPara = () => {
          if (para.length) out.push(`<p>${inline(para.join("<br>"))}</p>`);
          para = [];
        };
        const flushQuote = () => {
          if (quote.length) {
            out.push(`<blockquote>${inline(quote.join("<br>"))}</blockquote>`);
          }
          quote = [];
        };
        const flushTable = () => {
          if (table.length) {
            const width = Math.max(...table.map((r) => r.length));
            const pad = (
              r: string[],
            ) => [...r, ...Array(Math.max(0, width - r.length)).fill("")];
            const cells = (r: string[], tag: string) =>
              pad(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join("");
            const head = sawTableSep && table.length > 1 ? table[0] : null;
            const rows = head ? table.slice(1) : table;
            out.push(
              `<table>` +
                (head ? `<thead><tr>${cells(head, "th")}</tr></thead>` : "") +
                `<tbody>` +
                rows.map((r) => `<tr>${cells(r, "td")}</tr>`).join("") +
                `</tbody></table>`,
            );
          }
          table = [];
          sawTableSep = false;
        };
        for (const line of escapeHtml(md).split("\n")) {
          if (/^\s*\|.*\|\s*$/.test(line) && !inCode) {
            flushPara();
            flushQuote();
            closeList();
            if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) {
              sawTableSep = true;
            } else {
              table.push(
                line.trim().replace(/^\||\|$/g, "").split("|").map((c) =>
                  c.trim()
                ),
              );
            }
            continue;
          }
          flushTable();
          const quoted = line.match(/^\s*&gt;\s?(.*)$/);
          if (quoted && !inCode) {
            flushPara();
            closeList();
            quote.push(quoted[1]);
            continue;
          }
          flushQuote();
          if (line.trim().startsWith("```")) {
            flushPara();
            closeList();
            if (inCode) {
              out.push(`<pre>${code.join("\n")}</pre>`);
              code = [];
            }
            inCode = !inCode;
            continue;
          }
          if (inCode) {
            code.push(line);
            continue;
          }
          const heading = line.match(/^(#{1,4})\s+(.*)$/);
          if (heading) {
            flushPara();
            closeList();
            const level = heading[1].length;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
          }
          const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
          const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
          if (bullet || numbered) {
            flushPara();
            const want = bullet ? "ul" : "ol";
            if (list !== want) {
              closeList();
              out.push(`<${want}>`);
              list = want;
            }
            out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
            continue;
          }
          if (!line.trim()) {
            flushPara();
            closeList();
            continue;
          }
          para.push(line);
        }
        if (inCode && code.length) out.push(`<pre>${code.join("\n")}</pre>`);
        flushPara();
        flushQuote();
        flushTable();
        closeList();
        return out.join("\n");
      };
      const htmlContent = renderPrintHtml(markdown.value);

      const INK = "#1e1714";
      const RULE = "#d8cbbb";
      const docTitle = conversationData.value?.conversation?.title?.trim() ||
        promptLabel;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${escapeHtml(docTitle)}</title>
            <style>
              @media print {
                @page {
                  margin: 18mm;
                  size: A4;
                }
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                line-height: 1.6;
                color: #2a221e;
                max-width: 8.5in;
                margin: 0 auto;
                padding: 1rem;
              }
              h1, h2, h3, h4 {
                color: ${INK};
                margin-top: 1.5em;
              }
              h1 { font-size: 22pt; border-bottom: 1px solid ${RULE}; padding-bottom: 0.35em; }
              h2 { font-size: 18pt; }
              h3 { font-size: 14pt; }
              h4 { font-size: 12pt; }
              p {
                margin: 0.8em 0;
              }
              blockquote {
                margin: 1em 0;
                padding: 0.4em 1em;
                border-left: 3px solid ${RULE};
                color: #57493f;
                font-style: italic;
              }
              table {
                border-collapse: collapse;
                margin: 1em 0;
                width: 100%;
                font-size: 10.5pt;
              }
              th, td {
                border: 1px solid #e2d8cc;
                padding: 0.4em 0.7em;
                text-align: left;
                vertical-align: top;
              }
              th { background: #faf3ea; }
              tr { break-inside: avoid; }
              code, pre {
                background: #f3f4f6;
                padding: 2px 6px;
                border-radius: 3px;
                font-family: 'Courier New', monospace;
              }
              pre {
                padding: 1em;
                overflow-x: auto;
              }
              ul, ol {
                margin: 0.5em 0;
                padding-left: 2em;
              }
              li {
                margin: 0.3em 0;
              }
              .header {
                text-align: center;
                margin-bottom: 2em;
                padding-bottom: 1em;
                border-bottom: 1px solid ${RULE};
              }
              .footer {
                margin-top: 3em;
                padding-top: 1em;
                border-top: 1px solid #e5e7eb;
                font-size: 9pt;
                color: #6b7280;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${escapeHtml(docTitle)}</h1>
              <p style="color: #6b7280; font-size: 11pt;">${
        escapeHtml(promptLabel)
      } · ${new Date().toLocaleDateString()}</p>
            </div>
            <div>${htmlContent}</div>
            <div class="footer">
              Mapped with ProMapper &middot; promapper.app
            </div>
          </body>
        </html>
      `);

      printWindow.document.close();

      setTimeout(() => {
        printWindow.print();
        showToast("Opening print dialog for PDF…", "success");
      }, 250);
    } catch (_err) {
      showToast("Failed to generate PDF", "error");
    }
  }

  if (!shouldRender) return null;

  const renderedPreviewHtml = markdown.value && previewMode.value === "rendered"
    ? formatMarkdownSafe(
      selectedPromptId.value === DECK_PROMPT_ID
        ? `\`\`\`json\n${markdown.value}\n\`\`\``
        : markdown.value,
    )
    : "";

  return (
    <>
      {/* Fading backdrop scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        class={`export-drawer-backdrop ${isAnimating ? "is-visible" : ""}`}
      />

      {/* Export Studio Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export conversation"
        tabIndex={-1}
        class={`markdown-maker-drawer export-drawer ${
          isAnimating ? "is-open" : ""
        }`}
      >
        {/* Header — unified Soft Neo Toybrut card-header grammar */}
        <div class="dashboard-card-header">
          <div class="card-header-title">
            <span class="card-header-icon" aria-hidden="true">
              <i class="fa fa-file-export"></i>
            </span>
            <h3 class="card-header-heading">Export</h3>
            {savedOutputs.value.length > 0 && (
              <span class="card-header-count">
                {savedOutputs.value.length} saved
              </span>
            )}
          </div>
          <div class="card-header-actions">
            <button
              type="button"
              onClick={onClose}
              class="card-icon-btn tooltip-btn"
              data-tip="Close"
              data-tip-align="right"
              aria-label="Close export drawer"
            >
              <i class="fa fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Format Picker Header + Contextual Six */}
          <div>
            <div class="export-studio-lead">
              <span>Choose a format fitted to this map</span>
              <button
                type="button"
                class={`export-custom-pill ${
                  customOpen.value ? "is-open" : ""
                }`}
                aria-expanded={customOpen.value}
                onMouseEnter={soundHover}
                onClick={() => {
                  soundToggle(!customOpen.value);
                  customOpen.value = !customOpen.value;
                }}
              >
                <i class="fa fa-pen" aria-hidden="true"></i>
                <span>Custom…</span>
              </button>
            </div>

            <div class="export-format-grid">
              {visiblePrompts.value.map((promptOption) => (
                <button
                  key={promptOption.id}
                  type="button"
                  class={`export-chip${
                    selectedPromptId.value === promptOption.id
                      ? " is-selected"
                      : ""
                  }`}
                  onMouseEnter={soundHover}
                  onClick={() => {
                    soundTick();
                    generateFromPreset(promptOption.id);
                  }}
                  disabled={loading.value}
                >
                  <span class="export-chip__icon-box" aria-hidden="true">
                    <i class={`fa ${promptOption.icon} export-chip__icon`}></i>
                  </span>
                  <span class="export-chip__label">{promptOption.label}</span>
                  <span
                    class="export-chip__desc"
                    title={promptOption.description}
                  >
                    {promptOption.short}
                  </span>
                </button>
              ))}
            </div>

            {customOpen.value && (
              <div class="export-custom-body">
                <textarea
                  id="custom-prompt-input"
                  class="export-textarea h-24"
                  placeholder="Describe any document — a handoff memo, client update, packing list, project brief…"
                  maxLength={5000}
                  value={customPrompt.value}
                  onInput={(e) =>
                    customPrompt.value =
                      (e.target as HTMLTextAreaElement).value}
                  autoFocus
                />
                <button
                  type="button"
                  class="btn btn--primary w-full"
                  onMouseEnter={soundHover}
                  onClick={() => {
                    soundTick();
                    generateFromCustom();
                  }}
                  disabled={loading.value || !customPrompt.value.trim() ||
                    !transcript.trim()}
                >
                  <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
                  <span>Draft custom export</span>
                </button>
              </div>
            )}
          </div>

          {/* Loading state — uses verified fa-spinner from subset */}
          {loading.value && (
            <div
              class="export-loading-card"
              role="status"
              aria-live="polite"
            >
              <div class="export-loading-spinner" aria-hidden="true">
                <i class="fa fa-spinner fa-spin"></i>
              </div>
              <div class="export-loading-copy">
                <strong>Drafting {runningLabel.value}…</strong>
                <span>Pulling structure, topics, and takeaways together</span>
              </div>
            </div>
          )}

          {/* Error Display — warm rose wash, never alarm-red */}
          {error.value && (
            <div class="export-note export-note--error" role="alert">
              <i class="fa fa-circle-exclamation" aria-hidden="true"></i>
              <span>{error.value}</span>
            </div>
          )}

          {/* Format-mismatch hint */}
          {formatHint.value && (
            <div class="export-note export-note--hint">
              <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>{formatHint.value}</span>
            </div>
          )}

          {/* Fresh deck — one tap opens it in Slideomatic */}
          {deckUrl.value && (
            <div class="space-y-2">
              <a
                href={deckUrl.value}
                target="_blank"
                rel="noopener"
                class="btn btn--primary w-full"
              >
                <i class="fa fa-display" aria-hidden="true"></i>
                <span>Open slide deck</span>
              </a>
              <ChonkyQrCard
                url={deckUrl.value}
                title="Scan to open deck on phone"
                subtitle="Beam presentation directly to another screen"
                badge="Slideomatic"
                compact
              />
            </div>
          )}

          {/* Document Preview & Markdown Editor Studio */}
          {markdown.value && (
            <div class="export-preview">
              <div class="export-preview-bar">
                <div
                  class="export-mode-tabs"
                  role="tablist"
                  aria-label="Export view mode"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewMode.value === "rendered"}
                    class={`export-mode-tab ${
                      previewMode.value === "rendered" ? "is-active" : ""
                    }`}
                    onClick={() => {
                      previewMode.value = "rendered";
                    }}
                  >
                    <i class="fa fa-file-lines" aria-hidden="true"></i>
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewMode.value === "raw"}
                    class={`export-mode-tab ${
                      previewMode.value === "raw" ? "is-active" : ""
                    }`}
                    onClick={() => {
                      previewMode.value = "raw";
                    }}
                  >
                    <i class="fa fa-pen" aria-hidden="true"></i>
                    <span>Markdown</span>
                  </button>
                </div>

                {activeDraftId.value && (
                  <span class="export-draft-pill">Saved draft</span>
                )}
              </div>

              {/* Explicit labeled action bar — zero mystery meat */}
              <div class="export-actions-bar">
                <button
                  type="button"
                  class="export-action-btn export-action-btn--primary"
                  onClick={copyToClipboard}
                >
                  <i
                    class={`fa ${justCopied.value ? "fa-check" : "fa-copy"}`}
                    aria-hidden="true"
                  >
                  </i>
                  <span>{justCopied.value ? "Copied!" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  class="export-action-btn tooltip-btn"
                  data-tip="Download Markdown file"
                  onClick={downloadMarkdown}
                >
                  <i class="fa fa-download" aria-hidden="true"></i>
                  <span>.md</span>
                </button>
                <button
                  type="button"
                  class="export-action-btn tooltip-btn"
                  data-tip="Print or save as PDF"
                  onClick={downloadPDF}
                >
                  <i class="fa fa-file-pdf" aria-hidden="true"></i>
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  class="export-action-btn tooltip-btn"
                  data-tip={activeDraftId.value
                    ? "Update saved snapshot"
                    : "Keep snapshot in this map"}
                  onClick={saveOutput}
                >
                  <i class="fa fa-save" aria-hidden="true"></i>
                  <span>{activeDraftId.value ? "Update" : "Save"}</span>
                </button>
                <button
                  type="button"
                  class="export-action-btn tooltip-btn"
                  data-tip="Turn this export into a fresh map"
                  data-tip-align="right"
                  onClick={() => resampleText(markdown.value)}
                >
                  <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
                  <span>Resample</span>
                </button>
              </div>

              <div class="export-preview-body">
                {previewMode.value === "rendered"
                  ? (
                    <div
                      class="export-rendered-sheet"
                      dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
                    />
                  )
                  : (
                    <textarea
                      value={markdown.value}
                      onInput={(e) =>
                        markdown.value =
                          (e.target as HTMLTextAreaElement).value}
                      spellcheck={false}
                      aria-label="Generated markdown (editable)"
                      class="export-textarea export-preview-editor"
                    />
                  )}
              </div>
            </div>
          )}

          {/* Warm inviting empty state when no export has run yet */}
          {!markdown.value && !loading.value &&
            !error.value &&
            savedOutputs.value.length === 0 && (
            <div class="export-empty-card">
              <div class="export-empty-icon" aria-hidden="true">
                <i class="fa fa-file-lines"></i>
              </div>
              <h4>Turn this map into a finished artifact</h4>
              <p>
                Tap any format above to draft clean notes, summaries, or next
                steps — ready to read, edit, copy, or print as PDF.
              </p>
            </div>
          )}

          {/* Saved snapshots */}
          {savedOutputs.value.length > 0 && (
            <div class="export-snaps pt-3">
              <div class="export-snaps-header">
                <span class="inline-flex items-center gap-1.5">
                  <i class="fa fa-box-archive" aria-hidden="true"></i>
                  <span>Saved snapshots</span>
                </span>
                <span class="card-header-count">
                  {savedOutputs.value.length}
                </span>
              </div>
              <div class="space-y-2">
                {savedOutputs.value.map((output) => {
                  const isActive = activeDraftId.value === output.id;
                  return (
                    <div
                      key={output.id}
                      class={`export-snap ${isActive ? "is-active" : ""}`}
                    >
                      <div class="flex justify-between items-start gap-2 mb-1.5">
                        <div class="flex-1 min-w-0">
                          <p class="export-snap-label truncate">
                            {output.title || output.prompt}
                            {isActive ? " · active" : ""}
                          </p>
                          <p class="export-snap-date">
                            {output.prompt} ·{" "}
                            {new Date(output.created_at).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            class="card-icon-btn tooltip-btn"
                            onClick={() => loadDraft(output, "raw")}
                            data-tip="Edit Markdown"
                            aria-label="Edit snapshot Markdown"
                          >
                            <i class="fa fa-pen" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            class="card-icon-btn tooltip-btn"
                            onClick={() => copySavedOutput(output.content)}
                            data-tip="Copy"
                            aria-label="Copy snapshot"
                          >
                            <i class="fa fa-copy" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            class="card-icon-btn tooltip-btn"
                            onClick={() => resampleText(output.content)}
                            data-tip="Resample into a fresh map"
                            aria-label="Resample snapshot"
                          >
                            <i
                              class="fa fa-wand-magic-sparkles"
                              aria-hidden="true"
                            >
                            </i>
                          </button>
                          <button
                            type="button"
                            class="card-icon-btn card-icon-btn--quiet tooltip-btn"
                            onClick={() => deleteOutput(output.id)}
                            data-tip="Remove snapshot"
                            data-tip-align="right"
                            aria-label="Remove snapshot"
                          >
                            <i class="fa fa-trash-can" aria-hidden="true"></i>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadDraft(output, "rendered")}
                        class="export-snap-body line-clamp-2"
                        aria-label="Open snapshot preview"
                      >
                        {output.content.replace(/^#+\s*/gm, "").substring(
                          0,
                          160,
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
