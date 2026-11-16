# Production operations

## Health endpoint

Monitor `/api/health` from an external uptime checker. It returns only non-secret status metadata:

- `status`: `ok`, `partial` or `degraded` based on the competition board feed.
- `board`: per-competition live standings/fixture counts, snapshot fallback count and oldest feed age.
- `firebase`: booleans indicating whether the public web configuration and server-only Admin service-account variable are present.

HTTP 503 means every competition has fallen back to the saved board snapshot. HTTP 200 with `partial` means at least one competition is using saved standings or fixtures. This endpoint does not prove that Firebase providers are enabled, Firestore exists, rules are deployed, or credentials are valid; verify those in the Firebase Console and by completing an end-to-end sign-in test.

## Vercel

The Vercel project should use the Next.js framework, Node.js 22.x and the repository build/install commands. Keep SSO protection enabled for Preview deployments. Production custom domains should be accessible to intended users.

## Firebase

Follow [FIREBASE_SETUP.md](./FIREBASE_SETUP.md). Do not add service-account JSON to GitHub. Configure it only as a server-only Vercel secret. Do not expose subscription documents to browser clients.

## Model/data limitations

ESPN remains the fixture/standings/recent-results feed. It does not provide the source-attributed xG/xGA feed required for an xG model. A bookmaker odds source and payment processor/webhook are not included. Historical backtests must use timestamped pre-match features; do not derive past features from current standings.
