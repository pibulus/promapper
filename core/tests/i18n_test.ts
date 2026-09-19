import { assertEquals } from "$std/assert/mod.ts";
import { t, TRANSLATIONS } from "../../utils/i18n.ts";

Deno.test("i18n: translations dictionary has matching keys for en and es", () => {
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  const esKeys = Object.keys(TRANSLATIONS.es).sort();

  assertEquals(enKeys, esKeys);
});

Deno.test("i18n: t() returns English dictionary by default or with explicit locale", () => {
  const en = t("en");
  assertEquals(en.btnStartRecording, "Start recording");
  assertEquals(en.listeningLive, "Listening live…");
  assertEquals(en.switchLang, "🇲🇽 Español");
  assertEquals(en.switchLangUrl, "/es");
});

Deno.test("i18n: t('es') returns Spanish dictionary", () => {
  const es = t("es");
  assertEquals(es.heroLines, ["Dale forma a", "lo que dices"]);
  assertEquals(es.btnStartRecording, "Empieza a grabar");
  assertEquals(es.btnStopAndMap, "Para y mapea");
  assertEquals(es.btnMapIt, "Mapea");
  assertEquals(es.btnTryAgain, "Inténtalo otra vez");
  assertEquals(es.listeningLive, "Escuchando en vivo…");
  assertEquals(es.livePill, "⚡ en vivo");
  assertEquals(es.switchLang, "🇦🇺 English");
  assertEquals(es.switchLangUrl, "/");
  assertEquals(
    es.mappedSuccess(3, 5),
    "¡Listo el mapa! 3 tareas y 5 temas",
  );
});
