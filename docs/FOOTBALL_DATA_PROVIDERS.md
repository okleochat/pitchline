# Football data provider evaluation

This note records provider options evaluated for Pitchline. Marketing claims are not treated as proof of usable xG coverage: before any feed is enabled, test a real token against representative target competitions and retain the returned source, timestamp, competition and metric coverage.

## Recommended low-cost evaluation order

### 1. StatsBomb Open Data — historical benchmark

StatsBomb publishes JSON competition/season, match, event and lineup data for selected competitions. Its event specification includes `statsbomb_xg` on every shot. This makes it useful for an independent historical xG benchmark and model-validation subset, but it is not a current-season, all-league live feed. Attribute StatsBomb when publishing analysis based on the dataset.

- Repository: https://github.com/statsbomb/open-data
- Event specification: https://raw.githubusercontent.com/statsbomb/open-data/master/doc/StatsBomb%20Open%20Data%20Specification%20v1.1.pdf

### 2. Big Balls Sports Data — first live/free-tier pilot candidate

The pricing page advertises 1,000 requests/day on Free (2,000/day with GitHub connected), with current and most-recent season data. Its soccer API advertises stored match stats including xG. However, its OpenAPI contract marks the direct `/v1/matches/{id}/statistics` team-stat endpoint as Pro-only, and its changelog says the `expected_goals` field on that route is Solo+. The separate `/v1/stored/matches/{id}/stats` route is DB-backed; its field-level plan and xG coverage need to be confirmed with a real Free-key payload. Do not assume every league has xG.

- Pricing: https://bigballsdata.com/pricing
- Soccer coverage: https://bigballsdata.com/soccer-api
- OpenAPI contract: https://bigballsdata.com/openapi.json
- xG coverage notes: https://bigballsdata.com/docs/xg

### 3. SportsAPIPro — second live pilot candidate

Its published Free plan offers 100 requests/day (10/minute) for one month, with claims of all competitions/endpoints. The football catalogue advertises 6,400+ competitions, player match/season xG and team/competition statistics, but explicitly says advanced metric coverage depends on the competition. The documented player-match endpoints may require several requests to reconstruct team totals, so verify whether a match-level team xG response exists before adopting it for a high-volume team-form pipeline.

- Pricing: https://www.sportsapipro.com/pricing
- Football API: https://www.sportsapipro.com/football-stats-api

### 4. Sportmonks — established alternative, not a zero-cost major-league feed

The Free Football API currently covers Danish Superliga and Scottish Premiership. Major European leagues require a paid-plan trial or subscription, and xG is a separate xG Data add-on. The existing Pitchline adapter is optional and remains inactive until a server-only token and the corresponding plan add-ons are available.

- Free plan: https://www.sportmonks.com/football-api/free-plan/
- xG and add-ons: https://www.sportmonks.com/football-api/xg-data/
- League coverage: https://www.sportmonks.com/football-api/

### 5. Footballdata.io — EPL-only trial candidate

Its public material advertises Premier League coverage and xG, but plan pages/FAQs distinguish basic Free-plan access from advanced match statistics and predictions. Published Free limits are 1,000 requests/month across five leagues; xG and historical advanced stats should be confirmed in a real Free-key response before treating it as a free xG provider.

- Premier League API: https://footballdata.io/premier-league-api/
- Plans: https://footballdata.io/help/what-plans-and-pricing-options-do-you-offer

## Integration acceptance criteria

Before enabling any provider in production:

1. Confirm exact team-level xG and xGA values for a sample of completed matches in target leagues, plus provider/model identifier and a trustworthy fetched/updated timestamp.
2. Confirm each team can be joined to our canonical team identity and each metric to the correct home/away side.
3. Confirm coverage across all previous 5/10 completed matches; missing values remain missing and must not be replaced with goals or zeros.
4. Confirm competition-by-competition history depth, freshness, rate limits, commercial-use rights and redistribution restrictions.
5. Store immutable provider payload snapshots with fixture IDs and observation timestamps for leakage-safe backtests.
6. Use a second independent cohort (e.g. StatsBomb Open Data) to benchmark calibration where coverage overlaps.

## Decision

Start with StatsBomb for historical model-quality checks and run a controlled Big Balls Free-key pilot against the target leagues. If the required match xG field is not available on Free, compare the actual response with SportsAPIPro's 100-request/day trial and the paid tier price before choosing. Keep Sportmonks as a supported adapter, not the default budget assumption.

No provider should be described as connected until a real production-safe token has been configured and live payload coverage has been verified.
