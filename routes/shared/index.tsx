/**
 * Shared Conversation Route - Query Parameter Handler
 *
 * Handles shared conversations passed via URL query parameters
 * Format: /shared?data=<compressed_data>
 */

import { PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import SharedConversationLoader from "../../islands/SharedConversationLoader.tsx";

export default function SharedConversationQuery({ url }: PageProps) {
  const searchParams = new URL(url).searchParams;
  const data = searchParams.get("data");

  // If no data parameter, show error
  if (!data) {
    return (
      <>
        <Head>
          <title>This share link is napping | ProMapper</title>
          <meta name="robots" content="noindex" />
        </Head>

        <div class="mapper-scene min-h-screen flex items-center justify-center px-6">
          <div class="shared-panel max-w-md">
            <div class="shared-panel__icon">
              <i class="fa fa-link-slash" aria-hidden="true"></i>
            </div>
            <h2 class="shared-panel__title">This link's a little sleepy</h2>
            <p class="shared-panel__body mb-6">
              Looks like part of it went missing on the way over. Ask whoever
              sent it for a fresh copy — or start a map of your own.
            </p>
            <a href="/" class="btn btn--accent">
              Go to Home
            </a>
          </div>
        </div>
      </>
    );
  }

  // Pass data with "data:" prefix to indicate URL-based share
  const shareId = `data:${data}`;

  return (
    <>
      <Head>
        <title>Someone shared a project map with you | ProMapper</title>
        <meta
          name="description"
          content="Peek at a project map someone put together — topics, action items, and the whole story, laid out."
        />
        {/* Private-by-link: don't index, keep the preview content-free. */}
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

        {/* Main Content - Initialize conversation from URL data */}
        <main class="max-w-6xl mx-auto px-6 py-8">
          <SharedConversationLoader shareId={shareId} />
        </main>
      </div>
    </>
  );
}
