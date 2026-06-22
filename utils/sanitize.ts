/**
 * HTML Sanitization Utilities
 *
 * Safe alternatives to dangerouslySetInnerHTML
 * Prevents XSS attacks from untrusted content
 */

import { Marked } from "marked";

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
 * Sanitize and format transcript with speaker highlighting
 * Returns safe HTML string with only allowed tags
 */
export function formatTranscriptSafe(text: string): string {
  if (!text) return "";

  // Escape all HTML first
  const escaped = escapeHtml(text);

  // Convert newlines to <br/>
  let formatted = escaped.replace(/\n/g, "<br/>");

  // Highlight speaker names (safe because content is already escaped)
  formatted = formatted.replace(
    /(Speaker\s*\d+|[A-Z][a-z]+):/g,
    '<span style="font-weight: 600; color: var(--color-accent); margin-right: 0.5rem;">$1:</span>',
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

  return `<div class="markdown-body" style="line-height: 1.7;">${html}</div>`;
}
