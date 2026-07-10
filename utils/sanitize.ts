/**
 * HTML Sanitization Utilities
 *
 * Safe alternatives to dangerouslySetInnerHTML
 * Prevents XSS attacks from untrusted content
 */

import { Marked } from "marked";
import { speakerColor } from "@core/theme/speakerColors.ts";

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Sanitize and format transcript with speaker highlighting.
 * Returns safe HTML string with only allowed tags.
 *
 * When the conversation's speaker list is provided, each KNOWN speaker's name
 * is tinted with their stable palette color (the same color that identifies
 * them in Voices bars and action-item dots). The injected color is always one
 * of our own palette constants, and the text is escaped before any HTML is
 * added — both XSS-safe by construction.
 */
export function formatTranscriptSafe(
  text: string,
  speakers: readonly string[] = [],
): string {
  if (!text) return "";

  // Escape all HTML first
  const escaped = escapeHtml(text);

  // Convert newlines to <br/>
  let formatted = escaped.replace(/\n/g, "<br/>");

  // Known speakers first — exact (escaped) names, each in their own color.
  for (const speaker of speakers) {
    const name = speaker.trim();
    if (!name) continue;
    const escapedName = escapeHtml(name);
    const pattern = new RegExp(
      `(^|<br/>)(${escapedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}):`,
      "g",
    );
    const color = speakerColor(name, speakers);
    // data-speaker makes the name tappable (rename-in-place); the value is
    // already HTML-escaped above, safe inside a quoted attribute.
    formatted = formatted.replace(
      pattern,
      `$1<span class="transcript-speaker" data-speaker="$2" style="font-weight: 600; color: ${color}; margin-right: 0.5rem;">$2:</span>`,
    );
  }

  // Fallback highlight for name-ish prefixes not in the speakers list.
  // (Names already wrapped above no longer sit directly after ^ or <br/>,
  // so they can't double-match here.)
  formatted = formatted.replace(
    /(^|<br\/>)(Speaker\s*\d+|[A-Z][a-z]+):/g,
    '$1<span style="font-weight: 600; color: var(--accent-ink); margin-right: 0.5rem;">$2:</span>',
  );

  return formatted;
}

// Only these URL schemes are allowed in rendered links/images. Anything else
// (javascript:, data:, vbscript:, ...) is a known XSS vector and gets dropped.
const SAFE_URL_SCHEME = /^(https?:|mailto:|tel:|#|\/|\.)/i;

function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  // Strip control chars + whitespace that can hide a `java\tscript:` scheme
  // before the scheme check. Test the cleaned copy, return the trimmed original.
  // deno-lint-ignore no-control-regex
  const cleaned = trimmed.replace(/[\u0000-\u0020]/g, "");
  return SAFE_URL_SCHEME.test(cleaned) ? trimmed : null;
}

// A dedicated Marked instance for rendering AI-generated summaries and exports.
// GFM gives us tables, strikethrough, and autolinks; `breaks` keeps single
// newlines as line breaks (conversational summaries lean on them).
//
// Two XSS guards, no DOM sanitizer (and no jsdom weight) — runs identically in
// SSR and on the client:
//   1. Raw HTML in the source is escaped (the `html` token override), so a
//      literal <script>/<img onerror> comes out inert text.
//   2. Link/image URLs are scheme-checked (`safeHref`), so a markdown link like
//      [x](javascript:alert(1)) — which marked would otherwise render as a live
//      href — is stripped to plain text / a dead link.
// The markdown the AI *intends* (headers, lists, bold, code, tables, safe
// links) still renders, because that arrives as structured tokens.
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token: { text: string }): string {
      return escapeHtml(token.text);
    },
    link({ href, title, tokens }): string {
      const safe = safeHref(href);
      const text = this.parser.parseInline(tokens);
      if (!safe) return text; // drop the link, keep the visible text
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${
        escapeHtml(safe)
      }"${titleAttr} rel="noopener noreferrer nofollow" target="_blank">${text}</a>`;
    },
    image({ href, title, text }): string {
      const safe = safeHref(href);
      if (!safe) return escapeHtml(text); // drop the image, keep alt text
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(safe)}" alt="${
        escapeHtml(text)
      }"${titleAttr} />`;
    },
  },
});

/**
 * Render markdown-style text (AI summaries, exports) to safe HTML.
 *
 * Uses Marked for real markdown parsing — headers, bold/italic, ordered and
 * unordered lists, code blocks, blockquotes, links, and GFM tables — while
 * escaping any raw HTML embedded in the source so the output stays XSS-safe.
 * Output is a string for dangerouslySetInnerHTML.
 */
export function formatMarkdownSafe(text: string): string {
  if (!text) return "";

  const html = markedInstance.parse(text, { async: false }) as string;

  // No inline line-height: it out-ranked every stylesheet rule and froze
  // markdown leading at 1.7 app-wide. .markdown-body CSS owns it now, so
  // contexts (summary card vs Bishop) can size their own prose.
  return `<div class="markdown-body">${html}</div>`;
}
