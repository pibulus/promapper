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
        <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />

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
                "inLanguage": "en",
                "offers": [
                  {
                    "@type": "Offer",
                    "name": "Free Tabletop Campaign Studio",
                    "price": "0",
                    "priceCurrency": "AUD",
                    "description":
                      "Free local-first tabletop campaign mapper with dice tray, ambient soundscapes, and Markdown exports",
                  },
                  {
                    "@type": "Offer",
                    "name": "ProMapper 1-Year Supporter Pass",
                    "price": "49",
                    "priceCurrency": "AUD",
                    "description":
                      "Extended session audio takes, full multiplayer live rooms, and permanent campaign share links — no auto-renewal",
                  },
                ],
              },
              {
                "@type": "BreadcrumbList",
                "itemListElement": [
                  {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "ProMapper",
                    "item": "https://promapper.app/",
                  },
                  {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "D&D & TTRPG Campaign Studio",
                    "item": canonicalUrl,
                  },
                ],
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "How does ProMapper map a D&D or TTRPG session?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Drop in session audio or written notes. ProMapper extracts NPCs, factions, active quest objectives, and party loot into an interactive force-directed lore graph where quests tick themselves off as later sessions unfold.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name":
                      "How does campaign sharing work for the rest of the party?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Click Share to generate a compressed link or permanent board URL. Players explore the interactive lore graph, quest log, and session summary on any phone or laptop with zero account signups.",
                    },
                  },
                  {
                    "@type": "Question",
                    "name":
                      "Does it export session recaps to Discord and Obsidian?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text":
                        "Yes. The Campaign Chronicle export preset builds clean Markdown recaps with dramatis personae, locations, active quests, and party loot ready to paste straight into a Discord channel or Obsidian vault.",
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
