/**
 * MarkdownMaker Drawer Island
 *
 * Right-hand slide-in drawer for converting conversations to different formats
 * Ported from Svelte project_mapper version with full functionality
 */

import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  buildExportPrompt,
  FORMAT_MISMATCH_PREFIX,
  markdownPrompts,
  suggestFormatIds,
} from "../utils/markdownPrompts.ts";
import { markdownService } from "../utils/markdownService.ts";
import { showToast, showUndoToast } from "../utils/toast.ts";
import { conversationData } from "@signals/conversationStore.ts";

interface MarkdownMakerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: string;
  conversationId: string;
}

interface SavedOutput {
  id: string;
  conversation_id: string;
  content: string;
  prompt: string;
  created_at: string;
}

export default function MarkdownMakerDrawer(
  { isOpen, onClose, transcript, conversationId }: MarkdownMakerDrawerProps,
) {
  // Per-instance state — useSignal, NOT module-level signal(): module scope
  // is shared across concurrent SSR requests, so one visitor's generated
  // markdown could flash into another visitor's first paint.
  const selectedPromptId = useSignal<string | null>(null);
  const customPrompt = useSignal("");
  const markdown = useSignal("");
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  // The model said "this content suits a different format" — shown as a
  // friendly hint, never as a fake successful export.
  const formatHint = useSignal<string | null>(null);
  const savedOutputs = useSignal<SavedOutput[]>([]);
  // When a saved snapshot is loaded back for editing, saving updates it in
  // place instead of appending a new one.
  const activeDraftId = useSignal<string | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Which formats fit THIS conversation — shape-based heuristics, no extra AI
  // call. Suggested formats get their own "For this map" section with visible
  // descriptions; the rest sit in a compact grid below.
  const suggestedIds = useComputed(() => {
    const data = conversationData.value;
    return suggestFormatIds({
      actionItemCount: data?.actionItems?.length ?? 0,
      topicCount: data?.nodes?.length ?? 0,
      transcriptLength: transcript.length,
      speakerCount: data?.transcript?.speakers?.length ?? 0,
    });
  });
  const suggestedPrompts = useComputed(() =>
    suggestedIds.value
      .map((id) => markdownPrompts.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
  );
  const otherPrompts = useComputed(() =>
    markdownPrompts.filter((p) => !suggestedIds.value.includes(p.id))
  );

  // Load saved outputs from localStorage
  useEffect(() => {
    if (isOpen && conversationId) {
      loadSavedOutputs();
    }
  }, [isOpen, conversationId]);

  // Handle smooth animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready
      setTimeout(() => setIsAnimating(true), 50);
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before unmounting
      const timeout = setTimeout(() => setShouldRender(false), 450);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Dialog manners: move focus in on open, give it back on close, and lock
  // body scroll while the backdrop is up. (Click-to-close is the backdrop's
  // job — the old document-level listener could fight the header toggle.)
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

  // Handle ESC key to close
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

  // Load saved outputs from localStorage
  function loadSavedOutputs() {
    try {
      const stored = localStorage.getItem("markdown_outputs");
      if (stored) {
        const allOutputs: SavedOutput[] = JSON.parse(stored);
        savedOutputs.value = allOutputs.filter((o) =>
          o.conversation_id === conversationId
        );
      }
    } catch (err) {
      console.error("Error loading saved outputs:", err);
    }
  }

  // Save output to localStorage — updates the loaded snapshot in place when one
  // is active, otherwise appends a new one.
  function saveOutput() {
    if (!markdown.value || !conversationId) return;

    try {
      const label = selectedPromptId.value
        ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
          "Custom"
        : "Custom";

      const stored = localStorage.getItem("markdown_outputs");
      const allOutputs: SavedOutput[] = stored ? JSON.parse(stored) : [];

      const existingIndex = activeDraftId.value
        ? allOutputs.findIndex((o) => o.id === activeDraftId.value)
        : -1;

      if (existingIndex >= 0) {
        // Update in place — keep id + created_at, refresh content + prompt.
        allOutputs[existingIndex] = {
          ...allOutputs[existingIndex],
          content: markdown.value,
          prompt: label,
        };
      } else {
        const newOutput: SavedOutput = {
          id: crypto.randomUUID(),
          conversation_id: conversationId,
          content: markdown.value,
          prompt: label,
          created_at: new Date().toISOString(),
        };
        allOutputs.push(newOutput);
        activeDraftId.value = newOutput.id; // subsequent saves edit this one
      }

      localStorage.setItem("markdown_outputs", JSON.stringify(allOutputs));
      savedOutputs.value = allOutputs.filter((o) =>
        o.conversation_id === conversationId
      );
      showToast(
        existingIndex >= 0 ? "Snapshot updated!" : "Output saved!",
        "success",
      );
    } catch (err) {
      console.error("Error saving output:", err);
      showToast("Failed to save output", "error");
    }
  }

  // Load a saved snapshot back into the editor for tweaking.
  function loadDraft(output: SavedOutput) {
    markdown.value = output.content;
    activeDraftId.value = output.id;
    showToast("Loaded — edit and Save to update", "info");
  }

  // Delete saved output — undo toast is the safety net, no confirm friction.
  function deleteOutput(id: string) {
    try {
      const stored = localStorage.getItem("markdown_outputs");
      if (!stored) return;
      const allOutputs: SavedOutput[] = JSON.parse(stored);
      const removed = allOutputs.find((o) => o.id === id);
      const filtered = allOutputs.filter((o) => o.id !== id);
      localStorage.setItem("markdown_outputs", JSON.stringify(filtered));
      savedOutputs.value = filtered.filter((o) =>
        o.conversation_id === conversationId
      );
      // Deleting the snapshot being edited: future saves become a new one.
      if (activeDraftId.value === id) activeDraftId.value = null;
      if (!removed) return;
      showUndoToast("Snapshot deleted", () => {
        try {
          const current: SavedOutput[] = JSON.parse(
            localStorage.getItem("markdown_outputs") ?? "[]",
          );
          current.push(removed);
          localStorage.setItem("markdown_outputs", JSON.stringify(current));
          savedOutputs.value = current.filter((o) =>
            o.conversation_id === conversationId
          );
        } catch (err) {
          console.error("Undo restore failed:", err);
        }
      });
    } catch (err) {
      console.error("Error deleting output:", err);
      showToast("Failed to delete output", "error");
    }
  }

  // Generate markdown from preset prompt
  async function generateFromPreset(promptId: string) {
    const promptOption = markdownPrompts.find((p) => p.id === promptId);
    if (!promptOption || !transcript.trim()) {
      error.value = "No transcript content available";
      showToast("No transcript content available", "error");
      return;
    }

    loading.value = true;
    error.value = null;
    formatHint.value = null;
    selectedPromptId.value = promptId;

    try {
      const result = await markdownService.generateMarkdown(
        buildExportPrompt(promptOption),
        transcript,
        conversationData.value ?? undefined,
      );
      // The model can decline a bad fit — surface that as a hint, not a
      // "success" that pretends the refusal is your export.
      if (result.trim().startsWith(FORMAT_MISMATCH_PREFIX)) {
        formatHint.value = result.trim()
          .slice(FORMAT_MISMATCH_PREFIX.length).trim();
        showToast("That format doesn't quite fit this one", "info");
        return;
      }
      markdown.value = result;
      activeDraftId.value = null; // fresh generation = a new snapshot
      showToast("Markdown generated!", "success");
    } catch (err) {
      // Keep the previous output — a failed retry shouldn't eat good work.
      error.value = err instanceof Error ? err.message : "Generation failed";
      showToast(
        err instanceof Error ? err.message : "Failed to generate markdown",
        "error",
      );
    } finally {
      loading.value = false;
    }
  }

  // Generate markdown from custom prompt
  async function generateFromCustom() {
    if (!customPrompt.value.trim() || !transcript.trim()) {
      error.value = "Please provide both a prompt and transcript";
      showToast("Please provide both a prompt and transcript", "warning");
      return;
    }

    loading.value = true;
    error.value = null;
    formatHint.value = null;
    selectedPromptId.value = null;

    try {
      const result = await markdownService.generateMarkdown(
        customPrompt.value,
        transcript,
        conversationData.value ?? undefined,
      );
      markdown.value = result;
      activeDraftId.value = null; // fresh generation = a new snapshot
      showToast("Markdown generated!", "success");
    } catch (err) {
      // Keep the previous output — a failed retry shouldn't eat good work.
      error.value = err instanceof Error ? err.message : "Generation failed";
      showToast(
        err instanceof Error ? err.message : "Failed to generate markdown",
        "error",
      );
    } finally {
      loading.value = false;
    }
  }

  // Copy to clipboard
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(markdown.value);
      showToast("Copied to clipboard!", "success");
    } catch (_err) {
      showToast("Failed to copy", "error");
    }
  }

  // Copy saved output
  async function copySavedOutput(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied to clipboard!", "success");
    } catch (_err) {
      showToast("Failed to copy", "error");
    }
  }

  // Download as markdown file
  function downloadMarkdown() {
    if (!markdown.value) return;

    try {
      const blob = new Blob([markdown.value], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Filename: conversation-title slug + format + date
      const promptLabel = selectedPromptId.value
        ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
          "Export"
        : "CustomExport";
      const titleSlug = (conversationData.value?.conversation?.title ?? "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      a.download = `${
        titleSlug ? titleSlug + "-" : ""
      }${promptLabel}-${timestamp}.md`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("Downloaded as markdown!", "success");
    } catch (_err) {
      showToast("Failed to download", "error");
    }
  }

  // Download as PDF using browser print
  function downloadPDF() {
    if (!markdown.value) return;

    try {
      // Create a hidden print window with styled content
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        showToast("Please allow popups to download PDF", "warning");
        return;
      }

      const promptLabel = selectedPromptId.value
        ? markdownPrompts.find((p) => p.id === selectedPromptId.value)?.label ||
          "Export"
        : "Custom Export";

      // Escape HTML before injecting into the print popup. The markdown is AI-
      // generated, so a crafted conversation/prompt could otherwise smuggle a
      // <script> that executes in the popup's origin. (The main preview is safe —
      // it renders inside a <textarea>; only this print path interpolates HTML.)
      const escapeHtml = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      // Mini markdown → print HTML (escaped FIRST, then structure). Handles
      // headings, lists, code fences, and bold/italic/inline code, so a real
      // export prints as a document instead of literal `#` and `**`.
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
        const closeList = () => {
          if (list) out.push(`</${list}>`);
          list = null;
        };
        const flushPara = () => {
          if (para.length) out.push(`<p>${inline(para.join("<br>"))}</p>`);
          para = [];
        };
        for (const line of escapeHtml(md).split("\n")) {
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
        closeList();
        return out.join("\n");
      };
      const htmlContent = renderPrintHtml(markdown.value);

      // Print in the active theme's accent instead of a hardcoded purple.
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-strong").trim() || "#1e1714";
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
                  margin: 0.75in;
                  size: letter;
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
                color: ${accent};
                margin-top: 1.5em;
              }
              h1 { font-size: 24pt; border-bottom: 2px solid ${accent}; padding-bottom: 0.3em; }
              h2 { font-size: 18pt; }
              h3 { font-size: 14pt; }
              h4 { font-size: 12pt; }
              p {
                margin: 0.8em 0;
                text-align: justify;
              }
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
                border-bottom: 3px solid ${accent};
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
              Generated by ProMapper
            </div>
          </body>
        </html>
      `);

      printWindow.document.close();

      // Wait for content to load then trigger print
      setTimeout(() => {
        printWindow.print();
        // Don't close immediately - let user save PDF first
        showToast("Opening print dialog for PDF...", "success");
      }, 250);
    } catch (_err) {
      showToast("Failed to generate PDF", "error");
    }
  }

  if (!shouldRender) return null;

  return (
    <>
      {/* Fading backdrop scrim — clearer modality + click-to-close */}
      <div
        onClick={onClose}
        aria-hidden="true"
        class={`export-drawer-backdrop ${isAnimating ? "is-visible" : ""}`}
      />

      {/* Drawer with smooth bouncy slide (our spring — keep it) */}
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
        {/* Header */}
        <div class="dashboard-card-header">
          <h3>Export</h3>
          <button
            onClick={onClose}
            class="export-drawer-close-btn"
            title="Close"
            aria-label="Close export"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-y-auto p-4">
          {
            /* For this map — the formats that fit this conversation's shape,
              descriptions in the open (they were buried in tooltips) */
          }
          <p class="card-back-label export-section-label">
            <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
            For this map
          </p>
          <div class="export-suggested">
            {suggestedPrompts.value.map((promptOption) => (
              <button
                key={promptOption.id}
                type="button"
                class={`export-suggested-btn${
                  selectedPromptId.value === promptOption.id
                    ? " is-selected"
                    : ""
                }`}
                onClick={() => generateFromPreset(promptOption.id)}
                disabled={loading.value}
              >
                <i class={`fa ${promptOption.icon}`} aria-hidden="true"></i>
                <span class="export-suggested-name">{promptOption.label}</span>
                <span class="export-suggested-desc">
                  {promptOption.description}
                </span>
              </button>
            ))}
          </div>

          {/* Everything else, compact */}
          <p class="card-back-label export-section-label">All formats</p>
          <div class="mb-1 export-format-grid">
            {otherPrompts.value.map((promptOption) => (
              <button
                key={promptOption.id}
                type="button"
                class={`btn ${
                  selectedPromptId.value === promptOption.id
                    ? "btn--accent"
                    : "btn--secondary"
                }`}
                title={promptOption.description}
                onClick={() => generateFromPreset(promptOption.id)}
                disabled={loading.value}
              >
                <i class={`fa ${promptOption.icon}`} aria-hidden="true"></i>
                <span>{promptOption.label}</span>
              </button>
            ))}
          </div>

          {/* Custom Prompt Input */}
          <div class="mb-4">
            <label
              class="card-back-label export-section-label"
              htmlFor="custom-prompt-input"
            >
              Custom prompt
            </label>
            <textarea
              id="custom-prompt-input"
              class="export-textarea h-24"
              placeholder="Ask for any format you can describe…"
              maxLength={5000}
              value={customPrompt.value}
              onInput={(e) =>
                customPrompt.value = (e.target as HTMLTextAreaElement).value}
            />
          </div>

          {/* Generate Custom Button */}
          <button
            type="button"
            class="btn btn--accent w-full mb-4"
            onClick={generateFromCustom}
            disabled={loading.value || !customPrompt.value.trim() ||
              !transcript.trim()}
          >
            Generate Custom
          </button>

          {
            /* One clear loading state — names the format being generated, so you
              always know which run (preset or custom) is in flight. */
          }
          {loading.value && (
            <div
              class="flex items-center justify-center gap-2 mb-4 py-2 text-sm font-bold"
              style={{ color: "var(--color-accent)" }}
            >
              <i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
              <span>
                Generating {selectedPromptId.value
                  ? `“${
                    markdownPrompts.find((p) => p.id === selectedPromptId.value)
                      ?.label || "export"
                  }”`
                  : "your custom export"}…
              </span>
            </div>
          )}

          {/* Error Display — warm rose wash, never alarm-red */}
          {error.value && (
            <div class="export-note export-note--error mb-4" role="alert">
              <i class="fa fa-circle-exclamation" aria-hidden="true"></i>
              <span>{error.value}</span>
            </div>
          )}

          {
            /* Format-mismatch hint — the model suggesting a better-fitting
              format, presented as advice instead of a fake export */
          }
          {formatHint.value && (
            <div class="export-note export-note--hint mb-4">
              <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>{formatHint.value}</span>
            </div>
          )}

          {/* Markdown Preview */}
          {markdown.value && (
            <div class="export-preview mb-4">
              <div class="export-preview-bar">
                <span>Preview</span>
                <div class="flex gap-1">
                  <button
                    type="button"
                    class="btn btn--ghost btn--compact btn--icon"
                    onClick={copyToClipboard}
                    title="Copy to clipboard"
                    aria-label="Copy to clipboard"
                  >
                    <i class="fa fa-copy" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--compact btn--icon"
                    onClick={downloadMarkdown}
                    title="Download as .md file"
                    aria-label="Download as Markdown file"
                  >
                    <i class="fa fa-download" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--compact btn--icon"
                    onClick={downloadPDF}
                    title="Download as PDF"
                    aria-label="Download as PDF"
                  >
                    <i class="fa fa-file-pdf" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--compact btn--icon"
                    onClick={saveOutput}
                    title="Save snapshot"
                    aria-label="Save snapshot"
                  >
                    <i class="fa fa-save" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div class="export-preview-body">
                {/* Editable — tweak the AI output before copying / saving. */}
                <textarea
                  value={markdown.value}
                  onInput={(e) =>
                    markdown.value = (e.target as HTMLTextAreaElement).value}
                  spellcheck={false}
                  aria-label="Generated markdown (editable)"
                  class="export-textarea export-preview-editor"
                />
              </div>
            </div>
          )}

          {/* Saved snapshots */}
          {savedOutputs.value.length > 0 && (
            <div class="export-snaps pt-4 mt-4">
              <h4 class="card-back-label export-section-label">
                <i class="fa fa-box-archive" aria-hidden="true"></i>
                Saved snapshots
              </h4>
              <div class="space-y-2">
                {savedOutputs.value.map((output) => {
                  const isActive = activeDraftId.value === output.id;
                  return (
                    <div
                      key={output.id}
                      class={`export-snap ${isActive ? "is-active" : ""}`}
                    >
                      <div class="flex justify-between items-start mb-2">
                        <div class="flex-1 min-w-0">
                          <p class="export-snap-label">
                            {output.prompt}
                            {isActive ? " · editing" : ""}
                          </p>
                          <p class="export-snap-date">
                            {new Date(output.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div class="flex gap-1 ml-2">
                          <button
                            type="button"
                            class="btn btn--ghost btn--compact btn--icon"
                            onClick={() => loadDraft(output)}
                            title="Load to edit"
                            aria-label="Load snapshot to edit"
                          >
                            <i class="fa fa-pen" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--compact btn--icon"
                            onClick={() => copySavedOutput(output.content)}
                            title="Copy"
                            aria-label="Copy snapshot"
                          >
                            <i class="fa fa-copy" aria-hidden="true"></i>
                          </button>
                          {/* Recessive delete — the undo toast is the safety */}
                          <button
                            type="button"
                            class="btn btn--ghost btn--compact btn--icon"
                            onClick={() => deleteOutput(output.id)}
                            title="Delete (undoable)"
                            aria-label="Delete snapshot"
                          >
                            <i class="fa fa-trash" aria-hidden="true"></i>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadDraft(output)}
                        class="export-snap-body line-clamp-3"
                        title="Load to edit"
                      >
                        {output.content.substring(0, 150)}...
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
