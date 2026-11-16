# Production operations

## Health endpoint

Monitor `/api/health` with an external uptime checker. It returns non-secret status metadata for:

- Per-competition standings and fixture freshness, including snapshot fallback counts.
- Firebase public Web App configuration presence and server-side Admin secret presence.
- Sportmonks token presence and whether xG and bookmaker-odds add-ons are enabled by environment configuration.

The health endpoint does not prove that Firebase Authentication providers are enabled, Firestore exists, rules have been published, or credentials are valid. Verify those in the Firebase Console and by completing an end-to-end sign-in test.

## Vercel

The project uses Next.js, Node.js 22.x and the repository build command. SSO protection stays enabled for Preview deployments; production custom domains remain accessible to the intended users.

## Firebase

The public Firebase Web App configuration for `pitchline-app` is stored in Vercel. The service-account JSON remains a separate, sensitive server-only value. Follow [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) to enable email/password and Google, provision Firestore, publish rules and configure the Admin credential securely.

## Football data

ESPN continues to supply the competition board, national-team fixture calendar and recent goals form. Sportmonks is an optional additional provider for historical fixture xG and pre-match odds.

Set these Vercel environment variables only after provisioning the matching provider account and add-ons:

- `SPORTMONKS_API_TOKEN` — server-only secret.
- `SPORTMONKS_XG_ENABLED=true` — only when xG Data add-on access is active and the desired competitions are covered.
- `SPORTMONKS_ODDS_ENABLED=true` — only when the Odds add-on is active and the required bookmakers/markets are covered.

The API token is never exposed to the browser. Missing or unavailable xG values remain missing; Pitchline does not infer xG from goals. Provider coverage, bookmaker, market and update time should be checked for each competition before relying on an odds feed.

## Historical validation

The model lab accepts point-in-time prematch features. `features_as_of` must be earlier than kickoff. For raw completed fixture archives, use:

```bash
npm run prepare-backtest -- --input historical-fixtures.csv --output prematch-rates.csv --window 5
npm run backtest -- --input prematch-rates.csv --output report.json
```

The raw archive must include unique fixture/team IDs, kickoff, completed-at timestamp, goals and team names. The preparation step computes recency-weighted rates from the previous five completed matches only. If complete xG values from one source are present across the whole output set, it adds rolling xG/xGA; otherwise it exports a goals-only dataset. Matches without a full history window are omitted. Do not use current standings to reconstruct historical pre-match features.

Backtest scores measure probability calibration and ranking accuracy. They are not betting ROI, proof of profitability or a substitute for an out-of-sample live paper-trading period.
