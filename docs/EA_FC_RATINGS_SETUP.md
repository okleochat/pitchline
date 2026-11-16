# EA SPORTS FC 27 player ratings for Pitchline Pro

Pitchline uses **ESPN for the current team roster** and **EA SPORTS FC 27 for the player-quality attributes**. ESPN remains the source for fixtures, competitions and team identities. Pitchline does not request individual ESPN season-stat profiles for this feature.

The complete EA ratings download is synchronized automatically by GitHub Actions into private Firebase Firestore storage. The workflow runs weekly, runs again when the sync code changes on `main`, and can be started from the Actions tab with **Run workflow**. The raw player database is not committed to this public GitHub repository and is not returned to the browser.

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

## 1. One-time Google Cloud connection

GitHub Actions uses **Workload Identity Federation (OIDC)**. No service-account JSON key is created or stored in GitHub.

The one-time setup creates a narrowly scoped service account, allows only this repository's `main` branch to impersonate it, and grants Firestore data access in project `pitchline-app`.

Run the following once from an administrator workstation with the Google Cloud CLI authenticated and permission to manage IAM in `pitchline-app`:

```bash
PROJECT_ID="pitchline-app"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_NAME="pitchline-ea-ratings-sync"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="github-pitchline"
PROVIDER_ID="github-pitchline"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

gcloud iam service-accounts create "$SA_NAME" \
  --project "$PROJECT_ID" \
  --display-name="Pitchline EA FC ratings sync"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" --location="global" \
  --display-name="Pitchline GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="Pitchline repository main branch" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'okleochat/pitchline' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/okleochat/pitchline"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo "GCP_SERVICE_ACCOUNT=${SA_EMAIL}"
```

Before merging the automation PR or starting its first run, open **GitHub → Settings → Secrets and variables → Actions → Variables** and create these two repository variables using the exact values printed above. The workflow is triggered by the merge to `main`, so configure them first:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

These are resource identifiers, not private keys. Do not create a JSON service-account key or put credentials in the repository.

## 2. Automatic refresh behaviour

The workflow is defined in `.github/workflows/sync-ea-fc27.yml` and:

- Runs every Monday at 05:23 UTC.
- Runs after changes to the sync script, its dependency file or the workflow are pushed to `main`.
- Supports an optional manual run through **GitHub → Actions → Sync EA FC 27 player ratings → Run workflow**.
- Installs the Firestore client, runs the Python unit tests, downloads all EA pages, validates the FC 27 edition and publishes the verified database.

The workflow uses GitHub's short-lived OIDC identity; it does not need a long-lived Google credential stored in the repository. A failed EA request, stale-edition validation, incomplete download or Firestore verification does not switch Pitchline to a partial database.

## 3. Snapshot publishing and data safety

Each refresh uploads to a new versioned Firestore collection. It verifies the full set of shard documents and only then atomically updates `ea_fc27_meta/current.activeCollection`. Pitchline reads the active collection pointer, so the previous complete snapshot remains in use until the new one is ready.

After publication, the just-replaced snapshot is retained for one refresh cycle so app instances with a briefly cached pointer can continue reading it. On the following refresh, the older retired snapshot is cleaned up on a best-effort basis. A cleanup issue does not roll back or invalidate the newly published snapshot.

The normalized local copy is written to `data/ea-fc27/players.json` by the script but remains gitignored. Firestore stores only the compact player fields needed for matching and simulation; raw downloads and credentials are not committed.

For local development only, the optional utility can still be run manually:

```bash
python -m pip install -r scripts/requirements-ea-fc27.txt
python scripts/sync_ea_fc27.py --probe-only
python scripts/sync_ea_fc27.py --upload-firestore --project-id pitchline-app
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

The scheduled GitHub Actions workflow refreshes the EA ratings snapshot every week, and the Firestore metadata and player shards carry the same sync timestamp so Pitchline can show exactly which snapshot was used. No routine local command is required. For an early refresh, start **Sync EA FC 27 player ratings** from the GitHub Actions tab.

After the first upload:

1. Sign in to Pitchline with a Pro account.
2. Run a Pro simulation for a club fixture, starting with Racing Santander vs Real Sociedad.
3. Open **Player & squad intelligence**.
4. Confirm the source is **ESPN current rosters + EA SPORTS FC 27**.
5. Check each side's matched-player count, coverage, top-player names and database sync date.
6. Verify that adjustments are applied only when both sides meet the minimum threshold.

If a roster player is not matched, check the EA dataset for their exact common/full name. Add a name alias only when the identity is verified. Do not replace strict matching with unbounded fuzzy matching.

A passing test suite validates the ingestion and calculation logic, not live EA endpoint access or complete player coverage in every competition. Backtest the Pro simulator with and without EA player inputs before treating the new feature as a measured predictive improvement.
