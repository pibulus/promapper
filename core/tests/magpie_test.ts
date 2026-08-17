/**
 * Magpie classification: URLs become links, image URLs become pictures,
 * everything else is a text scrap. Pointers, not payloads.
 */

import { assertEquals } from "./_assert.ts";
import {
  classifyMagpie,
  magpieFileIcon,
  magpieFileSize,
  magpieLabel,
} from "../../utils/magpie.ts";

Deno.test("classify: plain words are text scraps", () => {
  assertEquals(classifyMagpie("remember the frog choir tuning"), "text");
  assertEquals(
    classifyMagpie("swampradio.fm sounds like a url but isn't"),
    "text",
  );
});

Deno.test("classify: http(s) URLs are links", () => {
  assertEquals(classifyMagpie("https://swampradio.fm/schedule"), "link");
  assertEquals(classifyMagpie("http://example.org/a?b=c"), "link");
});

Deno.test("classify: image extensions and image hosts are pictures", () => {
  assertEquals(classifyMagpie("https://x.org/moon-shed.jpg"), "image");
  assertEquals(classifyMagpie("https://x.org/pig.webp?w=400"), "image");
  assertEquals(
    classifyMagpie("https://images.unsplash.com/photo-123?auto=format"),
    "image",
  );
  assertEquals(classifyMagpie("https://x.org/page.html"), "link");
});

Deno.test("label: hostname for URLs (www stripped), words for text", () => {
  assertEquals(
    magpieLabel("https://www.swampradio.fm/schedule", "link"),
    "swampradio.fm",
  );
  assertEquals(
    magpieLabel("keep the seed jars cold", "text"),
    "keep the seed jars cold",
  );
});

Deno.test("classify never invents a file kind — files come from drops", () => {
  // "file" is set by the drop/paste path, never inferred from typed text.
  assertEquals(classifyMagpie("budget.pdf"), "text");
  assertEquals(classifyMagpie("https://x.org/budget.pdf"), "link");
});

Deno.test("file size reads in human units", () => {
  assertEquals(magpieFileSize(0), "0 B");
  assertEquals(magpieFileSize(820), "820 B");
  assertEquals(magpieFileSize(2048), "2 KB");
  assertEquals(magpieFileSize(1024 * 1024 * 2.4), "2.4 MB");
  assertEquals(magpieFileSize(-1), "");
});

Deno.test("file icon follows the mime family, with a paperclip fallback", () => {
  assertEquals(magpieFileIcon("image/png"), "fa-image");
  assertEquals(magpieFileIcon("audio/webm"), "fa-music");
  assertEquals(magpieFileIcon("application/pdf"), "fa-file-pdf");
  assertEquals(magpieFileIcon("text/plain"), "fa-file-lines");
  assertEquals(magpieFileIcon("application/x-thing"), "fa-paperclip");
  assertEquals(magpieFileIcon(), "fa-paperclip");
});

Deno.test("a file's label is its own name, not a hostname parse", () => {
  assertEquals(
    magpieLabel("the-council-letter.pdf", "file"),
    "the-council-letter.pdf",
  );
});
