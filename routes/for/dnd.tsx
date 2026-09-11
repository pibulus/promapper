import { Head } from "$fresh/runtime.ts";
import DndStudioIsland from "../../islands/DndStudioIsland.tsx";

export default function DndLandingPage() {
  const canonicalUrl = "https://promapper.app/for/dnd";
  const title =
    "D&D & TTRPG Campaign Voice Mapping — Session Audio to Lore Graphs | ProMapper";
  const description =
    "Turn 4-hour chaotic D&D and tabletop RPG sessions into interactive lore topic maps, NPC connection graphs, quest action items, and 1-click Discord session recaps.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="en" href={canonicalUrl} />
        <link
          rel="alternate"
          hrefLang="es"
          href="https://promapper.app/es/rol"
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
          content="ProMapper D&D Campaign Studio — Tabletop RPG Voice Mapping"
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
                "name": "ProMapper D&D Campaign Studio",
                "url": canonicalUrl,
                "description": description,
                "applicationCategory": "EntertainmentApplication",
                "operatingSystem": "All",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD",
                  "description": "Free local-first tabletop campaign mapper",
                },
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "How does ProMapper map my D&D session?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Record your session audio or paste notes. ProMapper automatically extracts NPCs, factions, open quest objectives, and party loot into an interactive force-directed graph.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name": "Can I share the campaign board with my players?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Yes! Click Share to get a compressed URL link. Your players can explore the interactive graph on their phones with zero account registration.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name": "Can I export notes to Discord or Obsidian?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Yes! ProMapper generates 1-click formatted Markdown summaries and quest logs ready to paste directly into Discord channels or your Obsidian lore vault.",
                    },
                  },
                ],
              },
            ],
          })}
        </script>
      </Head>
      <DndStudioIsland lang="en" />
    </>
  );
}
