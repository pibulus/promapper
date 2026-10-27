import { Head } from "$fresh/runtime.ts";
import DndStudioIsland from "../../islands/DndStudioIsland.tsx";

export default function RolLandingPage() {
  const canonicalUrl = "https://promapper.app/es/rol";
  const title =
    "Mapeo de partidas de rol y D&D — Del audio al mapa de tu campaña | ProMapper";
  const description =
    "Convierte sesiones caóticas de D&D y rol en mapas vivos: conexiones entre PNJs, misiones, botín y resúmenes en 1 clic para Discord.";

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
        <link
          rel="alternate"
          hrefLang="x-default"
          href="https://promapper.app/for/dnd"
        />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ProMapper" />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:locale:alternate" content="en_US" />
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
          content="ProMapper Rol y D&D — Mapeo de partidas de rol"
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
                "inLanguage": "es",
                "offers": [
                  {
                    "@type": "Offer",
                    "name": "Estudio Gratuito para Campañas de Rol",
                    "price": "0",
                    "priceCurrency": "AUD",
                    "description":
                      "Mapeador local y gratuito de campañas de rol con bandeja de dados, sonido ambiental y exportación en Markdown",
                  },
                  {
                    "@type": "Offer",
                    "name": "Pase de Soporte ProMapper (1 Año)",
                    "price": "49",
                    "priceCurrency": "AUD",
                    "description":
                      "Grabaciones largas de partida, salas colaborativas en vivo y enlaces permanentes — un solo pago sin cobros automáticos",
                  },
                ],
              },
              {
                "@type": "BreadcrumbList",
                "itemListElement": [
                  {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "ProMapper en Español",
                    "item": "https://promapper.app/es",
                  },
                  {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Partidas de Rol y D&D",
                    "item": canonicalUrl,
                  },
                ],
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
                        "Entra el audio de la sesión o las notas escritas. ProMapper extrae PNJs, facciones, misiones activas y botín en un mapa interactivo donde las misiones se palomean solas conforme avanza la campaña.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name":
                      "¿Cómo se comparte el tablero con el grupo de juego?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "El botón Compartir genera un enlace directo con el mapa completo. El grupo explora las conexiones de historia, misiones y resumen desde cualquier celular o computadora sin crear cuentas.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name":
                      "¿Se pueden exportar crónicas a Discord u Obsidian?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Sí. El formato Crónica de Campaña arma resúmenes limpios en Markdown con personajes, lugares, misiones y botín listos para pegar en Discord o en una bóveda de Obsidian.",
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
