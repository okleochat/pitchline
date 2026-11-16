# Pitchline football data providers

## Initial provider choice: SportsAPI Pro

Pitchline now has a server-only SportsAPI Pro adapter for:

- Daily international fixtures from `/api/schedule/{YYYY-MM-DD}`, filtering senior national sides rather than club teams or youth national teams.
- Match shotmap xG and xGOT from `/api/match/{matchId}/shotmap`.
- All available match bookmaker markets from `/api/match/{matchId}/odds/all`.

The API key is read only from `SPORTS_APIPRO_API_KEY`. The browser never receives it. Start with the Free plan to validate real payloads and coverage; the provider currently lists 100 requests/day and 10 requests/minute on that tier. Schedule responses are paginated, and the current integration deliberately limits the number of pages fetched to control request consumption.

Important xG limitation: the shotmap returns xG only during live matches or after full-time, not before kick-off. The provider documents xG values on premium-tier competitions and says lower-tier competitions may return shots without xG. A match with incomplete shot xG is reported as unavailable, never converted to zero or inferred from goals. Therefore this integration is useful for post-match data collection and building features for *future* fixtures, not obtaining a pre-match xG for the fixture itself.

The API key is not yet configured in the repository, Vercel or App Hosting. After obtaining a key, add it to both hosts as a server-only secret named `SPORTS_APIPRO_API_KEY`. Keep these flags disabled until a live smoke test confirms endpoint payloads and expected competitions:

- `SPORTS_APIPRO_XG_ENABLED=false`
- `SPORTS_APIPRO_ODDS_ENABLED=false`

Once the feed is validated, enable each feature separately. Do not enable xG globally without a competition coverage matrix. Do not assume the free quota can support polling every match; use daily schedule caching, request only matches users open, and persist useful responses.

Official docs: [Football V2 schedule](https://docs.sportsapipro.com/api-reference/football-v2/global), [shotmap and xG](https://docs.sportsapipro.com/api-reference/football-v2/match), [odds](https://docs.sportsapipro.com/api-reference/football-v2/odds), [pricing](https://www.sportsapipro.com/pricing).

## Historical xG: StatsBomb Open Data

A separate pipeline downloads selected StatsBomb Open Data competition/season match events and aggregates shot-level `statsbomb_xg`. It derives each fixture's inputs only from the team's previous five completed matches, and excludes every match played on the fixture date.

This is the most defensible no-cost starting point for historical model validation, but it is not broad global coverage: StatsBomb publishes selected leagues and seasons. Small tournaments may have too little history to support a five-match rolling sample. The pipeline fails closed in that case. If you publish or distribute analysis based on the data, StatsBomb requires attribution and its logo.

Source: [Hudl StatsBomb Open Data](https://github.com/hudl/open-data).

## Other options considered

- **Sportmonks** is the stronger paid alternative to evaluate for broader structured coverage. Its xG add-on publishes xG and xGOT for covered fixtures; confirm the exact leagues, historic depth, live entitlement and quote before subscribing. Its website describes coverage as per covered fixture, not universal. [Sportmonks xG add-on](https://www.sportmonks.com/football-api/xg-data/).
- **BigBallsData** should not be treated as a free xG source without checking the precise plan entitlement. Its published tiers may reserve per-fixture xG for a paid tier; it is not the current integration target.
- **Footballdata.io** can be considered for a narrow EPL feed, but it is not selected as the source of truth until its xG coverage, historical backfill, request limits, terms and uptime are verified.
- **ESPN** remains the existing domestic fixture/standings and recent-form feed. A second provider will be used to fill capability gaps rather than replacing stable feeds without comparative testing.

## Odds handling

The SportsAPI Pro adapter returns the provider's raw match market payload behind an API route and short cache. It is not yet a normalized Pitchline odds table, nor does it capture a historical closing-price archive. Before using prices in model evaluation or value calculations, normalize bookmaker/provider/market/selection/line/decimal price/timestamp, record opening and closing snapshots where permitted, remove overround consistently and document the selected bookmaker universe.

Do not claim model ROI or compare forecast probabilities to odds until this pipeline is persisted and tested.

## Commercial status

No paid football-data contract, bookmaker integration agreement or payment processor is connected by this code alone. The SportsAPI Pro integration is an opt-in provider adapter awaiting a server-side API key and smoke test. Payment processing remains out of scope as requested; test Pro access is managed manually through Firestore as described in [PRO_TEST_ACCESS.md](./PRO_TEST_ACCESS.md).
