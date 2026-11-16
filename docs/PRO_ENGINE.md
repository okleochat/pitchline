# Pitchline Pro Simulation Engine

## Engine selector

Pro subscribers receive the **Pro Engine** by default. They can switch to the existing Classic Monte Carlo simulator at any time. The selected mode is saved locally per browser. Free accounts only use the Classic simulator.

The Pro calculation is executed by `POST /api/pro/simulate`. The route calls `requireProUser()` before accepting simulation inputs, so hiding the engine selector is not the access-control boundary.

## Version 1: Phase of Play

The Pro engine simulates a match as a sequence of possessions. Each possession moves through build-up, progression, chance creation and finishing. The phase probabilities respond to team attacking and defending rates, match state, late-game urgency and a fatigue/substitution curve.

The model returns the same core markets and score samples as the Classic simulator, together with possession, shot, on-target, build-up and progression summaries.

This is a different simulation structure, not a claim of proven predictive superiority. Until historical out-of-sample testing demonstrates an improvement, it should be described as an experimental Pro model.

## Player and lineup intelligence milestone

The Pro endpoint can optionally enrich a selected upcoming fixture with API-Football starting lineups and player-season statistics.

- Fixture lookup uses the ISO kickoff timestamp carried from ESPN's live fixture board, then matches the home/away sides against API-Football's upcoming schedule.
- The connector retrieves each side's lineup, plus season player stats. Team and player responses are cached in Firestore's private `provider_api_cache` collection and locally per instance.
- Player metrics are converted server-side into position-aware attack, creativity, defensive and goalkeeper indices. Only aggregate Pitchline indices, lineup coverage counts and the resulting multipliers are returned to the browser. Raw API payloads, player-level statistics and the API key are not returned to clients.
- Player adjustments are applied only when both teams have at least seven rated starters and at least 60% starting-XI coverage. Otherwise neither side receives a lineup adjustment; the model falls back to the team-level Pro simulation.
- The provider's lineup feed can be unavailable before kick-off or unsupported for a particular competition. When unavailable, Pitchline explicitly reports that it is using team-level inputs.
- API-Football's free plan advertises 100 requests per day. Firestore caching is shared between App Hosting instances, but request use still needs monitoring.

### Legal and configuration gate

The connector is disabled unless both environment settings exist:

- `API_FOOTBALL_KEY`: store as a Firebase App Hosting Secret Manager secret. Never place it in client-side configuration, source code or chat.
- `API_FOOTBALL_DATA_USE_ALLOWED=true`: set only after receiving confirmation that the intended Pitchline Pro use is permitted and any necessary competition/rights-holder authorisations are in place.

API-Football's published terms allow developers to build applications with its feed but say it does not grant a licence to publish the data in an application. The terms also warn that third-party rights may apply and that betting-related use may require additional permissions. The flag is therefore an explicit release gate, not a way to override those terms. See [API-Football terms](https://www.api-football.com/terms), [pricing](https://www.api-football.com/pricing) and [documentation](https://www.api-football.com/documentation-v3).

For the exact Firebase setup and test steps, see [PRO_PLAYER_DATA_SETUP.md](./PRO_PLAYER_DATA_SETUP.md).

## EA SPORTS FC ratings

EA FC player ratings are not integrated. EA's public ratings page is not a commercial data licence, and its terms restrict extracting or redistributing EA content without authorisation. Pitchline derives its own indices from permitted football performance data instead.

## Validation before marketing claims

Backtest the player-aware Pro engine against the team-level Pro engine and the Classic simulator on the same historical fixture set. Split chronologically into development and held-out periods. Compare 1X2, BTTS and totals using Brier score, log loss and calibration. Keep lineup effects only where they improve out-of-sample forecasts. Do not claim EA-equivalent performance or betting profitability from simulation volume alone.
