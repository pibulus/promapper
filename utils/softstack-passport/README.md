# SoftStack Passport (canonical)

One 4-word passkey (root credential), one derived `SS-` public handle, one identity, one card, four stamps.

Pure helpers only: `code.js` owns namespaces and formatting, `identity.js` owns
the 4,096-word curated passkey bank (48 bits) and deterministic name/avatar/skin,
`skins.js` + `palettes.js` own the card's modular look, `avatar.js` owns
DiceBear, and `card.html.js` builds the one card markup every app renders. Each
app supplies HMAC-SHA256, SHA-256, and PBKDF2/scrypt from its own runtime.

- Phrase (root credential): 4 words from `WORDS` (4,096 curated words = 48 bits),
  either generated randomly (`generatePassphrase()`) or derived from a secret
  seed digest (`phraseFromHash(HMAC(phraseInput(seed), secret))`).
- Code (public handle): `HMAC("softstack-passport-code:" + phrase, secret)` →
  first 12 hex → `SS-XXXX-XXXX-XXXX`. One-way: a code alone never restores a
  Passport.
- Identity: `SHA-256("softstack-passport-id:" + code)` →
  `generateMemberIdentity(hash, code, { phrase, name })`. Stored at issue so
  future bank expansions never rename an existing holder.
- Token: HS256, `{ sub: code, stamps: [app], tier: "supporter", exp }`, signed
  with the canonical 64-hex `SOFTSTACK_PASSPORT_SECRET` across all four apps.
- Card: `renderMembershipCard({ identity, skin, appName, revealed, showQr, ... })`
  → markup string; `card.css` is the matching stylesheet. At rest (`revealed = false`,
  `showQr = true`), the card masks the 4 words (`••••• ••••• ••••• •••••`) while
  displaying the scannable QR stamp (`showQr: false` swaps in the ghost seal). The
  four app wrappers own state, events, and adapters only.

**DiceBear stays.** `avatar.js` imports `@dicebear/core` +
`@dicebear/collection` so the same seed produces the same face everywhere. Every
app that renders a card therefore carries those two dependencies; do not swap in
hand-drawn faces, because the face is part of parity. `avatar.js` is not
re-exported from `index.js` so server/edge callers don't pull the collection.

Vendored copies must match this directory byte-for-byte (`node scripts/vendor.mjs`
and `node scripts/check.mjs`). The canonical module is vendored into all four apps:

```
talktype/src/lib/softstack-passport/
ziplist/src/lib/softstack-passport/
qrbuddy/utils/softstack-passport/
promapper/utils/softstack-passport/
```

ProMapper is the fourth stamp. Its commercial plan (Solo/Guild/Lifetime) lives
in the token's `tier` claim; the passport's `stamps` claim names the app. A plan
is not a bundle: it does not change the code, name, phrase or card.

`manifest.json` lists every vendored file's SHA-256, and its own SHA-256 is
pinned in `scripts/check.mjs` and in each app's parity test. `test-vectors.json`
pins the phrase (`umbra-scanner-amplify-cosmos`), derived code (`SS-FA39-DE19-4608`),
identity (`Quiet Tapir`), card skin/palette, and legacy migration fixture (`SS-03D2-9722-1310`).
