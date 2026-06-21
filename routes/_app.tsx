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
  "SKY":{
    "--color-base":"linear-gradient(135deg,#e3f4ff 0%,#eef9ff 100%)",
    "--color-base-solid":"#e3f4ff",
    "--color-base-gradient":"linear-gradient(135deg,#e3f4ff 0%,#eef9ff 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#0aa6ff",
    "--color-text":"#1f3344",
    "--color-text-secondary":"#6f8597",
    "--color-border":"rgba(31,51,68,0.1)",
    "--shadow-soft":"0 4px 12px rgba(10,166,255,0.12)",
    "--surface-card":"#f3faff",
    "--surface-card-deep":"#e8f5ff",
    "--gradient-bg":"radial-gradient(circle at 18% 18%,rgba(10,166,255,0.16),transparent 46%),radial-gradient(circle at 82% 12%,rgba(120,220,255,0.18),transparent 50%),radial-gradient(circle at 70% 85%,rgba(168,247,220,0.14),transparent 52%),linear-gradient(125deg,#f2fbff 0%,#eef9ff 50%,#f4feff 100%)"
  },
  "GRAPE":{
    "--color-base":"linear-gradient(135deg,#f0ebff 0%,#f6f1ff 100%)",
    "--color-base-solid":"#f0ebff",
    "--color-base-gradient":"linear-gradient(135deg,#f0ebff 0%,#f6f1ff 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#7c5cff",
    "--color-text":"#312a45",
    "--color-text-secondary":"#807a96",
    "--color-border":"rgba(49,42,69,0.1)",
    "--shadow-soft":"0 4px 12px rgba(124,92,255,0.12)",
    "--surface-card":"#f7f4ff",
    "--surface-card-deep":"#efe9ff",
    "--gradient-bg":"radial-gradient(circle at 18% 18%,rgba(124,92,255,0.16),transparent 46%),radial-gradient(circle at 82% 12%,rgba(255,120,200,0.16),transparent 50%),radial-gradient(circle at 70% 85%,rgba(120,200,255,0.14),transparent 52%),linear-gradient(125deg,#f7f3ff 0%,#f4f0ff 50%,#fbf4ff 100%)"
  },
  "LIME":{
    "--color-base":"linear-gradient(135deg,#e6fbef 0%,#f0fdf5 100%)",
    "--color-base-solid":"#e6fbef",
    "--color-base-gradient":"linear-gradient(135deg,#e6fbef 0%,#f0fdf5 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#10b550",
    "--color-text":"#1f3a2b",
    "--color-text-secondary":"#6f8c7c",
    "--color-border":"rgba(31,58,43,0.1)",
    "--shadow-soft":"0 4px 12px rgba(16,181,80,0.12)",
    "--surface-card":"#f2fdf6",
    "--surface-card-deep":"#e8fbef",
    "--gradient-bg":"radial-gradient(circle at 18% 18%,rgba(16,181,80,0.16),transparent 46%),radial-gradient(circle at 82% 12%,rgba(255,224,110,0.16),transparent 50%),radial-gradient(circle at 70% 85%,rgba(120,220,255,0.12),transparent 52%),linear-gradient(125deg,#f3fef7 0%,#eefdf3 50%,#f6fef8 100%)"
  },
  "GOLD":{
    "--color-base":"linear-gradient(135deg,#fff6da 0%,#fffaea 100%)",
    "--color-base-solid":"#fff6da",
    "--color-base-gradient":"linear-gradient(135deg,#fff6da 0%,#fffaea 100%)",
    "--color-secondary":"rgba(255,255,255,0.65)",
    "--color-accent":"#f5b300",
    "--color-text":"#3a3016",
    "--color-text-secondary":"#8a7b54",
    "--color-border":"rgba(58,48,22,0.1)",
    "--shadow-soft":"0 4px 12px rgba(245,179,0,0.14)",
    "--gradient-bg":"radial-gradient(circle at 18% 18%,rgba(255,200,30,0.18),transparent 46%),radial-gradient(circle at 82% 12%,rgba(255,130,190,0.14),transparent 50%),radial-gradient(circle at 70% 85%,rgba(120,220,255,0.12),transparent 52%),linear-gradient(125deg,#fffdf2 0%,#fffae6 50%,#fffef4 100%)"
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
