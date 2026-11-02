# SoftStack Passport (canonical)

One code, one identity, one card, many stamps.

Pure helpers only: `code.js` owns namespaces and formatting, `identity.js` owns
the deterministic name/phrase/avatar/skin, `skins.js` + `palettes.js` own the
card's modular look, `avatar.js` owns DiceBear, and `card.html.js` builds the
one card markup every app renders. Each app supplies HMAC-SHA256 and SHA-256
from its own runtime.

- Code: HMAC(`softstack-passport-code:<seed>`, passport secret) → first 12 hex
  → `SS-XXXX-XXXX-XXXX`.
- Identity: SHA-256(`softstack-passport-id:<code>`) →
  `generateMemberIdentity(hash, code)`.
- Token: HS256, `{ sub: code, stamps: [app], tier: "supporter", exp }`, signed
  with the same shared secret in every app.
- Card: `renderMembershipCard({ identity, skin, appName, ... })` → markup
  string; `card.css` is the matching stylesheet. No framework, no DOM globals,
  no app services. The three app wrappers own state, events and adapters only.

**DiceBear stays.** `avatar.js` imports `@dicebear/core` +
`@dicebear/collection` so the same seed produces the same face everywhere. Every
app that renders a card therefore carries those two dependencies; do not swap in
hand-drawn faces, because the face is part of parity. `avatar.js` is not
re-exported from `index.js` so server/edge callers don't pull the collection.

Vendored copies must match this directory byte-for-byte; run the drift test in
each app. The same `card.html.js` + `card.css` are vendored into:

```
talktype/src/lib/softstack-passport/
ziplist/src/lib/softstack-passport/
qrbuddy/utils/softstack-passport/
promapper/utils/softstack-passport/
```

ProMapper is the fourth stamp. Its commercial plan (Solo/Guild/Lifetime) lives
in the token's `tier` claim; the passport's `stamps` claim names the app. A plan
is not a bundle: it does not change the code, name, phrase or card.

`manifest.json` lists every vendored file's SHA-256. `test-vectors.json` pins the
code, identity and the resolved card skin/palette for `SS-03D2-9722-1310`.
