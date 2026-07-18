/**
 * Shared Conversation Route - Public View
 *
 * Read-only view of shared conversations accessible via share link
 */

import { PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import SharedConversationLoader from "../../islands/SharedConversationLoader.tsx";

export default function SharedConversation({ params }: PageProps) {
  const { shareId } = params;

  return (
    <>
      <Head>
        <title>Someone shared a project map with you | ProMapper</title>
        <meta
          name="description"
          content="Peek at a project map someone put together — topics, action items, and the whole story, laid out."
        />
        {/* Private-by-link: don't index a share URL, and keep the preview
            content-free so it never leaks what's inside. */}
        <meta name="robots" content="noindex" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Someone shared a project map with you"
        />
        <meta
          property="og:description"
          content="Take a look — topics, action items, and the whole story, tidied into one map."
        />
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
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          property="twitter:title"
          content="Someone shared a project map with you"
        />
        <meta
          property="twitter:description"
          content="Take a look — topics, action items, and the whole story, tidied into one map."
        />
        <meta
          property="twitter:image"
          content="https://promapper.app/og-image.png"
        />
      </Head>

      <div class="mapper-scene min-h-screen">
        {/* Header */}
        <header
          class="app-header-glass"
          style={{
            borderBottom: "2px solid rgba(0, 0, 0, 0.08)",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <h1 class="truncate text-xl sm:text-2xl font-extrabold text-gray-900">
                  ProMapper
                </h1>
                <p class="text-sm text-gray-600 mt-1">
                  Shared project map
                </p>
              </div>
              <a
                href="/"
                class="ml-3 inline-flex min-h-11 items-center rounded-lg border-2 border-gray-900 bg-gray-900 px-3 sm:px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800"
              >
                Create Your Own
              </a>
            </div>
          </div>
        </header>

        {/* Main Content - Initialize conversation from share ID */}
        <main class="max-w-6xl mx-auto px-6 py-8">
          <SharedConversationLoader shareId={shareId} />
        </main>
      </div>
    </>
  );
}
