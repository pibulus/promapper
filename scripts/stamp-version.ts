// ═══════════════════════════════════════════════════════════════════════════
// 🔖 stamp-version — write the commit being built into /version.json
// ═══════════════════════════════════════════════════════════════════════════
// Deno/Fresh port of ziplist/scripts/stamp-version.mjs. Same contract, same
// filename, so `fleet-check --deployed` reads every app the same way.
//
// WHY: the host cannot be asked what it is serving. Netlify returns a null
// commit_ref for CLI uploads; Deno Deploy exposes no commit at all. So the
// artifact answers for itself over plain HTTP instead.
//
// Fresh serves static/ at the root, so this lands at /version.json.
//
// ⚠️ Deno Deploy does NOT set COMMIT_REF the way Netlify does. If git is not
// available in the build container this falls back to DENO_DEPLOYMENT_ID,
// which is NOT a git sha — fleet-check will then read it as a mismatch rather
// than silently claiming currency. That is the correct failure direction:
// loudly unknown beats quietly wrong.

async function gitSha(): Promise<string | null> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return null;
    return new TextDecoder().decode(stdout).trim().slice(0, 7) || null;
  } catch {
    return null;
  }
}

const fromEnv = Deno.env.get("COMMIT_REF")?.trim();
const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID")?.trim();

const commit = fromEnv?.slice(0, 7) ??
  (await gitSha()) ??
  (deploymentId ? `deno:${deploymentId.slice(0, 12)}` : "unknown");

const stamp = { commit, built: new Date().toISOString() };

await Deno.mkdir("static", { recursive: true });
await Deno.writeTextFile(
  "static/version.json",
  `${JSON.stringify(stamp, null, 2)}\n`,
);

console.log(`🔖 version.json → ${stamp.commit} (${stamp.built})`);
