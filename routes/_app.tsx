import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en">
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

        {/* Canonical (matches og:url; avoids dup-URL from share query params) */}
        <link rel="canonical" href="https://promapper.app/" />

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

        {
          /* FOUC prevention: apply saved theme CSS vars before first paint.
            Reads localStorage["promapper-theme"], looks up a minimal inline
            map of name → vars, and sets them on :root.
            Zero imports — intentionally self-contained. */
        }
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var saved=localStorage.getItem("promapper-theme");
if(!saved)return;
var parsed=JSON.parse(saved);
var name=parsed&&parsed.name;
if(!name)return;
var themes={
  "BUBBLEGUM":{
    "--color-base":"linear-gradient(135deg,#ffe8f3 0%,#fff3ec 100%)",
    "--color-base-solid":"#ffe8f3",
    "--color-base-gradient":"linear-gradient(135deg,#ffe8f3 0%,#fff3ec 100%)",
    "--color-secondary":"rgba(255,255,255,0.62)",
    "--color-accent":"#ff4d97",
    "--color-text":"#2b2430",
    "--color-text-secondary":"#8a7e88",
    "--color-border":"rgba(43,36,48,0.1)",
    "--shadow-soft":"0 4px 12px rgba(255,77,151,0.12)",
    "--gradient-bg":"radial-gradient(circle at 18% 18%,rgba(255,95,162,0.18),transparent 46%),radial-gradient(circle at 82% 12%,rgba(168,224,255,0.18),transparent 50%),radial-gradient(circle at 70% 85%,rgba(212,181,247,0.16),transparent 52%),linear-gradient(125deg,#fff6fb 0%,#fdf3ff 50%,#fff4ee 100%)"
  },
  "MINT":{
    "--color-base":"linear-gradient(135deg,#e8f8f5 0%,#cdeee8 100%)",
    "--color-base-solid":"#e8f8f5",
    "--color-base-gradient":"linear-gradient(135deg,#e8f8f5 0%,#cdeee8 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#10b8a0",
    "--color-text":"#2c4a42",
    "--color-text-secondary":"#7a9690",
    "--color-border":"rgba(44,74,66,0.1)",
    "--shadow-soft":"0 4px 12px rgba(93,190,170,0.12)",
    "--gradient-bg":"radial-gradient(circle at 20% 20%,rgba(93,190,170,0.14),transparent 45%),radial-gradient(circle at 80% 10%,rgba(200,240,220,0.18),transparent 50%),linear-gradient(125deg,#f4fdf9 0%,#e8f8f5 50%,#f0fdf7 100%)"
  },
  "LAVENDER":{
    "--color-base":"linear-gradient(135deg,#efe5f7 0%,#dbc9ed 100%)",
    "--color-base-solid":"#efe5f7",
    "--color-base-gradient":"linear-gradient(135deg,#efe5f7 0%,#dbc9ed 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#9b5de5",
    "--color-text":"#3d3a42",
    "--color-text-secondary":"#8b8390",
    "--color-border":"rgba(61,58,66,0.1)",
    "--shadow-soft":"0 4px 12px rgba(155,126,199,0.12)",
    "--gradient-bg":"radial-gradient(circle at 20% 20%,rgba(155,126,199,0.14),transparent 45%),radial-gradient(circle at 80% 10%,rgba(219,201,237,0.18),transparent 50%),linear-gradient(125deg,#faf7ff 0%,#f0e8f8 50%,#f5f0ff 100%)"
  },
  "BUTTER":{
    "--color-base":"linear-gradient(135deg,#fff8d6 0%,#ffeea3 100%)",
    "--color-base-solid":"#fff8d6",
    "--color-base-gradient":"linear-gradient(135deg,#fff8d6 0%,#ffeea3 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#e0a000",
    "--color-text":"#3a3220",
    "--color-text-secondary":"#7a6e54",
    "--color-border":"rgba(58,50,32,0.1)",
    "--shadow-soft":"0 4px 12px rgba(212,160,26,0.12)",
    "--gradient-bg":"radial-gradient(circle at 20% 20%,rgba(255,220,80,0.14),transparent 45%),radial-gradient(circle at 80% 10%,rgba(255,248,214,0.18),transparent 50%),linear-gradient(125deg,#fffef5 0%,#fff9e0 50%,#fffcf0 100%)"
  },
  "ROSE":{
    "--color-base":"linear-gradient(135deg,#ffe6f0 0%,#ffcce0 100%)",
    "--color-base-solid":"#ffe6f0",
    "--color-base-gradient":"linear-gradient(135deg,#ffe6f0 0%,#ffcce0 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#ff5d8f",
    "--color-text":"#3d2a35",
    "--color-text-secondary":"#8b7580",
    "--color-border":"rgba(61,42,53,0.1)",
    "--shadow-soft":"0 4px 12px rgba(196,96,122,0.12)",
    "--gradient-bg":"radial-gradient(circle at 20% 20%,rgba(232,93,143,0.14),transparent 45%),radial-gradient(circle at 80% 10%,rgba(255,204,224,0.18),transparent 50%),linear-gradient(125deg,#fff5f9 0%,#ffe8f2 50%,#fff0f7 100%)"
  }
};
var vars=themes[name];
if(!vars)return;
var root=document.documentElement;
Object.keys(vars).forEach(function(k){root.style.setProperty(k,vars[k]);});
}catch(e){}})();`,
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
