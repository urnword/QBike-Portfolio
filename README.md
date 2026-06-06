<div align="center">
  <img src="./assets/qbike_portfolio_banner.png" alt="QBike — Smart Bike Booking System" width="100%" />
</div>

<div align="center">

[![Live App](https://img.shields.io/badge/Live%20App-qbike--kmj.web.app-1B3392?style=for-the-badge&logo=firebase)](https://qbike-kmj.web.app)
[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-nd/4.0/)
[![Next.js](https://img.shields.io/badge/Next.js%2016-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)

**QBike** is a mobile-first bicycle reservation and fleet management progressive web app (PWA)  
built for [Kolej Matrikulasi Johor (KMJ)](https://kmj.matrik.edu.my/), serving **3,000+ students**.

</div>

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [The Journey: KMJ Pinjam → QBike](#-the-journey-kmj-pinjam--qbike)
- [System Overview](#-system-overview)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Key Engineering Details](#-key-engineering-details)
- [User Roles & Access Control](#-user-roles--access-control)
- [Impact & Survey Results](#-impact--survey-results)
- [License](#-license)

---

## 🚨 The Problem

KMJ's bicycle lending service was entirely paper-based — informal sign-out logbooks, a keyholder-dependent store, and zero digital infrastructure. Students would walk across the entire campus field only to find the store closed or all bikes already taken. There was no way to check availability, no advance booking, no damage accountability, and no administrative oversight.

Five core failures drove this project:

| Problem Area | Impact |
|---|---|
| **No availability visibility** | Students made unnecessary trips with no way to check if bikes were available |
| **Paper logbook integrity** | Records were falsifiable, incomplete, and physically losable |
| **Zero damage accountability** | No mechanism to attribute damage to a specific user |
| **Resource monopolization** | First-come-first-served enabled the same individuals to dominate bikes daily |
| **Reactive maintenance** | Faults were discovered by the next rider, not reported proactively |

In a pre-deployment student survey, **100% of respondents rated the existing system 1/5** across every dimension including reliability, fairness, checkout efficiency, and damage reporting.

---

## 🔄 The Journey: KMJ Pinjam → QBike

QBike was not built from scratch. It evolved from a working prototype called **KMJ Pinjam**, deployed in a controlled pilot with selected practicum students to validate the concept before committing to a full rollout.

### KMJ Pinjam — Prototype Findings

Testing revealed four critical limitations that directly shaped QBike's design:

1. **Administrator dependency** — Students had to present a booking QR code for a physical admin to scan. Any admin absence halted all operations.
2. **No individual bike tracking** — Bikes had no unique identifiers, making damage attribution and maintenance logging impossible.
3. **Generic UI** — Interface was reported as difficult to navigate and visually dull.
4. **No advance or class bookings** — Only on-demand booking was supported, limiting utility in an academic environment.

### QBike — How Each Was Solved

| KMJ Pinjam Limitation | QBike Solution |
|---|---|
| Admin scans student's QR | **Student scans the bike's QR** — eliminates admin dependency entirely |
| No bike identifiers | Each bike has a unique ID, enabling full trip history and damage attribution |
| Generic interface | Complete UI redesign driven by student feedback |
| On-demand only | Future reservations + class booking mode for lecturers |

---

## 🧩 System Overview

QBike delivers six integrated modules covering the full lifecycle of bike lending:

- **Live Fleet Dashboard** — Real-time bike availability (available / in-use / maintenance), updated live across all sessions
- **Digital Booking Engine** — On-demand pickup, advance personal reservations, and bulk class bookings for staff
- **QR + GPS Collection & Return** — Students scan the bike's QR at the station; GPS geofencing ensures physical presence
- **Accountability & Damage Tracking** — Every bike has a full loan history; condition is reported on every return
- **Admin Console** — Fleet management, user verification, policy configuration, analytics, and audit log
- **Automated Guardrails** — Pickup grace period auto-cancellation, late return cooldowns, cancellation cooldowns — all zero-touch

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript strict mode) |
| Styling | Tailwind CSS v4 (CSS-first, `@theme` in globals.css — no config file) |
| UI Components | shadcn/ui |
| Forms | react-hook-form + zod (inline validation) |
| QR Scanning | qr-scanner (camera-native, no external SDK) |
| Charts | Recharts |
| Client Firebase | firebase v12 — Client SDK |
| Server Firebase | firebase-admin v13 — Admin SDK (server-only) |
| Cloud Functions | Firebase Functions v2, Node 22 |
| Scheduling | Cloud Tasks (grace periods, cooldowns, late return detection) |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Email | Brevo (SMTP transactional) |
| PWA | @ducanh2912/next-pwa |
| Hosting | Firebase App Hosting (`asia-southeast1`) |

---

## 🏗️ Architecture

QBike operates on a fully serverless, cloud-native architecture. No institution-managed servers are required.

```
┌─────────────────────────────────────────────────────┐
│                     Student / Admin                  │
│              Mobile Browser / Installed PWA          │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────┐
│          Next.js 16 — Firebase App Hosting           │
│   ┌─────────────────┐   ┌────────────────────────┐  │
│   │   src/proxy.ts  │   │  App Router (Pages)    │  │
│   │  Edge Routing   │   │  Student + Admin UI    │  │
│   │  Session Auth   │   │  Server Actions        │  │
│   └────────┬────────┘   └────────────┬───────────┘  │
└────────────┼────────────────────────┼───────────────┘
             │                        │
   ┌─────────▼────────────────────────▼─────────────┐
   │              Firebase Services                  │
   │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
   │  │   Auth   │ │Firestore │ │Cloud Functions │  │
   │  │  OAuth   │ │Real-time │ │  (Serverless)  │  │
   │  │ Sessions │ │    DB    │ │  Transactions  │  │
   │  └──────────┘ └──────────┘ └────────────────┘  │
   │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
   │  │ Storage  │ │   FCM    │ │  Cloud Tasks   │  │
   │  │  Photos  │ │  Push    │ │  Schedulers    │  │
   │  └──────────┘ └──────────┘ └────────────────┘  │
   └─────────────────────────────────────────────────┘
```

---

## ⚙️ Key Engineering Details

### 1. Atomic Booking Transactions

All inventory mutations run inside `runTransaction()` — it is physically impossible for two users to book the same bike simultaneously, even under high concurrent load.

```typescript
// functions/src/booking/createOnDemandBooking.ts
export const createOnDemandBooking = onCall(async (request) => {
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const inventoryRef = db.doc("inventory/current");
    const inventory = (await tx.get(inventoryRef)).data() as InventorySingleton;

    // Reject immediately — never go negative
    if (!inventory || inventory.available <= 0) {
      throw new HttpsError("failed-precondition", "No bikes currently available.");
    }

    // Atomically decrement inventory and create booking record
    tx.update(inventoryRef, {
      available: FieldValue.increment(-1),
      bookedInAdvance: FieldValue.increment(1),
    });

    const bookingRef = db.collection("bookings").doc();
    tx.set(bookingRef, {
      bookingId: bookingRef.id,
      userId: request.auth!.uid,
      userFullName: request.data.userFullName, // Denormalized — intentional
      userMatrixNo: request.data.userMatrixNo, // Denormalized — intentional
      status: "pending",
      startTime: Timestamp.now(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { bookingId: bookingRef.id };
  });
});
```

### 2. Three-Layer Security Enforcement

Access control is enforced independently at three technical boundaries. Bypassing one layer does not bypass the others.

```
Layer 1: src/proxy.ts (Edge)
  → Validates __session cookie on every request before the app loads
  → Redirects by role: admin routes, onboarding gates, email verification

Layer 2: firestore.rules (Database)
  → Enforces data-level ACLs regardless of how the request arrived
  → Users can only read their own documents; admin role verified against DB

Layer 3: Cloud Functions (Backend Logic)
  → Re-verifies auth + role server-side before any state-changing operation
  → The only layer that can mutate /inventory/current or /bikes/{bikeId}
```

```typescript
// src/proxy.ts — Edge routing (runs before every page load)
export async function proxy(request: NextRequest) {
  const isPrefetch = request.headers.get('purpose') === 'prefetch';
  if (isPrefetch) return NextResponse.next(); // Skip — avoids Auth read spikes

  const __sessionVal = request.cookies.get('__session')?.value;
  const { token, role, profileComplete } = parseSession(__sessionVal);

  const decodedClaims = await getAuth().verifySessionCookie(token, true);
  const emailVerified = decodedClaims?.email_verified ?? false;

  // Unauthenticated → /auth
  if (!decodedClaims && !pathname.startsWith('/auth'))
    return NextResponse.redirect(new URL('/auth', request.url));

  // Non-admin hitting /admin/* → /dashboard
  if (pathname.startsWith('/admin') && role !== 'admin')
    return NextResponse.redirect(new URL('/dashboard', request.url));

  return NextResponse.next();
}
```

```javascript
// firestore.rules — Database-level enforcement
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/users/$(request.auth.uid))
               .data.role == "admin";
    }

    match /bookings/{bookingId} {
      // Users can only read their own bookings
      allow read: if resource.data.userId == request.auth.uid || isAdmin();
      allow write: if false; // Cloud Functions only — never direct client writes
    }

    match /inventory/current {
      allow read: if request.auth != null;
      allow write: if false; // runTransaction() in Cloud Functions only
    }
  }
}
```

### 3. Policy-Driven Configuration

Every operational value — grace periods, cooldown durations, GPS radius, operating hours — is stored in a single Firestore document `/policy/current`. Nothing is hardcoded. Administrators change behaviour in real time without any redeployment.

```typescript
// src/lib/hooks/usePolicy.ts
export function usePolicy() {
  const [policy, setPolicy] = useState<PolicySingleton | null>(null);

  useEffect(() => {
    // Real-time listener — policy changes propagate instantly to all active sessions
    const unsub = onSnapshot(doc(db, "policy", "current"), (snap) => {
      setPolicy(snap.data() as PolicySingleton);
    });
    return unsub;
  }, []);

  return policy;
}
```

### 4. Cloud Task Grace Period Enforcement

When a booking is created, a Cloud Task is scheduled to fire at `startTime + pickupGracePeriod`. If the student hasn't collected their bike by then, the task auto-cancels the booking and restores inventory — no admin action required.

```typescript
// Scheduled at booking creation time → fires at startTime + grace period
export const handlePickupGracePeriod = onTaskDispatched(async (req) => {
  const { bookingId } = req.data;
  const db = getFirestore();

  await db.runTransaction(async (tx) => {
    const bookingRef = db.doc(`bookings/${bookingId}`);
    const booking = (await tx.get(bookingRef)).data() as BookingDocument;

    // Only cancel if still in 'pending' state (not yet collected)
    if (booking.status !== "pending") return;

    tx.update(bookingRef, { status: "cancelled", cancelledBy: "system" });
    tx.update(db.doc("inventory/current"), {
      available: FieldValue.increment(1),
      bookedInAdvance: FieldValue.increment(-1),
    });
  });
});
```

---

## 👥 User Roles & Access Control

| Feature | Student | Staff | Admin |
|---|:---:|:---:|:---:|
| On-demand & advance bookings | ✅ | ✅ | ✅ |
| Class bookings (bulk for groups) | ❌ | ✅ | ✅ |
| QR bike collection & return | ✅ | ✅ | ✅ |
| View personal history & stats | ✅ | ✅ | ✅ |
| Global fleet dashboard | ❌ | ❌ | ✅ |
| Manage inventory & bike status | ❌ | ❌ | ✅ |
| Configure policy (hours, GPS, cooldowns) | ❌ | ❌ | ✅ |
| User verification & whitelisting | ❌ | ❌ | ✅ |
| Manual user block / unblock | ❌ | ❌ | ✅ |
| Practicum group management | ❌ | ✅ | ✅ |
| Resolve incident reports | ❌ | ❌ | ✅ |
| Audit action log | ❌ | ❌ | ✅ |

---

## 📊 Impact & Survey Results

Feedback was collected across three phases: the existing manual system, the KMJ Pinjam prototype, and QBike. Participants rated 13 operational dimensions on a scale of 1–5.

### Overall Satisfaction

| Phase | Rating |
|---|---|
| Manual System | 90% rated **1/5** · 10% rated 2/5 · No score above 2 |
| KMJ Pinjam | 40% rated **5/5** · 40% rated 4/5 · 20% rated 3/5 |
| **QBike** | **83.3% rated 5/5** · 16.7% rated 4/5 · No score below 4 |

### Key Dimension Improvements

| Dimension | Manual | KMJ Pinjam | QBike |
|---|:---:|:---:|:---:|
| Store availability visibility | 1/5 | 5/5 | 5/5 |
| Advance booking capability | 1/5 | 3/5 | **5/5** |
| Checkout speed & efficiency | 1/5 | 3–4/5 | **5/5** |
| Damage accountability | 1/5 | 2–3/5 | **4–5/5** |
| First-time user accessibility | 1/5 | — | **5/5** |

### Student Feedback (QBike)

> *"No admin, no problem. Process is so smooth now. I can literally get a bike in under 30 seconds. This is what we needed from the start."*

> *"Paling suka sebab setiap basikal ada ID sendiri. Kalau saya dapat basikal yang tayar pancit, saya just report dalam app dan tukar basikal lain. Tak ada la saya kena tanggung kerosakan orang lain buat."*

> *"The UI overhaul is the best part. It looks and feels like a professional consumer app now."*

> *"Suka gila sebab tak payah tunggu admin buka store baru boleh scan. Asalkan store open, kita boleh self-service. Ni baru la betul-betul digital!"*

---

## 🔗 Live Application

**[https://qbike-kmj.web.app](https://qbike-kmj.web.app)**

> Access is restricted to verified `@moe-dl.edu.my` institutional email accounts.

---

## 📄 License

This repository is licensed under **CC BY-NC-ND 4.0** (Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International).

[![License: CC BY-NC-ND 4.0](https://licensebuttons.net/l/by-nc-nd/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

**You may:** view and share this repository for evaluation, academic referencing, or technical review with attribution.  
**You may not:** use the code commercially, modify it, or build upon it.

This repository contains **selected code snippets for portfolio review only**. It does not contain the full application source code. The complete codebase is maintained in a private repository.

© 2026 Zaid Izzuddin. All rights reserved.
