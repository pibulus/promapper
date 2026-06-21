import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* Primary Meta Tags */}
        <title>ProMapper - Living project maps from messy conversations</title>
        <meta
          name="title"
          content="ProMapper - Living project maps from messy conversations"
        />
        <meta
          name="description"
          content="ProMapper turns voice notes, meetings, research, scenes, and written rants into project memory: transcript, summary, actions, topic map, docs, and sharing."
        />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://promapper.app/" />
        <meta
          property="og:title"
          content="ProMapper - Living project maps from messy conversations"
        />
        <meta
          property="og:description"
          content="A friendly way to turn ongoing conversations and notes into transcripts, summaries, actions, topic maps, docs, and shared context."
        />
        <meta property="og:image" content="/og-image.png" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          property="twitter:url"
          content="https://promapper.app/"
        />
        <meta
          property="twitter:title"
          content="ProMapper - Living project maps from messy conversations"
        />
        <meta
          property="twitter:description"
          content="A friendly way to turn ongoing conversations and notes into transcripts, summaries, actions, topic maps, docs, and shared context."
        />
        <meta property="twitter:image" content="/og-image.png" />

        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />

        {/* Theme Color */}
        <meta name="theme-color" content="#FFE5EC" />

        {/* Styles */}
        <link rel="stylesheet" href="/styles.css" />

        {/* Initialize theme from localStorage before render */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
            try {
              const stored = localStorage.getItem('project-mapper-theme') ||
                localStorage.getItem('conversation-mapper-theme');
              if (stored && !localStorage.getItem('project-mapper-theme')) {
                localStorage.setItem('project-mapper-theme', stored);
              }
              if (stored) {
                const theme = JSON.parse(stored);
                // Apply all theme variables (OKLCH colors + gradient)
                Object.entries(theme).forEach(([key, value]) => {
                  if (key.startsWith('--color-') || key === '--gradient-bg') {
                    document.documentElement.style.setProperty(key, value);
                  }
                });
              }
            } catch (e) {
              console.error('Error setting initial theme:', e);
            }
          `,
          }}
        />
      </head>
      <body>
        <div class="scroll-progress" aria-hidden="true"></div>
        <Component />
      </body>
    </html>
  );
}
