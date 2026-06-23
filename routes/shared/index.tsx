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
          <title>Invalid Share Link | ProMapper</title>
        </Head>

        <div class="mapper-scene min-h-screen flex items-center justify-center px-6">
          <div class="bg-white rounded-lg border-4 border-red-300 shadow-lg p-8 text-center max-w-md">
            <div class="text-6xl mb-4">🔗</div>
            <h2 class="text-2xl font-bold text-red-600 mb-2">
              Invalid Share Link
            </h2>
            <p class="text-gray-700 mb-6">
              This share link appears to be malformed or incomplete.
            </p>
            <a
              href="/"
              class="inline-block bg-purple-500 text-white font-bold py-2 px-6 rounded-lg border-2 border-purple-700 hover:bg-purple-600 transition-colors"
            >
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
        <title>Shared Project Map | ProMapper</title>
        <meta
          name="description"
          content="View a shared ProMapper project map"
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
