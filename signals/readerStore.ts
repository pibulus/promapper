/**
 * Reader store — a single global "open this content big" channel.
 *
 * Any card (transcript, summary, …) can open its content in a roomy fullscreen
 * reader by setting `reader.value`. A single ReaderModal, mounted once, renders
 * it. This keeps the dashboard grid tidy + equal-height (cards scroll inside a
 * cap) while still giving one-click comfortable reading of long content.
 */

import { signal } from "@preact/signals";

export interface ReaderContent {
  title: string;
  /** Pre-sanitized HTML (the cards already sanitize their content). */
  html: string;
  /** Optional mono font for transcript-style content. */
  mono?: boolean;
}

export const reader = signal<ReaderContent | null>(null);

export function openReader(content: ReaderContent): void {
  reader.value = content;
}

export function closeReader(): void {
  reader.value = null;
}
