import { FreshContext } from "$fresh/server.ts";
import { deleteCookie, getCookies, setCookie } from "$std/http/cookie.ts";
import {
  createSession,
  deleteSession,
  validateSession,
} from "@services/authSessions.ts";

const COOKIE_NAME = "cm_session";
const authToken = Deno.env.get("API_AUTH_TOKEN")?.trim() ?? null;
const secureCookie =
  (Deno.env.get("API_COOKIE_SECURE") ?? "").toLowerCase() === "true";
const cookieMaxAge = Number(Deno.env.get("API_SESSION_TTL_MS") ?? "14400000") /
  1000;

export const handler = async (req: Request, _ctx: FreshContext) => {
  if (!authToken) {
    return new Response(JSON.stringify({ error: "Auth disabled" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    return await handleStatus(req);
  }

  if (req.method === "POST") {
    return await handleLogin(req);
  }

  if (req.method === "DELETE") {
    return await handleLogout(req);
  }

  return new Response("Method not allowed", { status: 405 });
};

async function handleStatus(req: Request) {
  const cookies = getCookies(req.headers);
  if (await validateSession(cookies[COOKIE_NAME])) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 401 });
}

async function handleLogin(req: Request) {
  let payload: { token?: string } = {};
  try {
    payload = await req.json();
  } catch {
    // ignore
  }

  if (!payload.token || payload.token.trim() !== authToken) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = await createSession();
  const headers = new Headers({ "Content-Type": "application/json" });
  setCookie(headers, {
    name: COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "Strict",
    secure: secureCookie,
    path: "/",
    maxAge: Math.floor(cookieMaxAge),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
}

async function handleLogout(req: Request) {
  const cookies = getCookies(req.headers);
  deleteSession(cookies[COOKIE_NAME]);
  const headers = new Headers();
  deleteCookie(headers, COOKIE_NAME, { path: "/" });
  return new Response(null, { status: 204, headers });
}
