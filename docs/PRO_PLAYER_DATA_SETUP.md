# Enabling Pro player and lineup intelligence

The code for the API-Football connector is included, but the integration is deliberately disabled by default. Do not enable it until the intended commercial use, display of data-derived results, and any league/federation rights have been confirmed.

## 1. Create a free API-Football key

1. Open [API-Football](https://www.api-football.com/).
2. Create an account and activate the Free plan.
3. Copy the API key from the dashboard.
4. Keep the key private. Do not send it in a chat, commit it to GitHub, or put it in a `NEXT_PUBLIC_*` variable. Rotate the key immediately if it has been pasted into a chat, issue, log, or source file.

The published Free plan currently lists 100 requests per day and includes player and lineup endpoints. It is suitable for a small-scale integration smoke test, not unlimited production traffic.

## 2. Confirm rights before enabling data use

API-Football's [terms](https://www.api-football.com/terms) say its data can be used to build applications, but also state that API-Football does not itself grant a licence to publish the data in applications. They place responsibility for necessary competition/federation permissions on the developer and warn that betting-related uses may need additional rights.

Before using this in the paid Pitchline Pro product, obtain written confirmation from API-Football for the intended use and assess any required competition or rights-holder permissions.

## 3. Configure Firebase App Hosting

In Firebase Console:

1. Open **App Hosting** and select the `pitchline` backend.
2. Open backend settings / environment variables.
3. Add `API_FOOTBALL_KEY` as a **Secret**, not a plain-text variable. Attach the Secret Manager secret to the runtime.
4. Only after the permissions described above are confirmed, add the runtime variable `API_FOOTBALL_DATA_USE_ALLOWED` with value `true`.
5. Trigger a new App Hosting rollout.

Alternatively, from an authenticated local checkout, run:

```bash
firebase apphosting:secrets:set API_FOOTBALL_KEY --project pitchline-app
```

Follow the prompts to enter the rotated key and grant the requested Secret Manager permissions. The CLI can add the secret reference to `apphosting.yaml` for the backend. Confirm that the runtime binding is named `API_FOOTBALL_KEY` and is attached to the `pitchline` App Hosting backend. See the [official App Hosting secret configuration guide](https://firebase.google.com/docs/app-hosting/configure) for the current console and CLI flow.

The repository intentionally does not reference a secret that may not yet exist, so simply merging this code will not break deployments that have not configured the key.

Do not configure the permission flag to true merely because an API key exists. Without both settings, Pitchline will continue to run the Pro team-level simulation and display why player data is unavailable.

## 4. Verify the integration

Use a Pro account and select a live upcoming fixture whose teams are covered by API-Football.

- Before the provider publishes lineups, Pitchline should show **Lineups not published yet**.
- Once lineups are available, Pitchline should show the number of starters with usable season stats for each side.
- Player adjustments should be applied only when both teams have at least seven rated starters and at least 60% starting-XI coverage.
- If either side has insufficient coverage, neither side should be adjusted.
- The UI displays Pitchline-derived team indices and the adjustment size; raw player records and the provider API key are never sent to the browser.

## 5. Request quota and caching

API-Football's published Free plan is 100 requests/day. The connector caches team mapping for seven days, player season pages for 18 hours, team fixture lists for 20 minutes and lineups for 10 minutes. Those cached responses are shared across Firebase App Hosting instances in the private Firestore `provider_api_cache` collection, with local per-instance caching on top.

The collection is server-only: the existing Firestore rules deny client access and the Admin SDK is used from server code. Monitor API-Football usage in its dashboard during the initial test period. A low free-tier quota means we should not poll lineups continuously or trigger refreshes for every market calculation.
