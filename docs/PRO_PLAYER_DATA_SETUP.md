# Enabling Pro player and current-squad intelligence

Pitchline Pro uses SportAPI.ai as its player-data provider. It obtains current team squads and individual player match statistics through the provider's API. A free SportAPI.ai account and server-side API key are required.

## 1. Create and configure the API key

1. Create a free account at [SportAPI.ai](https://sportapi.ai/).
2. Open the API keys page in your account and create/copy an API key. The key begins with `sk_live_`.
3. Keep the key private. Do not commit it to GitHub, put it in a `NEXT_PUBLIC_*` variable, or paste it into browser code.
4. In the Firebase project `pitchline-app`, attach it to the App Hosting backend `pitchline` as the secret named `SPORTAPI_API_KEY`.

From the repository root, the Firebase CLI can create the secret:

```bash
firebase apphosting:secrets:set SPORTAPI_API_KEY --project pitchline-app
```

Follow the prompt to enter the key and add the secret reference to `apphosting.yaml`. Make sure the environment variable is available at runtime. Then grant the backend access (if the CLI did not do so automatically):

```bash
firebase apphosting:secrets:grantaccess SPORTAPI_API_KEY --backend pitchline --location europe-west4 --project pitchline-app
```

The resulting `apphosting.yaml` entry should be equivalent to:

```yaml
- variable: SPORTAPI_API_KEY
  secret: SPORTAPI_API_KEY
  availability:
    - RUNTIME
```

No API key is needed during the GitHub Actions build. Without the runtime secret, Pitchline safely leaves player multipliers neutral and explains that the provider key is not configured.

## 2. Provider endpoints and identity matching

The server-side adapter uses:

- Team and squad lookup: `GET /api/teams/slug/{slug}`
- Squad fallback: `GET /api/teams/{id}/squad`
- Player match statistics: `GET /api/players/stats?name={fullName}&team_id={teamId}&shirt_number={number}`

SportAPI.ai uses its own team and player identifiers, so Pitchline does not pass ESPN IDs to it. It derives likely team slugs from the selected Pitchline team name and uses a small alias map for common provider naming differences. A team that cannot be matched in SportAPI.ai remains on team-level inputs; the adapter does not guess a team ID or silently join by player name alone.

All requests use the `X-Api-Key` header from the server-only `SPORTAPI_API_KEY` secret.

## 3. How current-season player scores are built

SportAPI.ai's player-statistics lookup returns career totals and dated match rows, rather than a guaranteed season-filtered total. Pitchline **does not use career totals as current-season performance**. It filters match rows to the selected football season and aggregates the match-level values (appearances, minutes, goals, assists, shots, tackles, saves and any additional supported metrics) before calculating position-aware attack, creativity, defence and squad-depth indices.

For European leagues, the season window is 1 August through 31 July. For MLS, Brazil, Mexico and international competition contexts, Pitchline uses the calendar year. If the response has no dated match rows in the selected season, the player is treated as unrated.

Player-derived multipliers are applied only when **both** teams have at least 12 rated players and at least 60% roster-stat coverage. If either side falls below the threshold, both teams remain neutral and the Pro simulation continues with team-level inputs.

Coverage and the depth of player statistics differ by competition. A provider squad can be available while its player match records are incomplete. We therefore show real coverage and never invent missing values.

## 4. Caching, quotas and diagnostics

- Team squad snapshots: 12-hour shared Firestore cache.
- Player match logs: 8-hour shared Firestore cache.
- Empty or unavailable responses: 15-minute negative cache.
- Maximum 22 player profiles per team per cold-cache pass, balanced across positions.
- Maximum four player lookups in flight at once.
- Cached responses are shared through the existing `provider_api_cache` collection; raw responses and the API key remain server-side.
- Server logs include competition, squad size, rated-player count, season window and provider HTTP-status counts. They do not log the API key or raw player response.

SportAPI.ai currently advertises 2,000 free requests per day and 14,000 per month through 30 November 2026; from 1 December 2026, it advertises 1,000 per day and 7,000 per month. One cold matchup can require one team lookup per side plus up to 22 player-stat requests per side, so caching matters. Monitor your account's usage before running bulk simulations.

## 5. Use and data-quality restrictions

SportAPI.ai's published terms permit use of its data in your own websites, apps, analysis and products, but prohibit reselling or redistributing raw data as a competing feed. The provider also says that data may be delayed, incomplete or wrong and should not be the sole basis for decisions where errors can cause loss, including betting. Pitchline therefore uses these data as one input to its wider team-level simulation, preserves neutral fallbacks, and does not present provider statistics as verified truth.

The free tier and published coverage are not a promise that every Pitchline competition has complete player-level data. Before enabling production-wide player adjustments, compare returned squads and current-season match counts for representative clubs in each competition, especially Racing Santander and Real Sociedad.

## 6. Verify the integration

After adding the secret and completing the App Hosting rollout:

1. Sign in using a Pro account.
2. Run a Pro simulation for two teams with known squads.
3. Open **Player & squad intelligence** and confirm the source says **SportAPI.ai**.
4. Check that the squad counts, rated-player counts and indices are non-zero and plausible.
5. Repeat for other leagues and an international fixture. Missing data should leave multipliers neutral rather than stop the simulation.
6. If a team cannot be matched or player coverage is zero, inspect server logs for `[Pitchline SportAPI] Player-stat lookup` and its HTTP status counts.

A passing TypeScript build and unit test suite validates Pitchline's adapter logic, not SportAPI.ai's live coverage. Verify actual player records after the API key has been configured before treating player adjustments as active across all competitions.
