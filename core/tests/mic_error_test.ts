// describeMicError: the in-app-browser table and the no-mediaDevices case.

import { assertEquals } from "./_assert.ts";
import {
  blockedMicMessage,
  describeMicError,
} from "../../islands/useRecorder.ts";

const denied = new DOMException("nope", "NotAllowedError");
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// Instagram's UA carries Facebook's FBAV token too — order matters.
const instagram =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_US; FBAV/1)";

Deno.test("an in-app browser denial names the app, not the settings page", () => {
  const msg = describeMicError(denied, { ua: instagram, hasMic: true });
  assertEquals(msg.startsWith("Instagram's built-in browser"), true);
});

Deno.test("no mediaDevices at all says so instead of blaming permissions", () => {
  assertEquals(
    describeMicError(new TypeError("undefined is not an object"), {
      ua: safari,
      hasMic: false,
    }),
    "This browser can't reach a microphone — Safari or Chrome can.",
  );
});

Deno.test("a plain browser denial keeps the permissions message", () => {
  assertEquals(
    describeMicError(denied, { ua: safari, hasMic: true }),
    "Microphone access was denied — allow it in your browser settings.",
  );
});

Deno.test("an ordinary failure is not reported as a blocked browser", () => {
  assertEquals(
    blockedMicMessage(new DOMException("busy", "NotReadableError"), {
      ua: instagram,
      hasMic: true,
    }),
    null,
  );
});
