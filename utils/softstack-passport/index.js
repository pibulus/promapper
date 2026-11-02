// SoftStack Passport — canonical module.
// Vendored into TalkType, ZipList and QRBuddy. Test vectors live in
// test-vectors.json; a drift test hashes this file set in every app.

export * from "./code.js";
export * from "./identity.js";
export * from "./palettes.js";
export * from "./skins.js";
export * from "./card.html.js";
// `avatar.js` is intentionally not re-exported: it pulls `@dicebear/*`, and
// server-side callers of this index (edge functions, email) do not need faces.
// Card wrappers import it directly.
