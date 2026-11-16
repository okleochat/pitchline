# EA SPORTS FC 27 player ratings for Pitchline Pro

Pitchline uses **ESPN for the current team roster** and **EA SPORTS FC 27 for the player-quality attributes**. ESPN remains the source for fixtures, competitions and team identities. Pitchline does not request individual ESPN season-stat profiles for this feature.

The complete EA ratings download is synchronized by a local Python utility into private Firebase Firestore storage. The raw player database is not committed to this public GitHub repository and is not returned to the browser.

## What these ratings mean

EA publishes each player's base overall rating, position, six face attributes, detailed technical/physical/mental attributes, goalkeeper attributes and PlayStyles.

Pitchline derives four player-quality dimensions:

- Attack: finishing, positioning, shot power, shooting, pace and related attributes.
- Creativity: vision, passing, ball control, dribbling and crossing.
- Defence: defensive awareness, tackling, interceptions, strength and related attributes.
- Goalkeeping: diving, handling, positioning, reflexes and kicking.

Players are aggregated by their current ESPN roster positions. EA does not provide real-world appearances or minutes in this database, so Pitchline does not invent them or use them as weighting. The lower-rated half of the available roster informs the squad-depth index.

**EA base ratings are not live form, real-world match statistics, injury reports, confirmed lineups or matchday availability.** EA's ratings page reflects base Gold, Silver and Bronze Ultimate Team items and excludes other card types and live-form updates. EA club affiliations can also change after transfers. Pitchline therefore takes current roster membership from ESPN and uses EA only to assess player quality.

The Pro simulator applies player adjustments only when both ESPN rosters have at least 12 EA-matched players and at least 60% coverage. If either side misses that threshold, both teams retain neutral player multipliers.

## 1. Requirements

- Python 3.10 or newer.
- A network connection that can access EA's public ratings feed.
- A Google account with Firestore write permission in project `pitchline-app`.
- Google Cloud CLI for Application Default Credentials.

The download uses Python's standard library. Only Firestore upload requires an extra package:

```bash
python -m pip install -r scripts/requirements-ea-fc27.txt
```

## 2. Check EA access

Run a one-page probe before downloading the full database:

```bash
python scripts/sync_ea_fc27.py --probe-only
```

The collector calls the public paginated ratings feed requested by EA's own ratings page, with the page's observed feature/referrer headers. The full download checks the reported dataset size, deduplicates player IDs, validates player records and verifies the official FC 27 base ratings for Kylian Mbappé (91), Erling Haaland (91) and Lamine Yamal (90) before saving. These reference values are taken from [EA's FC 27 ratings page](https://www.ea.com/games/ea-sports-fc/ratings) and its [official top 27 announcement](https://www.ea.com/games/ea-sports-fc/fc-27/news/fc27-ratings-top-27).

EA's endpoint and headers are undocumented and can change. If EA returns HTTP 403/429, changes the response format, or the FC 27 validation fails, the script stops. It does not bypass authentication, CAPTCHAs, access controls or rate limits.

## 3. Download and upload

Authenticate Google Cloud Application Default Credentials:

```bash
gcloud auth application-default login
```

Your Google identity needs permission to write to Firestore in project `pitchline-app` (for example, the Cloud Datastore User role).

Run the sync:

```bash
python scripts/sync_ea_fc27.py --upload-firestore --project-id pitchline-app
```

The collector:

1. Downloads EA's paginated player records in batches of 100, with a pause between requests.
2. Normalizes EA IDs, names, club, league, nationality, positions, base ratings, detailed attributes and PlayStyles.
3. Stores both common names and full names as strict normalized match keys.
4. Deduplicates EA records by player ID and validates database completeness.
5. Saves a local normalized copy to `data/ea-fc27/players.json`.
6. Uploads men's player records into compact name-prefix documents in the private `ea_fc27_player_shards` Firestore collection.
7. Updates `ea_fc27_meta/current` with the database name, sync timestamp and player/shard counts.
8. Deletes stale documents from that dedicated name-shard collection after a successful current sync.

The local `data/ea-fc27/` folder is gitignored. Do not commit the dataset. Firestore stores only the normalized player fields needed for matching and simulation; no API credentials are stored.

To download a local copy without uploading:

```bash
python scripts/sync_ea_fc27.py
```

## 4. How Pro uses the data

For each simulation:

1. Pitchline uses the selected teams' existing ESPN team IDs and competition slugs to load their current rosters.
2. It normalizes roster-player names and reads only the relevant EA name-prefix shards from Firestore.
3. It joins players by exact normalized name keys. Position and nationality can disambiguate duplicate names; unresolved collisions are left unmatched rather than guessed.
4. It uses EA's detailed attributes to calculate attack, creativity, defence, goalkeeper and squad-depth inputs.
5. It applies the player multipliers only when both teams meet the 12-player / 60% coverage rule.

The ESPN roster is the source of who belongs to the selected team or national team. EA club labels are not used to decide current squad membership. For international fixtures, if ESPN does not provide a usable team roster, player adjustments remain neutral rather than treating all players of that nationality as available.

Raw EA player records stay server-side. The browser receives only aggregate team indices, matched-player coverage, the three highest-rated matched players and the EA database sync date.

## 5. Refresh and verify

A weekly refresh is a reasonable starting cadence. Run the same upload command again to update the EA ratings snapshot and its name shards. The Firestore documents include a sync timestamp so Pitchline can show which snapshot was used.

After the first upload:

1. Sign in to Pitchline with a Pro account.
2. Run a Pro simulation for a club fixture, starting with Racing Santander vs Real Sociedad.
3. Open **Player & squad intelligence**.
4. Confirm the source is **ESPN current rosters + EA SPORTS FC 27**.
5. Check each side's matched-player count, coverage, top-player names and database sync date.
6. Verify that adjustments are applied only when both sides meet the minimum threshold.

If a roster player is not matched, check the EA dataset for their exact common/full name. Add a name alias only when the identity is verified. Do not replace strict matching with unbounded fuzzy matching.

A passing test suite validates the ingestion and calculation logic, not live EA endpoint access or complete player coverage in every competition. Backtest the Pro simulator with and without EA player inputs before treating the new feature as a measured predictive improvement.
