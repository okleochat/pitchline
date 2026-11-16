# Enabling Pro player and registered-squad intelligence

The API-Football connector enriches Pro simulations using each team's current registered squad and player-season performance. It does **not** wait for a fixture-specific starting XI or formation.

## 1. API-Football key

1. Open [API-Football](https://www.api-football.com/).
2. Create an account and activate a plan that includes the required player endpoints.
3. Keep the API key private. Do not send it in a chat, issue, log, or source file, and never put it in a `NEXT_PUBLIC_*` variable. Rotate it immediately if it has been exposed.

The published Free plan currently lists 100 requests per day. This is enough for controlled testing, but national-team squad lookups can consume multiple requests on the first run because Pitchline looks up individual player-season records. Results are cached for 18 hours (player statistics) or seven days (team mappings and squad snapshots).

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

The repository intentionally does not hard-code the secret. Keep the key in Secret Manager and grant the `pitchline` App Hosting backend permission to read it.

## 4. How the player-data lookup works

- API-Football `/players/squads?team={teamId}` supplies the team's current registered squad.
- Club teams use `/players?team={teamId}&season={season}&page={page}` for the club's season player statistics. A second page is requested only when page one is full.
- National teams use `/players?id={playerId}&season={season}` for each registered squad member so the model can use the player's club-season performance rather than a small national-team appearance sample.
- No fixture ID, kickoff timestamp, fixture lineup, starting XI or formation is required.
- The browser receives only aggregate indices and coverage counts. Individual provider records and the API key remain server-side.

The API-Football squads endpoint is a current-squad snapshot, not a historical archive of competition registration. A future tournament prediction can use the roster currently returned by the provider; Pitchline cannot claim it is the official tournament squad until the provider's snapshot reflects the announced roster.

## 5. Verify the integration

Use a Pro account, choose any two teams in the Pro simulator, and run the simulation. An upcoming fixture does not need to be selected.

- The panel should show **Player & squad intelligence**.
- Each side should show the number of registered squad members with usable season-stat records.
- Attack, creativity, defence and squad-depth indices are calculated by Pitchline.
- Player adjustments are applied only when both teams have at least eight rated players and at least 30% coverage.
- If either team has insufficient coverage, the simulation still runs, but both teams' player-derived multipliers remain neutral.

## 6. Request quota and caching

API-Football's published Free plan lists 100 requests per day. Team mapping is cached for seven days, registered-squad snapshots for 24 hours, and player statistics for 18 hours in the private Firestore `provider_api_cache` collection, with a local in-memory cache on each App Hosting instance.

For club teams, Pitchline requests one or two team-season statistics pages. For national teams, it requests the player-season record for each member of the current squad, with a concurrency limit of four. The first analysis of two national teams can therefore use a significant fraction of the free daily quota. Pitchline caps outgoing calls at six per App Hosting instance per minute; if more player records are needed, the Pro panel automatically resumes the lookup after a short interval. Repeating the same analysis reuses cached data. Monitor API-Football usage during initial testing.
