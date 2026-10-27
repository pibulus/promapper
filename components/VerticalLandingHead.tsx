import { Head } from "$fresh/runtime.ts";
import {
  VERTICAL_CONFIG,
  type VerticalKind,
} from "../islands/VerticalStudioIsland.tsx";

export interface VerticalLandingHeadProps {
  kind: VerticalKind;
  lang: "en" | "es";
  title: string;
  description: string;
  breadcrumbLabel: string;
}

export default function VerticalLandingHead({
  kind,
  lang,
  title,
  description,
  breadcrumbLabel,
}: VerticalLandingHeadProps) {
  const copy = VERTICAL_CONFIG[kind][lang];
  const enUrl = `https://promapper.app${copy.enPath}`;
  const esUrl = `https://promapper.app${copy.esPath}`;
  const canonicalUrl = lang === "es" ? esUrl : enUrl;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="es" href={esUrl} />
      <link rel="alternate" hrefLang="x-default" href={enUrl} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="ProMapper" />
      <meta property="og:locale" content={lang === "es" ? "es_MX" : "en_US"} />
      <meta
        property="og:locale:alternate"
        content={lang === "es" ? "en_US" : "es_MX"}
      />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content="https://promapper.app/og-image.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />

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
              "name": title.split(" — ")[0],
              "url": canonicalUrl,
              "description": description,
              "applicationCategory": "ProductivityApplication",
              "operatingSystem": "All",
              "inLanguage": lang,
              "offers": [
                {
                  "@type": "Offer",
                  "name": lang === "es"
                    ? "Mesa de Trabajo Gratuita"
                    : "Free Workshop Table",
                  "price": "0",
                  "priceCurrency": "AUD",
                  "description": lang === "es"
                    ? "Mapas locales ilimitados, 8 formatos de exportación y soporte para llave propia (BYOK)"
                    : "Unlimited local maps, all 8 Markdown export formats, and free BYOK key routing",
                },
                {
                  "@type": "Offer",
                  "name": lang === "es"
                    ? "Pase de Soporte ProMapper (1 Año)"
                    : "ProMapper 1-Year Supporter Pass",
                  "price": "49",
                  "priceCurrency": "AUD",
                  "description": lang === "es"
                    ? "Tomas de audio extendidas, salas colaborativas en vivo con voz y enlaces permanentes — sin cobros automáticos"
                    : "Extended audio takes, full collaborative live rooms with voice chat, and permanent share links — no auto-renewal",
                },
              ],
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": lang === "es" ? "ProMapper en Español" : "ProMapper",
                  "item": lang === "es"
                    ? "https://promapper.app/es"
                    : "https://promapper.app/",
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": breadcrumbLabel,
                  "item": canonicalUrl,
                },
              ],
            },
            {
              "@type": "FAQPage",
              "mainEntity": copy.faqs.map((faq) => ({
                "@type": "Question",
                "name": faq.question,
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": faq.answer,
                },
              })),
            },
          ],
        })}
      </script>
    </Head>
  );
}
