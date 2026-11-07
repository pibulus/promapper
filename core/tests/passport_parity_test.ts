// ProMapper is the fourth Passport stamp. This pins the shared vector, the
// rendered card, the vendored hashes, the pinned manifest SHA-256, and the
// committed static card.css.

import { assertEquals } from "./_assert.ts";
import {
  codeInput,
  deriveLegacyPhrase,
  formatCode,
  generateMemberIdentity,
  getSyncRoomId,
  idInput,
  normalizeCode,
  parseFourWordPasskey,
  PASSPHRASE_ENTROPY_BITS,
  phraseFromHash,
  phraseInput,
  renderMembershipCard,
  selectSkin,
  stampsFor,
  WORDS,
} from "../../utils/softstack-passport/index.js";

const EXPECTED_MANIFEST_SHA256 =
  "d89419c336fcfa38118f1ba083df8a6f768f0f27708dfcfb50e5e35acbe5a748";

const vectors = JSON.parse(
  await Deno.readTextFile(
    new URL(
      "../../utils/softstack-passport/test-vectors.json",
      import.meta.url,
    ),
  ),
);
const manifestBytes = await Deno.readFile(
  new URL("../../utils/softstack-passport/manifest.json", import.meta.url),
);
const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));

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

Deno.test("Passport: bank entropy >= 44 bits (4,096 curated words = 48 bits)", () => {
  assertEquals(WORDS.length, 4096);
  assertEquals(new Set(WORDS).size, 4096);
  assertEquals(PASSPHRASE_ENTROPY_BITS >= 44, true);
  assertEquals(PASSPHRASE_ENTROPY_BITS, 48);
});

Deno.test("Passport: ProMapper shares the vector phrase, code, and identity", async () => {
  const phraseDigest = await hmacHex(phraseInput(vectors.seed), vectors.secret);
  const phrase = phraseFromHash(phraseDigest);
  assertEquals(phrase, vectors.phrase);

  const digest = await hmacHex(codeInput(phrase), vectors.secret);
  const code = formatCode(digest.slice(0, 12));
  assertEquals(code, vectors.code);
  assertEquals(normalizeCode(`  ${code.toLowerCase()}  `), vectors.code);

  const hash = await sha256(encoder.encode(idInput(code)));
  const identity = generateMemberIdentity(hash, code, { phrase });
  assertEquals(identity.name, vectors.identity.name);
  assertEquals(identity.phrase, vectors.identity.phrase);
  assertEquals(identity.memberId, vectors.code);
  assertEquals(identity.name, "Quiet Tapir");
  assertEquals(getSyncRoomId(phrase), vectors.syncRoomId);

  // Legacy holder keeps stored name and legacy phrase
  const legacyIdentity = generateMemberIdentity(
    vectors.legacy.vaultHash,
    vectors.legacy.code,
  );
  assertEquals(legacyIdentity.name, vectors.legacy.name);
  assertEquals(
    deriveLegacyPhrase(vectors.legacy.vaultHash),
    vectors.legacy.phrase,
  );

  // Phrase with one wrong word fails cleanly in < 50ms
  const t0 = performance.now();
  assertEquals(parseFourWordPasskey(vectors.phrase)?.phrase, vectors.phrase);
  assertEquals(
    parseFourWordPasskey("umbra-scanner-amplify-notawordinbank"),
    null,
  );
  assertEquals(performance.now() - t0 < 50, true);
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

Deno.test("Passport: resting card masks words and omits QR; reveals on demand", async () => {
  const hash = await sha256(encoder.encode(idInput(vectors.code)));
  const identity = generateMemberIdentity(hash, vectors.code, {
    phrase: vectors.phrase,
  });
  const skin = selectSkin(hash);
  const resting = renderMembershipCard({
    identity,
    skin,
    appName: "ProMapper",
    qrUrl: "https://promapper.app/#sync=test",
    qrImageUrl: "data:image/png;base64,AAAA",
  });

  assertEquals(resting.includes('data-passport-name="Quiet Tapir"'), true);
  assertEquals(resting.includes('data-passport-masked="true"'), true);
  assertEquals(resting.includes(vectors.phrase), false);
  assertEquals(resting.includes("data:image/png;base64,AAAA"), false);
  assertEquals(resting.includes(">••••• ••••• ••••• •••••</p>"), true);

  const html = renderMembershipCard({
    identity,
    skin,
    appName: "ProMapper",
    revealed: true,
    showQr: true,
    qrUrl: "https://promapper.app/#sync=test",
    qrImageUrl: "data:image/png;base64,AAAA",
  });

  assertEquals(
    html.includes(`data-passport-phrase="${vectors.phrase}"`),
    true,
  );
  assertEquals(html.includes('data-member-id="SS-FA39-DE19-4608"'), true);
  assertEquals(html.includes(">Quiet Tapir</p>"), true);
  assertEquals(html.includes(`>${vectors.phrase}</p>`), true);
});

Deno.test("Passport: vendored files, pinned manifest hash, and static card.css match", async () => {
  assertEquals(await sha256(manifestBytes), EXPECTED_MANIFEST_SHA256);
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
