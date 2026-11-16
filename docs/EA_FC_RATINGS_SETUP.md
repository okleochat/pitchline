# EA SPORTS FC 27 player ratings for Pitchline Pro

Pitchline Pro uses EA SPORTS FC 27's public base-player ratings as its player-quality input. ESPN remains the source for Pitchline's fixtures, competition and team context. SportAPI.ai is no longer used.

The EA dataset is synchronized by a local Python utility and stored privately in the Firebase project's Firestore database. The scraped player database is deliberately excluded from this public GitHub repository.

## What the data does — and does not — mean

EA provides an overall rating, position, six face attributes, detailed technical/physical/mental attributes, goalkeeper attributes and PlayStyles. Pitchline uses the detailed attributes when available and falls back to the six face attributes/overall rating when needed.

The current model derives four separate player contributions:

- Attack: finishing, positioning, shot power, shooting, pace and related attributes.
- Creativity: vision, passing, ball control, dribbling and crossing.
- Defence: defensive awareness, tackling, interceptions, strength and related attributes.
- Goalkeeping: diving, handling, positioning, reflexes and kicking.

Players are aggregated by position into club-level attack, creativity, defence and depth indices. Every player receives equal availability weight because EA ratings do not contain real-world appearances or minutes. The lower-rated half of the club's EA player pool informs the depth index.

**These are EA base player-quality ratings, not live form, real-world player statistics, injuries, confirmed matchday squads or starting lineups.** EA says its ratings page reflects base Gold, Silver and Bronze Ultimate Team items and does not include other card types or live-form updates. Club affiliations can change after real-world transfers. Do not interpret Pitchline's derived indices as an EA simulation or official prediction.

The Pro simulator applies player adjustments only when both clubs have at least 12 usable players and at least 60% player-record coverage. If either club is missing or has insufficient records, the simulator leaves both teams' player multipliers neutral.

## 1. Requirements

- Python 3.10 or newer.
- A network connection that can access EA's public ratings page API.
- A Google account with permission to write to the \`pitchline-app\` Firestore database.
- Google Cloud CLI for Application Default Credentials if you want to upload from your own computer.

The download step uses Python's standard library. Only the optional Firestore upload requires the extra package.

Install the optional dependency from the repository root:

\`\`\`bash
python -m pip install -r scripts/requirements-ea-fc27.txt
\`\`\`

## 2. Probe the EA endpoint

Before downloading all pages, run a single-page check:

\`\`\`bash
python scripts/sync_ea_fc27.py --probe-only
\`\`\`

The collector uses the public ratings endpoint requested by EA's ratings page, with that page's observed feature/referrer headers. It checks that EA reports a plausible full database. The full sync additionally checks for a known FC 27 top-rated player before it writes the output, so an older or incomplete feed is not silently accepted.

The endpoint and its headers are undocumented and may change. If EA returns HTTP 403/429, the page format changes, or the FC 27 validation fails, the script stops and explains the error. It does not attempt to bypass authentication, CAPTCHAs, access controls or rate limits.

## 3. Download and upload the database

Authenticate Google Cloud's Application Default Credentials:

\`\`\`bash
gcloud auth application-default login
\`\`\`

Your Google identity needs Firestore write access in project \`pitchline-app\` (for example, the Cloud Datastore User role).

Then run:

\`\`\`bash
python scripts/sync_ea_fc27.py --upload-firestore --project-id pitchline-app
\`\`\`

The collector:

1. Downloads the paginated EA FC 27 dataset in batches of 100, with a pause between requests.
2. Normalizes EA player IDs, names, club affiliations, positions, base ratings, detailed attributes and PlayStyles.
3. Deduplicates by EA's player ID and checks that the dataset is substantially complete.
4. Saves a local normalized copy to \`data/ea-fc27/players.json\`.
5. Uploads men's club player pools to the \`ea_fc27_teams\` Firestore collection, one compact document per club.
6. Updates \`ea_fc27_meta/current\` with the database name, sync timestamp, team count and player count.
7. Deletes stale club documents from that dedicated collection so old affiliations do not linger.

The local \`data/ea-fc27/\` folder is gitignored and must not be committed. The Firestore collection contains the club's EA player records required by Pitchline; raw HTTP page responses and API credentials are not stored there.

To download only a local copy without uploading, run:

\`\`\`bash
python scripts/sync_ea_fc27.py
\`\`\`

## 4. How Pitchline uses the database

The server-side adapter reads the two club documents from Firestore and calculates the indices. It caches each club lookup in the running server process for six hours. Raw EA player records are not returned to the browser; the Pro response contains only the club-level indices, coverage and three highest-rated player summaries.

The data is not treated as an XI. No assumption is made about who will start, who is injured or who is available for the fixture. For international matches, club rosters must not be substituted for national-team call-ups; those fixtures currently retain neutral player adjustments unless a valid national-team dataset is added later.

## 5. Refreshing and checking

Run the same upload command periodically (weekly is a reasonable starting cadence) to refresh EA club affiliations and player ratings. EA's public page notes that player-club affiliations may change and that database updates can alter player details.

After the first successful upload:

1. Open Pitchline while signed in as a Pro user.
2. Run a Pro simulation for a covered club fixture, starting with Racing Santander vs Real Sociedad.
3. Open **Player & squad intelligence**.
4. Confirm the source says **EA SPORTS FC 27**, the team coverage is non-zero, the top-three player summaries look correct and the database sync date is recent.
5. Confirm the player adjustments are applied only when both clubs meet the coverage threshold.

If a team is not found, check the exact EA club label and add a justified alias in \`src/lib/providers/ea-fc-ratings.server.ts\`. Do not fuzzy-join players or clubs without validation.

A successful download/upload and passing unit tests validate the ingestion and calculations; they do not establish that EA's database is complete for every Pitchline competition. Backtest the Pro model with and without EA inputs before treating the adjustments as predictive improvements.
