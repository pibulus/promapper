/**
 * Magpie classification: URLs become links, image URLs become pictures,
 * everything else is a text scrap. Pointers, not payloads.
 */

import { assertEquals } from "./_assert.ts";
import { classifyMagpie, magpieLabel } from "../../utils/magpie.ts";

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
