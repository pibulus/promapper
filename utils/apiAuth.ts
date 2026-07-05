import { requestAuthToken } from "@signals/authModal.ts";

let inFlightSession: Promise<void> | null = null;

export async function ensureApiSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (inFlightSession) {
    return inFlightSession;
  }

  inFlightSession = (async () => {
    let status: Response;
    try {
      status = await fetch("/api/auth", { method: "GET" });
    } catch {
      // Offline / server unreachable. Without this catch the rejection
      // surfaces as a misleading "Couldn't access microphone" downstream.
      throw new Error(
        "Can't reach the server — check your connection and try again.",
      );
    }
    // 204 = valid session, 501 = auth disabled (local dev) — both mean proceed.
    if (status.ok || status.status === 501) {
      return;
    }

    await promptForToken();
  })().finally(() => {
    inFlightSession = null;
  });

  return inFlightSession;
}

export async function logoutSession(): Promise<void> {
  if (typeof window === "undefined") return;
  await fetch("/api/auth", { method: "DELETE" });
}

async function promptForToken(): Promise<void> {
  if (typeof window === "undefined") return;

  const token = await requestAuthToken();
  if (!token) {
    throw new Error("API auth token is required to continue.");
  }

  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("Invalid API auth token");
  }
}
