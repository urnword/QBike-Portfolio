import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/refresh-profile
 * Re-reads the user document and refreshes the profileComplete cookie.
 * Called on the onboarding page mount to recover users who already
 * completed onboarding but have a stale (false) profileComplete cookie.
 */
export async function GET() {
  const cookieStore = await cookies();
  const __sessionVal = cookieStore.get("__session")?.value;

  if (!__sessionVal) {
    return NextResponse.json({ profileComplete: false });
  }

  let token = "";
  let role = "student";
  try {
    const parsed = JSON.parse(Buffer.from(__sessionVal, "base64").toString("utf-8"));
    token = parsed.token || "";
    role = parsed.role || "student";
  } catch (e) {
    token = __sessionVal;
  }

  if (!token) {
    return NextResponse.json({ profileComplete: false });
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(token, true);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

    const profileComplete = userDoc.exists
      ? userDoc.data()?.profileComplete === true
      : false;

    const maxAge = 60 * 60 * 24 * 5;
    const payload = {
      token,
      role,
      profileComplete,
    };
    const serialized = Buffer.from(JSON.stringify(payload)).toString("base64");
    
    cookieStore.set("__session", serialized, {
      maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Fallback legacy cookie
    cookieStore.set("profileComplete", profileComplete ? "true" : "false", {
      maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({ profileComplete });
  } catch {
    return NextResponse.json({ profileComplete: false });
  }
}
