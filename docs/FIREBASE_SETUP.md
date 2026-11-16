# Firebase setup for Pitchline

Firebase integration is in the codebase, but no Firebase project has been connected or provisioned by this change. The app remains usable without Firebase configuration.

## 1. Create or select a Firebase project

1. Create a project or select the project you want Pitchline to use.
2. Add a Web App and copy its configuration values.
3. Enable Authentication → Sign-in method → Email/Password.
4. Enable Authentication → Sign-in method → Google and configure the support email.
5. Create a Cloud Firestore database in production mode.

## 2. Deploy Firestore rules

Deploy firestore.rules with the Firebase CLI, or paste its contents into Firestore → Rules and publish them. Users can access only their own profile and saved-analysis subcollection. Subscription documents are inaccessible to browser clients.

## 3. Configure environment variables

Set these in local .env.local and in the Vercel project's Environment Variables:

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- FIREBASE_SERVICE_ACCOUNT_JSON (server-only service-account JSON, stored as a secret)
- FIREBASE_PROJECT_ID (optional override)

Create a service account in Google Cloud IAM → Service Accounts and grant only the Firebase Authentication/Firestore permissions needed by the backend. Store its JSON in FIREBASE_SERVICE_ACCOUNT_JSON. Do not commit it, expose it in a NEXT_PUBLIC_ variable, or paste it into chat.

## 4. Sessions and Pro access

The browser signs in with Firebase Auth, then exchanges its ID token for a five-day, HTTP-only, same-site session cookie. The server verifies session cookies with revocation checking.

Pro status is derived server-side from subscriptions/{uid}. A document grants access only when status is active or trialing and currentPeriodEnd is a future Firestore timestamp. The browser cannot read or modify subscription records.

A payment provider/webhook still needs to be selected and connected before purchases, renewals, cancellations or refunds can update subscription records automatically. Until then, do not grant Pro by trusting a client-side flag.
