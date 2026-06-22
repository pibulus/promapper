/**
 * Tests for utils/sanitize.ts — markdown rendering + XSS safety.
 *
 * formatMarkdownSafe renders AI/user markdown to HTML for
 * dangerouslySetInnerHTML, so its XSS guarantees are load-bearing. These tests
 * pin the two guards: raw-HTML escaping and link/image URL scheme-checking.
 */

import { assertEquals, assertStringIncludes } from "./_assert.ts";
import { formatMarkdownSafe } from "../../utils/sanitize.ts";

// A live (executable) vector survives only if an unescaped dangerous token
// reaches the output. Escaped text like "&lt;script&gt;" is inert, so we look
// for the live forms specifically.
function hasLiveVector(html: string): boolean {
  return (
    /<script/i.test(html) ||
    /<img\b/i.test(html) && /onerror/i.test(html) ||
    /href="\s*javascript:/i.test(html) ||
    /href="\s*data:text\/html/i.test(html) ||
    /src="\s*javascript:/i.test(html)
  );
}

// ===================================================================
// MARKDOWN FEATURES
// ===================================================================

Deno.test("formatMarkdownSafe returns empty string for empty input", () => {
  assertEquals(formatMarkdownSafe(""), "");
});

Deno.test("formatMarkdownSafe renders headers, bold, italic", () => {
  const out = formatMarkdownSafe("# Title\n\n**bold** and *italic*");
  assertStringIncludes(out, "<h1>Title</h1>");
  assertStringIncludes(out, "<strong>bold</strong>");
  assertStringIncludes(out, "<em>italic</em>");
});

Deno.test("formatMarkdownSafe renders lists", () => {
  const out = formatMarkdownSafe("- moss\n- lichen\n- spores");
  assertStringIncludes(out, "<ul>");
  assertStringIncludes(out, "<li>moss</li>");
});

Deno.test("formatMarkdownSafe renders code blocks (new capability)", () => {
  const out = formatMarkdownSafe("```\nconst x = 1;\n```");
  assertStringIncludes(out, "<pre>");
  assertStringIncludes(out, "<code");
  assertStringIncludes(out, "const x = 1;");
});

Deno.test("formatMarkdownSafe renders GFM tables (new capability)", () => {
  const out = formatMarkdownSafe("| A | B |\n|---|---|\n| 1 | 2 |");
  assertStringIncludes(out, "<table>");
  assertStringIncludes(out, "<th>A</th>");
  assertStringIncludes(out, "<td>1</td>");
});

Deno.test("formatMarkdownSafe wraps output in a .markdown-body container", () => {
  const out = formatMarkdownSafe("plain");
  assertStringIncludes(out, 'class="markdown-body"');
});

// ===================================================================
// SAFE LINKS (allowed schemes render)
// ===================================================================

Deno.test("formatMarkdownSafe renders https links with noopener", () => {
  const out = formatMarkdownSafe("[home](https://example.com)");
  assertStringIncludes(out, '<a href="https://example.com"');
  assertStringIncludes(out, 'rel="noopener noreferrer nofollow"');
});

Deno.test("formatMarkdownSafe allows anchor, mailto, and tel links", () => {
  assertStringIncludes(
    formatMarkdownSafe("[s](#section)"),
    'href="#section"',
  );
  assertStringIncludes(
    formatMarkdownSafe("[m](mailto:owl@forest.net)"),
    'href="mailto:owl@forest.net"',
  );
  assertStringIncludes(
    formatMarkdownSafe("[t](tel:+61400000000)"),
    'href="tel:+61400000000"',
  );
});

Deno.test("formatMarkdownSafe renders https images", () => {
  const out = formatMarkdownSafe("![cat](https://example.com/cat.png)");
  assertStringIncludes(out, '<img src="https://example.com/cat.png"');
  assertStringIncludes(out, 'alt="cat"');
});

// ===================================================================
// XSS GUARDS (dangerous content neutralized)
// ===================================================================

Deno.test("formatMarkdownSafe escapes raw <script> tags", () => {
  const out = formatMarkdownSafe("hi <script>alert(1)</script> bye");
  assertEquals(hasLiveVector(out), false);
  assertStringIncludes(out, "&lt;script&gt;");
});

Deno.test("formatMarkdownSafe escapes raw <img onerror>", () => {
  const out = formatMarkdownSafe("<img src=x onerror=alert(1)>");
  assertEquals(hasLiveVector(out), false);
});

Deno.test("formatMarkdownSafe drops javascript: link, keeps text", () => {
  const out = formatMarkdownSafe("[click](javascript:alert(1))");
  assertEquals(hasLiveVector(out), false);
  assertStringIncludes(out, "click"); // visible text preserved
});

Deno.test("formatMarkdownSafe drops javascript: link with control-char obfuscation", () => {
  const out = formatMarkdownSafe("[x](java\tscript:alert(1))");
  assertEquals(hasLiveVector(out), false);
});

Deno.test("formatMarkdownSafe drops data:text/html link", () => {
  const out = formatMarkdownSafe(
    "[x](data:text/html,<script>alert(1)</script>)",
  );
  assertEquals(hasLiveVector(out), false);
});

Deno.test("formatMarkdownSafe drops javascript: image, keeps alt text", () => {
  const out = formatMarkdownSafe("![logo](javascript:alert(1))");
  assertEquals(hasLiveVector(out), false);
  assertStringIncludes(out, "logo");
});
