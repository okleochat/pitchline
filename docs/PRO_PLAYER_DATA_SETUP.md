# Enabling Pro player and current-squad intelligence

Pitchline Pro uses ESPN for current-roster and player-season intelligence. It reuses the same ESPN team identities and competition slugs already used by the live board. **No API key or additional Firebase secret is required.**

## 1. Data sources

The server-side adapter uses these ESPN soccer endpoints:

- Current team roster: `/apis/site/v2/sports/soccer/{league}/teams/{teamId}/roster?limit=500`
- Player season statistics: `/apis/common/v3/sports/soccer/{league}/athletes/{athleteId}/stats?season={year}`
- Where a competition does not expose the dedicated stats response, the adapter also checks the athlete overview endpoint.

The ESPN team ID and competition slug come from Pitchline's existing live board. Pro does not perform a name-only team search and does not need a selected fixture, kickoff time, matchday starting XI or formation.

ESPN coverage can differ by competition and endpoint. A roster can be available while a player's season statistics are not. Pitchline therefore marks only players for whom it receives usable performance data; it does not invent missing statistics or treat missing values as zero.

## 2. How Pitchline builds its indices

1. Load the selected teams' current ESPN roster snapshots.
2. Join identifiable roster members to available player-season statistics by ESPN athlete ID.
3. Derive position-aware attack, creativity, defence and squad-depth scores from the returned season metrics.
4. Apply player-derived multipliers only when **both** teams have at least 12 rated players and at least 60% roster-stat coverage.
5. If either side falls below the coverage threshold, keep both teams' player multipliers neutral. The Pro simulation still runs using team-level inputs.

For national-team fixtures, Pitchline first uses any current-club competition identity exposed in the roster data. If ESPN does not expose that identity, it falls back to the national-team competition feed. In that case, the available performance sample may reflect international competition rather than a player's domestic club season.

The current-roster endpoint is a current snapshot. Pitchline does not label it as an officially registered tournament squad unless the ESPN roster itself represents that competition's official list.

## 3. Caching and request controls

- Current rosters: 12-hour shared Firestore cache.
- Player-season statistics: 8-hour shared Firestore cache.
- Empty / unavailable lookups: 15-minute negative cache.
- Maximum 22 player profiles per team per cold-cache pass, balanced across positions.
- Maximum six profile lookups in flight at once.
- Raw player payloads remain server-side; the browser receives only team-level indices and coverage counts.

Repeated simulations reuse the shared `provider_api_cache` collection, with an instance-local memory cache as a fast path. A cache miss for one player does not block the rest of the roster from being evaluated.

## 4. Permission and production operation

The project owner has confirmed that ESPN provided written permission for the intended use during the research phase. Keep that correspondence with the company's data-provider and rights records, and retain any scope, attribution, territory, or product restrictions stated in that email.

The ESPN player-data adapter runs server-side and uses Pitchline's existing ESPN transport. No ESPN credentials are placed in browser code or committed to the repository.

## 5. Verify the integration

After the App Hosting rollout completes:

1. Sign in with a Pro account.
2. Select two teams and run the Pro simulation; no fixture needs to be selected.
3. Open **Player & squad intelligence** and check the source label, coverage counts, and derived indices.
4. Test both club and international matches. Coverage can legitimately vary by competition and by roster availability.
5. Confirm that low-coverage or unavailable player feeds leave the simulation running with neutral player multipliers.

A successful TypeScript build does not by itself prove that every ESPN competition has live player coverage. Verify representative teams in each competition and monitor the panel's coverage counts before describing the feature as universal.
