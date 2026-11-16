# Firebase setup for Pitchline

The Firebase Web App configuration supplied for the Pitchline project is included in the App Hosting build/runtime configuration. The App Hosting environment also sets APP_BASE_URL to the public hosted.app origin so the server can validate same-origin session requests behind Firebase's reverse proxy. These public Web SDK values identify the Firebase web app; they are not a substitute for server credentials or proof that Authentication and Firestore are enabled.

## Authentication and authorized domains

In Firebase Console → Authentication → Sign-in method:

1. Enable **Email/Password**.
2. Enable **Google** and select a support email.
3. Add the Firebase App Hosting hostname and the Vercel production hostname under Authentication → Settings → Authorized domains. Add preview domains only when you actually use them.

The repository contains email/password and Google sign-in flows. Provider enablement remains a Firebase Console setting and must be verified with a real sign-in on each host.

## Firestore and security rules

Create a Cloud Firestore database if one does not already exist. Then publish the repository's firestore.rules:

    firebase use pitchline-app
    firebase deploy --only firestore:rules

Review the Firebase CLI project selection before running the command. The rules allow a signed-in user to manage only their own profile and saved analyses. Browser clients are explicitly denied access to subscriptions/{uid}; server-side Firebase Admin access is required for subscriptions.

Firebase Auth and Firestore are separate services. Pitchline now keeps a verified sign-in active even if Firestore profile storage or subscription reads are temporarily unavailable. In that case, the user remains signed in with Free access until the Firestore entitlement can be read.

## International fixtures

The International page uses the same ESPN soccer Site API transport as the club match desk. It reads dedicated national-team competition scoreboards for AFCON and its qualifiers, UEFA Nations League, FIFA World Cup, regional World Cup qualifiers, the European Championship, Copa América, Gold Cup, Asian Cup and selected major women's tournaments.

International fixture discovery does **not** require a SportsAPI Pro key. The competition catalogue is maintained in `src/lib/international/competitions.ts`; fixture requests are date-scoped, server-side and cached briefly to limit traffic.

## Optional SportsAPI Pro match data

SportsAPI Pro is separate from the core fixtures feed and is used only for optional match-level xG and pre-match bookmaker odds endpoints.

In Firebase Console → App Hosting → backend **pitchline** → **Settings** → **Environment variables and secrets**:

1. Add `SPORTS_APIPRO_API_KEY` as a **Secret**, not a plain client-side variable. Make it available to the runtime only.
2. Set `SPORTS_APIPRO_XG_ENABLED` to `true` when the xG package/coverage is active.
3. Set `SPORTS_APIPRO_ODDS_ENABLED` to `true` when the odds package is active.
4. Save the backend configuration and allow App Hosting to create a new rollout.

The provider key must never be added to `NEXT_PUBLIC_*`, committed, or placed in browser code. A key stored in Vercel does not automatically transfer into Firebase App Hosting.

## Server credentials by hosting platform

**Firebase App Hosting:** the runtime can use Google Application Default Credentials (ADC) from its attached service identity. Grant that identity only the Firebase Authentication and Firestore permissions required by the app. No downloaded service-account private key is required for this host.

**Vercel:** add FIREBASE_SERVICE_ACCOUNT_JSON as an encrypted server-only environment variable, plus FIREBASE_PROJECT_ID=pitchline-app. Do not prefix the service-account variable with NEXT_PUBLIC_, commit it, or paste it into chat.

The Admin SDK uses ADC on Firebase App Hosting when no JSON service account is configured, and retains service-account JSON support for Vercel.

## Session and Pro access

The browser signs in through Firebase Auth and exchanges its ID token for a five-day, HTTP-only, same-site server session cookie. The server verifies the cookie with revocation checking.

Pro access is evaluated server-side from subscriptions/{uid}. The record must contain all of:

- plan: "pro"
- status: "active" (or "trialing")
- currentPeriodEnd: a Firestore Timestamp in the future

See PRO_TEST_ACCESS.md for the manual test-account procedure. Payment processing is intentionally not connected yet; renewals, cancellations and refunds are not automated.
