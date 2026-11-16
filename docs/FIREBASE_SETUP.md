# Firebase setup for Pitchline

The Firebase Web App settings supplied for project `pitchline-app` have been added to the Vercel project for Production, Preview and Development. They are public browser configuration values and are not Firebase Admin credentials.

The remaining steps below must be completed in the Firebase Console before sign-in and Pro verification can work end-to-end.

## 1. Enable Authentication

1. Open Firebase Console and select project `pitchline-app`.
2. Go to Authentication → Sign-in method.
3. Enable Email/Password.
4. Enable Google and choose a support email.
5. Under Authentication → Settings → Authorized domains, add the deployed production custom domain and any preview hostnames you intend to use for sign-in.

## 2. Create Firestore and publish the rules

1. Create a Cloud Firestore database in production mode. Choose its region deliberately.
2. Publish the repository's `firestore.rules` using the Firebase CLI or Firebase Console → Firestore → Rules.
3. The rules let a signed-in user read/update only their own limited profile and saved analyses. Browser clients cannot read or write `subscriptions/{uid}`.

## 3. Add the server-only Admin credentials

Create a Firebase service account for the backend in Google Cloud IAM. Grant only the Firebase Authentication and Firestore permissions the server needs.

In Vercel → Project → Settings → Environment Variables, add:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — the full service-account JSON, stored as a sensitive/encrypted server-only variable.
- `FIREBASE_PROJECT_ID` — `pitchline-app` (optional override; the service account already contains the project ID).

Do not put the service-account JSON in GitHub, a `NEXT_PUBLIC_` variable, a browser bundle, or a chat message. After adding these settings, redeploy the application.

## 4. Session verification

The browser signs in with Firebase Auth, then exchanges its Firebase ID token for a five-day HTTP-only session cookie. Pitchline verifies that cookie on the server with revocation checking. The server also reads the subscription document to derive the Pro entitlement.

A missing service-account variable causes secure server-session creation to fail closed. Firebase web sign-in alone is not enough to activate server-protected Pro features.

## 5. Manual Pro testing (no payment processor)

For a test account, open Firestore and create/update the server-owned document:

`subscriptions/{FIREBASE_UID}`

Example fields:

```json
{
  "status": "active",
  "plan": "pro",
  "provider": "manual",
  "currentPeriodEnd": "<a future Firestore Timestamp>"
}
```

Set `currentPeriodEnd` as an actual Firestore Timestamp later than the current time, not a text string. The server grants Pro only when status is `active` or `trialing` and the period end is still in the future. The browser cannot set its own subscription status.

Payment processing, checkout and subscription webhooks remain intentionally disabled while testing. Change the record in Firestore Console or through trusted server-side admin code only.
