# Firebase App Hosting for Pitchline

Pitchline is a Next.js App Router application with server-rendered pages, Firebase session cookies and Node.js API handlers. Use **Firebase App Hosting**, not a static-only Firebase Hosting export.

The repository is prepared for the Firebase project `pitchline-app`:

- Public Firebase Web SDK configuration is available during build and runtime through `apphosting.yaml`.
- Firebase Admin uses Application Default Credentials on App Hosting. Vercel can continue to use `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Cloud Run is initially capped at four instances, one CPU and 1 GiB memory, with scale-to-zero.
- SportsAPI Pro is optional. Its API key must be stored as a hosting secret; xG and odds features default to disabled.

## Backend rollout checklist

You indicated that an App Hosting backend has already been set up. In Firebase Console → App Hosting → your Pitchline backend, verify:

1. Connected repository: `okleochat/pitchline`.
2. Root directory: repository root (`/`).
3. Live branch: `main`, with automatic rollouts enabled.
4. The latest rollout's source commit matches the latest GitHub `main` commit and its status is successful.
5. The App Hosting runtime service identity has the minimum required Firebase Authentication and Firestore IAM permissions.
6. The App Hosting hostname is included in Firebase Authentication → Settings → Authorized domains.

If the backend has not yet completed its first rollout, create/finish it from the console. App Hosting requires the Blaze pay-as-you-go plan. Set a Google Cloud budget alert and review Cloud Run/Build quotas before exposing it to production traffic.

## SportsAPI Pro secret

In the App Hosting backend settings, add `SPORTS_APIPRO_API_KEY` as a **Secret** (not a plain committed value). Keep both feature flags false until coverage and payloads have been tested:

- `SPORTS_APIPRO_XG_ENABLED=false`
- `SPORTS_APIPRO_ODDS_ENABLED=false`

See [DATA_PROVIDERS.md](./DATA_PROVIDERS.md). Do not put the key in `apphosting.yaml`, source code, public runtime config or browser requests.

## Dual-host rollout strategy

Use Firebase App Hosting as the second production-capable origin while Vercel remains a fallback. Test the Firebase hostname independently:

- `/`, `/picks`, `/international`, `/methodology`, `/account`
- `/api/health`, `/api/board`, `/api/form`
- email/password and Google sign-in
- session-cookie creation, revocation verification and Pro lookup
- a test subscription record and Firestore rules

Keep the Vercel production hostname and authorized Firebase domain active until App Hosting passes these checks. Use a separate hostname for Firebase during validation; do not point the same custom hostname at two origins simultaneously.

## Cost and deployment limits

App Hosting is not a free, unlimited replacement for Vercel. It uses Cloud Build and Cloud Run on the Blaze plan; there are monthly no-cost quotas for some resources, and usage above those quotas is billed. Keep the maximum-instance cap, set budget alerts and monitor usage.

The Vercel Hobby plan limits deployments. Firebase App Hosting can deploy from the connected GitHub live branch without depending on Vercel's deployment quota. Keep GitHub Actions as the independent typecheck/test/build gate, and avoid unnecessary Vercel preview deploys while the Hobby limit is reached.
