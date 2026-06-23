/**
 * Auth Modal Signal — Promise-based native-dialog replacement.
 *
 * Any module can call requestAuthToken() to show the auth modal and get a
 * token back as a Promise. AuthModalIsland watches this signal and renders
 * the Modal component when a request is pending.
 */

import { signal } from "@preact/signals";

interface AuthPromptState {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

export const authPromptSignal = signal<AuthPromptState | null>(null);

export function requestAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    authPromptSignal.value = { resolve, reject };
  });
}
