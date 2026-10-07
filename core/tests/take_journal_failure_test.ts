import { assertEquals } from "./_assert.ts";
import { startJournal } from "../storage/takeJournal.ts";

Deno.test("take journal reports absent durable storage after the first chunk", async () => {
  const recorder = new EventTarget() as MediaRecorder;
  Object.defineProperty(recorder, "mimeType", { value: "audio/webm" });
  let failures = 0;
  const journal = startJournal(recorder, undefined, () => failures++);
  const chunk = new Event("dataavailable") as BlobEvent;
  Object.defineProperty(chunk, "data", {
    value: new Blob([new Uint8Array(2048)], { type: "audio/webm" }),
  });
  recorder.dispatchEvent(chunk);
  recorder.dispatchEvent(chunk);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(failures, 1);
  journal.discard();
  recorder.dispatchEvent(new Event("stop"));
});
