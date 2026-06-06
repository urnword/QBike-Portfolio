import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { initializeApp, getApps } from 'firebase-admin/app';

// Edge-compatible init
if (!getApps().length) {
  initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'qbike-app',
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieStore = request.cookies;

  const __sessionVal = cookieStore.get('__session')?.value;
  let sessionToken = '';
  let userRole = 'student';
  let profileComplete = false;

  if (__sessionVal) {
    try {
      // Decode base64 JSON payload from __session cookie
      const str = atob(__sessionVal);
      const parsed = JSON.parse(str);
      sessionToken = parsed.token || '';
      userRole = parsed.role || 'student';
      profileComplete = parsed.profileComplete === true;
    } catch (e) {
      // Fallback if the cookie is just the raw token (legacy/local development)
      sessionToken = __sessionVal;
    }
  }

  let isAuthenticated = false;
  let emailVerified = false;

  // 0. Skip prefetch requests to avoid massive read spikes from Next.js Link prefetching
  const isPrefetch = request.headers.get('x-middleware-prefetch') === '1' || request.headers.get('purpose') === 'prefetch';
  if (isPrefetch) return NextResponse.next();

  if (sessionToken) {
    try {
      const decodedClaims = await getAuth().verifySessionCookie(sessionToken, true);
      isAuthenticated = true;
      emailVerified = decodedClaims.email_verified || false;

      console.log(`[Proxy] Path: ${pathname}, Role: ${userRole}, Complete: ${profileComplete}`);
    } catch (error) {
      console.error('[Proxy] Session verification failed:', error);
      isAuthenticated = false;
    }
  }

  // 1. Skip redirects for Server Actions to avoid "Unexpected response" error.
  // Actions handle their own auth/redirect logic internally.
  const isAction = request.headers.has('next-action');
  if (isAction) return NextResponse.next();

  // Root redirect
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  // 1. If not authenticated, only allow /auth
  if (!isAuthenticated && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  if (isAuthenticated) {
    // 2. Auth routing based on verification and onboarding status
    if (pathname === '/auth') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (pathname.startsWith('/auth/verify-email')) {
      if (emailVerified) {
        return NextResponse.redirect(new URL(profileComplete ? '/dashboard' : '/onboarding', request.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith('/onboarding')) {
      if (!emailVerified) return NextResponse.redirect(new URL('/auth/verify-email', request.url));
      if (profileComplete) return NextResponse.redirect(new URL('/dashboard', request.url));
      return NextResponse.next();
    }

    // App routes require both email verification and completed profile
    if (!emailVerified) return NextResponse.redirect(new URL('/auth/verify-email', request.url));
    if (!profileComplete) return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // 3. Admin protection
  if (pathname.startsWith('/admin') && userRole !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 4. Staff protection for class booking
  if (pathname.startsWith('/book/class') && userRole !== 'staff' && userRole !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|manifest\\.webmanifest|sw\\.js|workbox-.*\\.js|icon-.*\\.png|__).*)',
  ],
};
