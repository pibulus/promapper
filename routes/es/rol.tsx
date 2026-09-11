import { Head } from "$fresh/runtime.ts";
import DndStudioIsland from "../../islands/DndStudioIsland.tsx";

export default function RolLandingPage() {
  const canonicalUrl = "https://promapper.app/es/rol";
  const title =
    "Mapeo de Partidas de Rol y D&D — De Audio a Grafos de Lore | ProMapper";
  const description =
    "Convierte sesiones caóticas de D&D y rol en mapas interactivos de lore, conexiones de PNJs, objetivos de misiones y resúmenes en 1 clic para Discord.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="es" href={canonicalUrl} />
        <link
          rel="alternate"
          hrefLang="en"
          href="https://promapper.app/for/dnd"
        />

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
          content="ProMapper Rol y D&D — Mapeo de Partidas de Rol"
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

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebApplication",
                "name": "ProMapper para Partidas de Rol y D&D",
                "url": canonicalUrl,
                "description": description,
                "applicationCategory": "EntertainmentApplication",
                "operatingSystem": "All",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD",
                  "description": "Mapeador de campañas de rol local y gratuito",
                },
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "¿Cómo mapea ProMapper las sesiones de rol?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Graba el audio de tu partida o pega tus notas. ProMapper extrae automáticamente PNJs, facciones, objetivos de misiones y botín en un grafo visual interactivo.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name": "¿Puedo compartir el tablero con mis jugadores?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "¡Sí! Al hacer clic en Compartir obtienes un enlace con datos comprimidos en la URL. Tus jugadores abren el mapa interactivo en sus celulares sin registrar cuentas.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name": "¿Puedo exportar notas a Discord u Obsidian?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "¡Totalmente! Genera resúmenes de sesión en Markdown limpios listos para pegar en tu canal de Discord o en tu bóveda de Obsidian.",
                    },
                  },
                ],
              },
            ],
          })}
        </script>
      </Head>
      <DndStudioIsland lang="es" />
    </>
  );
}
