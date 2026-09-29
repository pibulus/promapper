import { assertEquals } from "$std/assert/mod.ts";
import {
  formatBytes,
  isShrinkableImage,
  shrinkImageFile,
} from "../../utils/drShrink.ts";

Deno.test("Dr. Shrink: formatBytes formatting", () => {
  assertEquals(formatBytes(500), "500 B");
  assertEquals(formatBytes(2048), "2.0 KB");
  assertEquals(formatBytes(15 * 1024 * 1024), "15.00 MB");
});

Deno.test("Dr. Shrink: isShrinkableImage type classification", () => {
  assertEquals(
    isShrinkableImage({ name: "whiteboard.jpg", type: "image/jpeg" }),
    true,
  );
  assertEquals(
    isShrinkableImage({ name: "diagram.png", type: "image/png" }),
    true,
  );
  assertEquals(isShrinkableImage({ name: "photo.heic", type: "" }), true);
  assertEquals(
    isShrinkableImage({ name: "sticker.webp", type: "image/webp" }),
    true,
  );

  // Non-shrinkable or protected formats
  assertEquals(
    isShrinkableImage({ name: "icon.svg", type: "image/svg+xml" }),
    false,
  );
  assertEquals(
    isShrinkableImage({ name: "animation.gif", type: "image/gif" }),
    false,
  );
  assertEquals(
    isShrinkableImage({ name: "notes.pdf", type: "application/pdf" }),
    false,
  );
  assertEquals(
    isShrinkableImage({ name: "readme.md", type: "text/markdown" }),
    false,
  );
});

Deno.test("Dr. Shrink: shrinkImageFile headless/SSR graceful passthrough", async () => {
  // In Deno runtime without DOM document/canvas, it returns the original file safely without throw
  const dummyBlob = new Blob(["dummy payload content"], { type: "image/jpeg" });
  const dummyFile = new File([dummyBlob], "test.jpg", { type: "image/jpeg" });

  const result = await shrinkImageFile(dummyFile);
  assertEquals(result.file.name, "test.jpg");
  assertEquals(result.didShrink, false);
  assertEquals(result.originalSize, dummyFile.size);
});
