import { requestAuthToken } from "@signals/authModal.ts";

let inFlightSession: Promise<void> | null = null;

export async function ensureApiSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (inFlightSession) {
    return inFlightSession;
  }

  inFlightSession = (async () => {
    const status = await fetch("/api/auth", { method: "GET" });
    if (status.ok) {
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
