import { assertEquals } from "$std/assert/mod.ts";
import {
  generateChonkyQrDataUrl,
  generateChonkyQrSvg,
} from "../../utils/chonkyQr.ts";

Deno.test("generateChonkyQrSvg creates valid SVG with toybrut styling", async () => {
  const svg = await generateChonkyQrSvg("https://promapper.app/live/test-room");
  assertEquals(svg.includes("<svg"), true);
  assertEquals(svg.includes("</svg>"), true);
  assertEquals(svg.includes("#1e1714"), true);
  assertEquals(svg.includes("#fffef7"), true);
});

Deno.test("generateChonkyQrDataUrl creates data URL", async () => {
  const dataUrl = await generateChonkyQrDataUrl("https://promapper.app");
  assertEquals(dataUrl.startsWith("data:image/svg+xml;utf8,"), true);
  assertEquals(dataUrl.includes("%3Csvg"), true);
});
