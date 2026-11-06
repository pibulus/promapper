// GET /version.json
// Runtime deployment & source-hash stamp for ProMapper on Deno Deploy (which
// runs main.ts directly without a build step, by design).

import { Handlers } from "$fresh/server.ts";

const BOOT_TIME = new Date().toISOString();
let cachedSourceHash: string | null = null;

async function computeSourceHash(): Promise<string> {
  if (cachedSourceHash) return cachedSourceHash;
  const files: string[] = [];
  async function walk(path: string) {
    for await (const entry of Deno.readDir(path)) {
      const child = `${path}/${entry.name}`;
      if (child === "static/version.json") continue;
      if (entry.isDirectory) await walk(child);
      else if (entry.isFile) files.push(child);
    }
  }
  for (
    const dir of [
      "routes",
      "islands",
      "components",
      "core",
      "services",
      "signals",
      "utils",
      "static",
      "scripts",
    ]
  ) {
    try {
      await walk(dir);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  for (
    const file of [
      "deno.json",
      "fresh.config.ts",
      "main.ts",
      "dev.ts",
      "tailwind.config.ts",
    ]
  ) {
    try {
      await Deno.stat(file);
      files.push(file);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  const hex = (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0"))
      .join("");
  const manifest: string[] = [];
  for (const file of files.sort()) {
    manifest.push(
      `${file}\0${
        hex(await crypto.subtle.digest("SHA-256", await Deno.readFile(file)))
      }`,
    );
  }
  cachedSourceHash = hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(manifest.join("\n")),
    ),
  );
  return cachedSourceHash;
}

export const handler: Handlers = {
  async GET() {
    const fromEnv = (Deno.env.get("COMMIT_REF") || Deno.env.get("GITHUB_SHA"))
      ?.trim();
    const buildId = Deno.env.get("DENO_DEPLOYMENT_ID")?.trim() ?? null;
    const commit = fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv)
      ? fromEnv.slice(0, 7)
      : null;
    const sourceHash = await computeSourceHash();

    return new Response(
      `${
        JSON.stringify(
          { commit, buildId, sourceHash, built: BOOT_TIME },
          null,
          2,
        )
      }\n`,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  },
};
