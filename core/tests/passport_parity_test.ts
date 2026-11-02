// ProMapper is the fourth Passport stamp. This pins the shared vector, the
// rendered card, the vendored hashes, and the committed static card.css.

import { assertEquals } from "./_assert.ts";
import {
  codeInput,
  formatCode,
  generateMemberIdentity,
  idInput,
  normalizeCode,
  renderMembershipCard,
  selectSkin,
  stampsFor,
} from "../../utils/softstack-passport/index.js";

const vectors = JSON.parse(
  await Deno.readTextFile(
    new URL(
      "../../utils/softstack-passport/test-vectors.json",
      import.meta.url,
    ),
  ),
);
const manifest = JSON.parse(
  await Deno.readTextFile(
    new URL("../../utils/softstack-passport/manifest.json", import.meta.url),
  ),
);

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}

async function sha256(value: Uint8Array) {
  const data = value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

Deno.test("Passport: ProMapper shares the vector code and identity", async () => {
  const digest = await hmacHex(codeInput(vectors.seed), vectors.secret);
  const code = formatCode(digest.slice(0, 12));
  assertEquals(code, vectors.code);
  assertEquals(normalizeCode(`  ${code.toLowerCase()}  `), vectors.code);

  const hash = await sha256(encoder.encode(idInput(code)));
  const identity = generateMemberIdentity(hash, code);
  assertEquals(identity.name, vectors.identity.name);
  assertEquals(identity.phrase, vectors.identity.phrase);
  assertEquals(identity.memberId, vectors.code);
  assertEquals(identity.name, "Glitch Walrus");
});

Deno.test("Passport: ProMapper is a first-class stamp", () => {
  assertEquals(vectors.apps, ["talktype", "ziplist", "qrbuddy", "promapper"]);
  assertEquals(stampsFor("promapper"), ["promapper"]);
  assertEquals(stampsFor("talktype", "promapper"), ["talktype", "promapper"]);
});

Deno.test("Passport: the vector resolves the shared card skin and palette", async () => {
  const hash = await sha256(encoder.encode(idInput(vectors.code)));
  const skin = selectSkin(hash);
  assertEquals(skin.name, vectors.card.skin);
  assertEquals(skin.palette.name, vectors.card.palette);
  assertEquals(skin.choices, vectors.card.choices);
});

Deno.test("Passport: the shared renderer draws the ProMapper card", async () => {
  const hash = await sha256(encoder.encode(idInput(vectors.code)));
  const identity = generateMemberIdentity(hash, vectors.code);
  const skin = selectSkin(hash);
  const html = renderMembershipCard({ identity, skin, appName: "ProMapper" });

  assertEquals(html.includes('data-passport-name="Glitch Walrus"'), true);
  assertEquals(
    html.includes('data-passport-phrase="glitch-walrus-ripples-harbourside"'),
    true,
  );
  assertEquals(html.includes('data-member-id="SS-03D2-9722-1310"'), true);
  assertEquals(html.includes('data-palette="Grape Soda"'), true);
  assertEquals(html.includes('data-holo="prismatic"'), true);
  assertEquals(html.includes('data-frame="soft"'), true);
  assertEquals(html.includes('data-texture="halftone"'), true);
  assertEquals(html.includes('data-type="display"'), true);
  assertEquals(html.includes('data-avatar="adventurer"'), true);
  assertEquals(html.includes(">Glitch Walrus</p>"), true);
  assertEquals(
    html.includes(">glitch-walrus-ripples-harbourside</p>"),
    true,
  );
});

Deno.test("Passport: vendored files and static card.css match", async () => {
  for (const [file, expected] of Object.entries(manifest.files)) {
    const bytes = await Deno.readFile(
      new URL(`../../utils/softstack-passport/${file}`, import.meta.url),
    );
    assertEquals(await sha256(bytes), expected, `${file} drifted`);
  }
  const vendored = await Deno.readFile(
    new URL("../../utils/softstack-passport/card.css", import.meta.url),
  );
  const served = await Deno.readFile(
    new URL("../../static/passport-card.css", import.meta.url),
  );
  assertEquals(await sha256(served), await sha256(vendored));
});
