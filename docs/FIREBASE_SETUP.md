# Firebase setup for Pitchline

The Firebase Web App configuration supplied for `pitchline-app` is now included in the App Hosting build/runtime configuration and is configured in the connected Vercel project. These public Web SDK values identify the Firebase web app; they are not a substitute for server credentials or proof that Authentication and Firestore are enabled.

## Authentication and authorized domains

In Firebase Console → Authentication → Sign-in method:

1. Enable **Email/Password**.
2. Enable **Google** and select a support email.
3. Add the Firebase App Hosting hostname and the Vercel production hostname under Authentication → Settings → Authorized domains. Add preview domains only when you actually use them.

The repository contains email/password and Google sign-in flows. Provider enablement remains a Firebase Console setting and must be verified with a real sign-in on each host.

## Firestore and security rules

Create a Cloud Firestore database if one does not already exist. Then publish the repository's `firestore.rules`:

```bash
firebase use pitchline-app
firebase deploy --only firestore:rules
```

Review the Firebase CLI project selection before running the command. The rules allow a signed-in user to manage only their own profile and saved analyses. Browser clients are explicitly denied access to `subscriptions/{uid}`; server-side Firebase Admin access is required for subscriptions.

## Server credentials by hosting platform

**Firebase App Hosting:** the runtime can use Google Application Default Credentials (ADC) from its attached service identity. Grant that identity only the Firebase Authentication and Firestore permissions required by the app. No downloaded service-account private key is required for this host.

**Vercel:** add `FIREBASE_SERVICE_ACCOUNT_JSON` as an encrypted server-only environment variable, plus `FIREBASE_PROJECT_ID=pitchline-app`. Do not prefix the service-account variable with `NEXT_PUBLIC_`, commit it, or paste it into chat.

The Admin SDK now uses ADC when no JSON service account is configured, and retains service-account JSON support for Vercel.

## Session and Pro access

The browser signs in through Firebase Auth and exchanges its ID token for a five-day, HTTP-only, same-site server session cookie. The server verifies the cookie with revocation checking.

Pro access is evaluated server-side from `subscriptions/{uid}`. The record must contain all of:

- `plan: "pro"`
- `status: "active"` (or `"trialing"`)
- `currentPeriodEnd`: a Firestore Timestamp in the future

See [PRO_TEST_ACCESS.md](./PRO_TEST_ACCESS.md) for the manual test-account procedure. Payment processing is intentionally not connected yet; renewals, cancellations and refunds are not automated.
