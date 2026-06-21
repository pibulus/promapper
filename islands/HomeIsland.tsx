/**
 * Home Island - Main Layout with Conditional Visibility
 *
 * Shows upload panel + sidebar when NO data
 * Shows only dashboard when data exists
 */

import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { conversationData } from "@signals/conversationStore.ts";
import {
  getActiveConversationId,
  loadConversation,
} from "../core/storage/localStorage.ts";
import UploadIsland from "./UploadIsland.tsx";
import DashboardIsland from "./DashboardIsland.tsx";
import MobileHistoryMenu from "./MobileHistoryMenu.tsx";
import ShareButton from "./ShareButton.tsx";
import MarkdownMakerDrawer from "./MarkdownMakerDrawer.tsx";
import AudioRecorder from "./AudioRecorder.tsx";

const drawerOpen = signal(false);

export default function HomeIsland() {
  // Restore last conversation on mount
  useEffect(() => {
    // Auto-restore last active conversation from localStorage
    const activeId = getActiveConversationId();
    if (activeId && !conversationData.value) {
      const stored = loadConversation(activeId);
      if (stored) {
        conversationData.value = stored;
        console.log(
          "✅ Restored conversation from localStorage:",
          stored.conversation.title || activeId,
        );
      }
    }
  }, []);

  // Get transcript for MarkdownMaker
  const transcript = conversationData.value?.transcript?.text || "";

  const heroLines = ["See what you're", "really saying"];
  const heroTags = ["topics", "tasks", "docs"];

  return (
    <div class="mapper-scene min-h-screen">
      {/* Top Bar - Brand presence */}
      <header
        style={{
          background: "rgba(255, 250, 245, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "2px solid rgba(0, 0, 0, 0.08)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: "var(--z-header)",
        }}
      >
        <div
          class="max-w-7xl mx-auto px-4 sm:px-6 w-full"
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
          }}
        >
          {conversationData.value
            ? (
              // Conversation header - clean and slim
              <>
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => {
                      conversationData.value = null;
                      window.history.pushState({}, "", "/");
                    }}
                    class="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg hover:bg-black/5 transition-all"
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                    }}
                    title="Back to home"
                  >
                    <i
                      class="fa fa-arrow-left"
                      style={{
                        fontSize: "var(--small-size)",
                        color: "var(--color-text)",
                      }}
                    >
                    </i>
                  </button>
                  <h1
                    class="truncate"
                    style={{
                      fontSize: "var(--font-size-xl)",
                      fontWeight: "800",
                      color: "var(--color-text)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {conversationData.value.conversation.title}
                  </h1>
                </div>
                <div class="flex items-center gap-2">
                  {/* Audio Recorder - NEW! */}
                  <AudioRecorder
                    conversationId={conversationData.value.conversation.id ||
                      ""}
                  />

                  {/* Export button */}
                  <button
                    onClick={() => drawerOpen.value = !drawerOpen.value}
                    class="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-all"
                    style={{
                      background: "#1A1A1A",
                      color: "white",
                      fontSize: "var(--small-size)",
                      fontWeight: "600",
                      border: "none",
                    }}
                    aria-label="Export conversation"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#2C2C2C";
                      e.currentTarget.style.transform = "scale(1.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#1A1A1A";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                    title="Export"
                  >
                    <i class="fa fa-file-export" aria-hidden="true"></i>
                    <span class="hidden sm:inline">Export</span>
                  </button>

                  {/* Share button */}
                  <ShareButton />
                </div>
              </>
            )
            : (
              // Default header - app name and primary actions
              <>
                <a
                  href="/"
                  style={{
                    fontSize: "var(--font-size-xl)",
                    fontWeight: "800",
                    color: "var(--color-text)",
                    letterSpacing: "-0.03em",
                    flex: 1,
                    textDecoration: "none",
                    padding: "8px 12px",
                    borderRadius: "var(--border-radius-sm)",
                    transition: "all var(--transition-medium)",
                    display: "inline-block",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(var(--color-accent), 0.08)";
                    e.currentTarget.style.transform = "translateX(2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.transform = "translateX(0)";
                  }}
                >
                  ProMapper
                </a>
              </>
            )}
        </div>
      </header>

      {/* MarkdownMaker Drawer */}
      {conversationData.value && (
        <MarkdownMakerDrawer
          isOpen={drawerOpen.value}
          onClose={() => drawerOpen.value = false}
          transcript={transcript}
          conversationId={conversationData.value.conversation.id}
        />
      )}

      {/* Main Layout - No sidebar, centered content */}
      <div
        class="flex"
        style={{ minHeight: "calc(100vh - var(--header-height))" }}
      >
        {/* Mobile History Menu - Only show when NO data */}
        {!conversationData.value && <MobileHistoryMenu />}

        {/* Content Area - Full width, centered */}
        <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
          <div class="max-w-7xl mx-auto grid gap-4 sm:gap-6">
            {/* Hero Section - Only show when NO data */}
            {!conversationData.value && (
              <section class="mapper-stage">
                <div class="mapper-card" data-tilt>
                  <div class="mapper-card__inner">
                    <div class="mapper-hero-copy">
                      <div>
                        <div class="mapper-eyebrow">
                          Paste / record / upload
                        </div>
                        <h1 class="mapper-hero-title">
                          {heroLines.map((line, lineIndex) => (
                            <span
                              class="mapper-hero-line"
                              key={line}
                              style={{ animationDelay: `${lineIndex * 140}ms` }}
                            >
                              {line}
                            </span>
                          ))}
                        </h1>
                      </div>
                      <p class="mapper-hero-desc">
                        Drop in a thought, a meeting, a scene, or a weekly
                        check-in.
                      </p>
                      <div class="mapper-hero-tags" aria-label="Outputs">
                        {heroTags.map((tag, index) => (
                          <span
                            class="mapper-hero-tag"
                            key={tag}
                            data-tone={index}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p class="mapper-hero-caption">
                        A friendly project map you can keep adding to.
                      </p>
                    </div>
                    <div class="mapper-card__panel">
                      <UploadIsland />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Dashboard - Always rendered, shows its own empty state */}
            {conversationData.value && (
              <section style={{ paddingTop: "clamp(1rem, 3vh, 2rem)" }}>
                <DashboardIsland />
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
