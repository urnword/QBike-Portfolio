"use server";

import { cookies } from "next/headers";
import { verifySessionCookie } from "@/lib/firebase/admin";

const COOKIE_OPTS = (maxAgeSec: number) => ({
  maxAge: maxAgeSec,
  expires: new Date(Date.now() + maxAgeSec * 1000),
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/**
 * Syncs userRole and profileComplete cookies to httpOnly server-side values.
 *
 * Previously, AuthProvider wrote these via document.cookie (non-httpOnly),
 * meaning any client-side JavaScript could read and forge them. Now they are
 * always set server-side and inaccessible to JavaScript.
 *
 * Only succeeds if the session cookie is valid; silently returns otherwise
 * to avoid leaking authentication state to the client.
 */
export async function syncSessionCookies(
  role: string,
  profileComplete: boolean,
): Promise<void> {
  const cookieStore = await cookies();
  const __sessionVal = cookieStore.get("__session")?.value;
  if (!__sessionVal) return;

  let token = "";
  try {
    const parsed = JSON.parse(Buffer.from(__sessionVal, "base64").toString("utf-8"));
    token = parsed.token || "";
  } catch (e) {
    token = __sessionVal;
  }

  if (!token) return;

  // Validate the session before trusting any values from the client.
  const decoded = await verifySessionCookie(token).catch(() => null);
  if (!decoded) return;

  const expiresInSec = 60 * 60 * 24 * 5; // 5 days, matching session lifetime
  const payload = {
    token,
    role,
    profileComplete,
  };
  const serialized = Buffer.from(JSON.stringify(payload)).toString("base64");
  cookieStore.set("__session", serialized, COOKIE_OPTS(expiresInSec));

  // Fallbacks for local / legacy usage
  cookieStore.set("userRole", role, COOKIE_OPTS(expiresInSec));
  cookieStore.set(
    "profileComplete",
    profileComplete ? "true" : "false",
    COOKIE_OPTS(expiresInSec),
  );
}
