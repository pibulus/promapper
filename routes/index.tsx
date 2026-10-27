import { Head } from "$fresh/runtime.ts";
import HomeIsland from "../islands/HomeIsland.tsx";

export default function Home() {
  const canonicalUrl = "https://promapper.app/";
  const title = "ProMapper - Living project maps from messy conversations";
  const description =
    "ProMapper turns voice notes, meetings, research, scenes, and written rants into project memory: transcript, summary, actions, topic map, docs, and sharing.";
  const ogDescription =
    "A friendly way to turn ongoing conversations and notes into transcripts, summaries, actions, topic maps, docs, and shared context.";

  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>{title}</title>
        <meta name="title" content={title} />
        <meta name="description" content={description} />

        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="en" href={canonicalUrl} />
        <link rel="alternate" hrefLang="es" href="https://promapper.app/es" />
        <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ProMapper" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:locale:alternate" content="es_MX" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={ogDescription} />
        {
          /* ABSOLUTE image URL — link scrapers (iMessage, WhatsApp, Slack)
            silently drop relative og:image paths, so the card showed no
            thumbnail. Width/height let them render before downloading. */
        }
        <meta
          property="og:image"
          content="https://promapper.app/og-image.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="ProMapper — project maps from messy conversations"
        />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={ogDescription} />
        <meta
          name="twitter:image"
          content="https://promapper.app/og-image.png"
        />

        {/* JSON-LD Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "ProMapper",
            "url": canonicalUrl,
            "description": description,
            "applicationCategory": "ProductivityApplication",
            "operatingSystem": "All",
            "inLanguage": "en",
            "featureList": [
              "Speaker-diarized audio and text transcription",
              "Interactive force-directed topic relationship maps",
              "Action items that auto-check themselves when completed in later takes",
              "Real-time collaborative rooms and shared project links",
              "8 Markdown export formats including Meeting Notes, Plan, Research Brief, and Campaign Chronicle",
            ],
            "offers": [
              {
                "@type": "Offer",
                "name": "Free Workshop Table",
                "price": "0",
                "priceCurrency": "AUD",
                "description":
                  "Unlimited local text maps, audio takes, all 8 export formats, and free BYOK OpenRouter key support",
              },
              {
                "@type": "Offer",
                "name": "ProMapper 1-Year Supporter Pass",
                "price": "49",
                "priceCurrency": "AUD",
                "description":
                  "Extended audio takes, full collaborative live rooms with voice chat, and permanent share links — no auto-renewal",
              },
            ],
          })}
        </script>
      </Head>
      <HomeIsland lang="en" />
    </>
  );
}
