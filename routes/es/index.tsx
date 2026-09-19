import { Head } from "$fresh/runtime.ts";
import HomeIsland from "../../islands/HomeIsland.tsx";

export default function SpanishHome() {
  const canonicalUrl = "https://promapper.app/es";
  const title =
    "ProMapper en Español — De pláticas sueltas a mapas de proyecto vivos";
  const description =
    "Convierte audios, juntas y pláticas sueltas en memoria de proyecto: transcripción limpia, pendientes claros con responsables, resumen ejecutivo y temas conectados.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="es" href={canonicalUrl} />
        <link rel="alternate" hrefLang="en" href="https://promapper.app" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ProMapper" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta
          property="og:image"
          content="https://promapper.app/og-image.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="ProMapper en Español — Mapas de proyecto vivos"
        />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta
          name="twitter:image"
          content="https://promapper.app/og-image.png"
        />

        {/* JSON-LD Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "ProMapper en Español",
            "url": canonicalUrl,
            "description": description,
            "applicationCategory": "ProductivityApplication",
            "operatingSystem": "All",
            "inLanguage": "es",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "AUD",
              "description":
                "Mapeo inteligente y colaborativo de pláticas y juntas",
            },
          })}
        </script>
      </Head>
      <HomeIsland />
    </>
  );
}
