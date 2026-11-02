// Copy the canonical Passport stylesheet into static/ for the <link> in _app.
// ProMapper has no deploy-time build, so the copy is committed; the parity test
// fails if it drifts from utils/softstack-passport/card.css.
const source = new URL("../utils/softstack-passport/card.css", import.meta.url);
const target = new URL("../static/passport-card.css", import.meta.url);

await Deno.copyFile(source, target);
console.log("passport card css → static/passport-card.css");
