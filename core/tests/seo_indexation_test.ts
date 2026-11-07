/**
 * Guard: Arachne's SEO & Indexation Invariants for ProMapper.
 *
 * Ensures:
 * 1. routes/_app.tsx never hardcodes <link rel="canonical"> or hreflang tags
 *    that would collide with child routes' <Head> blocks.
 * 2. setSsrLocale("es") makes getLocale() / isSpanish() / t() return Spanish
 *    during Deno SSR when window is undefined.
 * 3. static/sitemap.xml never includes /shared (noindex) and every <url> has
 *    en, es, and x-default hreflang links.
 * 4. All vanity shortlinks (/dnd, /rol, /meetings, /juntas, /research,
 *    /investigacion, /brainstorming, /ideas) use permanent 301 redirects.
 */

import { assertEquals } from "./_assert.ts";
import { getLocale, isSpanish, setSsrLocale, t } from "../../utils/i18n.ts";
import {
  handler as middlewareHandler,
  LEGACY_VERTICAL_REDIRECTS,
} from "../../routes/_middleware.ts";

const appSource = await Deno.readTextFile(
  new URL("../../routes/_app.tsx", import.meta.url),
);
const sitemapSource = await Deno.readTextFile(
  new URL("../../static/sitemap.xml", import.meta.url),
);

Deno.test("routes/_app.tsx does not hardcode canonical or hreflang tags", () => {
  assertEquals(
    appSource.includes('rel="canonical"'),
    false,
    "_app.tsx must not hardcode a canonical link (it duplicates on every child route)",
  );
  assertEquals(
    appSource.includes("hrefLang="),
    false,
    "_app.tsx must not hardcode hreflang links",
  );
  assertEquals(
    appSource.includes("<html lang={lang}>"),
    true,
    "_app.tsx must bind <html lang={lang}> dynamically for /es* routes",
  );
});

Deno.test("setSsrLocale switches server-side i18n between en and es", () => {
  try {
    setSsrLocale("es");
    assertEquals(getLocale(), "es");
    assertEquals(isSpanish(), true);
    assertEquals(t().btnStartRecording, "Empieza a grabar");

    setSsrLocale("en");
    assertEquals(getLocale(), "en");
    assertEquals(isSpanish(), false);
    assertEquals(t().btnStartRecording, "Start recording");
  } finally {
    setSsrLocale("en");
  }
});

Deno.test("static/sitemap.xml excludes /shared and includes all 16 bilingual routes with x-default", () => {
  assertEquals(
    sitemapSource.includes("https://promapper.app/shared"),
    false,
    "sitemap.xml must never list /shared (which is a noindex route)",
  );

  const expectedLocs = [
    "https://promapper.app/",
    "https://promapper.app/es",
    "https://promapper.app/for/meetings",
    "https://promapper.app/es/juntas",
    "https://promapper.app/for/clients",
    "https://promapper.app/es/clientes",
    "https://promapper.app/for/care",
    "https://promapper.app/es/consultas",
    "https://promapper.app/for/schools",
    "https://promapper.app/es/escuelas",
    "https://promapper.app/for/research",
    "https://promapper.app/es/investigacion",
    "https://promapper.app/for/brainstorming",
    "https://promapper.app/es/ideas",
    "https://promapper.app/for/dnd",
    "https://promapper.app/es/rol",
  ];

  for (const loc of expectedLocs) {
    assertEquals(
      sitemapSource.includes(`<loc>${loc}</loc>`),
      true,
      `sitemap.xml must include <loc>${loc}</loc>`,
    );
  }

  const xDefaultMatches = sitemapSource.match(/hreflang="x-default"/g) || [];
  assertEquals(
    xDefaultMatches.length,
    expectedLocs.length,
    "Every <url> in sitemap.xml must include hreflang='x-default'",
  );
});

Deno.test("shorthand redirect routes return permanent 301 status", async () => {
  const expectedRedirects: Record<string, string> = {
    "/brainstorming": "/for/brainstorming",
    "/care": "/for/care",
    "/clients": "/for/clients",
    "/dnd": "/for/dnd",
    "/meetings": "/for/meetings",
    "/research": "/for/research",
    "/schools": "/for/schools",
    "/clientes": "/es/clientes",
    "/consultas": "/es/consultas",
    "/escuelas": "/es/escuelas",
    "/ideas": "/es/ideas",
    "/investigacion": "/es/investigacion",
    "/juntas": "/es/juntas",
    "/rol": "/es/rol",
  };
  assertEquals(LEGACY_VERTICAL_REDIRECTS, expectedRedirects);

  for (const [shortPath, targetPath] of Object.entries(expectedRedirects)) {
    const req = new Request(`https://promapper.app${shortPath}`);
    const resp = await middlewareHandler(req, {
      next: () => Promise.resolve(new Response("unreachable", { status: 200 })),
    } as never);
    assertEquals(
      resp.status,
      301,
      `${shortPath} must use permanent 301 redirect`,
    );
    assertEquals(
      resp.headers.get("Location"),
      targetPath,
      `${shortPath} must redirect to ${targetPath}`,
    );
  }
});

Deno.test("routes/example.tsx pins preset='dusty' so PorchTable opens The Halloran Situation", async () => {
  const exampleSource = await Deno.readTextFile(
    new URL("../../routes/example.tsx", import.meta.url),
  );
  assertEquals(
    exampleSource.includes('preset="dusty"'),
    true,
    "routes/example.tsx must pass preset='dusty' to DemoSeedIsland",
  );
});
