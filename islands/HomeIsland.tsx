/**
 * Home Island - Main Layout with Conditional Visibility
 *
 * Shows upload panel + sidebar when NO data
 * Shows only dashboard when data exists
 */

import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  canUndo,
  conversationData,
  undoLastMutation,
} from "@signals/conversationStore.ts";
import {
  getActiveConversationId,
  loadConversation,
} from "../core/storage/localStorage.ts";
import { showToast } from "@utils/toast.ts";
import UploadIsland from "./UploadIsland.tsx";
import DashboardIsland from "./DashboardIsland.tsx";
import MobileHistoryMenu from "./MobileHistoryMenu.tsx";
import ShareButton from "./ShareButton.tsx";
import GoLiveButton from "./GoLiveButton.tsx";
import MarkdownMakerDrawer from "./MarkdownMakerDrawer.tsx";
import AudioRecorder from "./AudioRecorder.tsx";
import ThemeSwitcher from "./ThemeSwitcher.tsx";
import SoundToggle from "./SoundToggle.tsx";
import AuthModalIsland from "./AuthModalIsland.tsx";

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

  // Cmd/Ctrl+Z → undo the last destructive map/action-item mutation. Skipped
  // while typing in a field so native text-undo still works there.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey &&
        e.key.toLowerCase() === "z";
      if (!isUndo) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) {
        return;
      }
      if (!canUndo()) return;
      e.preventDefault();
      if (undoLastMutation()) showToast("Undone", "info");
    }
    globalThis.addEventListener("keydown", onKeydown);
    return () => globalThis.removeEventListener("keydown", onKeydown);
  }, []);

  // Get transcript for MarkdownMaker
  const transcript = conversationData.value?.transcript?.text || "";

  const heroLines = ["See what you're", "really saying"];

  return (
    <div class="mapper-scene min-h-screen">
      {/* Top Bar - Brand presence */}
      <header
        class="app-header-glass"
        style={{
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
            // Nudge contents down a touch so they read as optically centered
            // BELOW the warm rainbow band that bleeds through the top edge.
            paddingTop: "3px",
          }}
        >
          {conversationData.value
            ? (
              // Conversation header — wordmark (= home) · project title · actions.
              <>
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  {/* ProMapper stays for branding; clicking it returns home. */}
                  <a
                    href="/"
                    class="app-header__brand"
                    data-tip="Back to home"
                    aria-label="ProMapper — back to home"
                    onClick={(e) => {
                      e.preventDefault();
                      conversationData.value = null;
                      window.history.pushState({}, "", "/");
                    }}
                  >
                    ProMapper<span class="app-header__brand-dot">.</span>
                  </a>
                  <span class="app-header__divider" aria-hidden="true"></span>
                  <h1 class="app-header__title">
                    {conversationData.value.conversation.title}
                  </h1>
                </div>
                <div class="app-header__actions">
                  {/* Audio Recorder */}
                  <AudioRecorder
                    conversationId={conversationData.value.conversation.id ||
                      ""}
                  />

                  {/* Export — icon only */}
                  <button
                    onClick={() => drawerOpen.value = !drawerOpen.value}
                    class="header-icon-btn"
                    data-tip="Export"
                    aria-label="Export conversation"
                  >
                    <i class="fa fa-file-export" aria-hidden="true"></i>
                  </button>

                  {/* Go Live + Share + sound mute */}
                  <GoLiveButton />
                  <ShareButton />
                  <SoundToggle />
                </div>
              </>
            )
            : (
              // Default header — wordmark + quiet actions.
              <>
                <a href="/" class="app-header__brand flex-1">
                  ProMapper<span class="app-header__brand-dot">.</span>
                </a>
                <div class="app-header__actions">
                  <ThemeSwitcher />
                </div>
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
        <main class="app-scroll flex-1 overflow-y-auto px-4 pb-12 pt-4 sm:px-6 lg:px-8">
          <div class="max-w-7xl mx-auto grid gap-4 sm:gap-6">
            {/* Hero Section - Only show when NO data */}
            {!conversationData.value && (
              <section class="mapper-stage">
                <div class="mapper-card" data-tilt>
                  <div class="mapper-card__inner">
                    <div class="mapper-hero-copy">
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
                      <p class="mapper-hero-desc">
                        Drop in a thought, a meeting, a scene, or a weekly
                        check-in.
                      </p>
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

      {/* Auth modal — triggered by requestAuthToken() from anywhere */}
      <AuthModalIsland />
    </div>
  );
}
