// Request Guard integration test for Supporter Passes and BYOK access.

import { assertEquals } from "./_assert.ts";
import {
  guardAudioBudget,
  guardLiveRoomAccess,
  isSupporterRequest,
} from "../../services/requestGuard.ts";
import { signSupporterPass } from "../../services/supporterPass.ts";

Deno.test("isSupporterRequest returns true for valid x-promapper-pass header", async () => {
  const token = await signSupporterPass({ checkoutId: "guard-test-1" });

  const reqWithHeader = new Request("http://localhost:8003/api/process", {
    headers: { "x-promapper-pass": token },
  });
  assertEquals(await isSupporterRequest(reqWithHeader), true);

  const reqWithCookie = new Request("http://localhost:8003/api/process", {
    headers: { cookie: `pm_supporter_pass=${token}` },
  });
  assertEquals(await isSupporterRequest(reqWithCookie), true);

  const reqWithMasterCode = new Request("http://localhost:8003/api/process", {
    headers: { "x-promapper-pass": "PIBULUS" },
  });
  assertEquals(await isSupporterRequest(reqWithMasterCode), true);

  const plainReq = new Request("http://localhost:8003/api/process");
  assertEquals(await isSupporterRequest(plainReq), false);
});

Deno.test("guardAudioBudget waives recording cap for supporters", async () => {
  Deno.env.set("AUDIO_BYTES_PER_DAY", "1000"); // 1KB limit
  const token = await signSupporterPass({ checkoutId: "audio-test-1" });

  const supporterReq = new Request("http://localhost:8003/api/process", {
    headers: { "x-promapper-pass": token },
  });

  // Even 100MB of audio is allowed for supporters
  const block = await guardAudioBudget(supporterReq, 100 * 1024 * 1024);
  assertEquals(block, null);

  Deno.env.set("AUDIO_BYTES_PER_DAY", "0");
});

Deno.test("guardLiveRoomAccess gates live room creation to supporters and BYOK", async () => {
  Deno.env.set("REQUIRE_SUPPORTER_LIVE", "true");
  const token = await signSupporterPass({ checkoutId: "live-test-1" });

  // Supporter allowed
  const supporterReq = new Request("http://localhost:8003/api/live/create", {
    method: "POST",
    headers: { "x-promapper-pass": token },
  });
  assertEquals(await guardLiveRoomAccess(supporterReq), null);

  // BYOK allowed
  const byokReq = new Request("http://localhost:8003/api/live/create", {
    method: "POST",
    headers: {
      "x-openrouter-key": "sk-or-v1-my-secret-openrouter-key-12345678",
    },
  });
  assertEquals(await guardLiveRoomAccess(byokReq), null);

  // Free tier without pass or BYOK receives 402 Payment Required
  const freeReq = new Request("http://localhost:8003/api/live/create", {
    method: "POST",
  });
  const res = await guardLiveRoomAccess(freeReq);
  assertEquals(res?.status, 402);
  const data = await res?.json();
  assertEquals(data.needs_supporter, true);

  Deno.env.delete("REQUIRE_SUPPORTER_LIVE");
});
