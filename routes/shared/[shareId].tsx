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

        {/* Main Content - Initialize conversation from share ID */}
        <main class="max-w-6xl mx-auto px-6 py-8">
          <SharedConversationLoader shareId={shareId} />
        </main>
      </div>
    </>
  );
}
