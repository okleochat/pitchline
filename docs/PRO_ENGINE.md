# Pitchline Pro Simulation Engine

## Engine selector

Pro subscribers receive the **Pro Engine** by default. They can switch to the existing Classic Monte Carlo simulator at any time. The selected mode is saved locally per browser. Free accounts only use the Classic simulator.

The Pro calculation is executed by `POST /api/pro/simulate`. The route calls `requireProUser()` before accepting simulation inputs, so hiding the engine selector is not the access-control boundary.

## Version 1: Phase of Play

The Pro engine simulates a match as a sequence of possessions. Each possession moves through build-up, progression, chance creation and finishing. The phase probabilities respond to team attacking and defending rates, match state, late-game urgency and a fatigue curve.

The model returns the same core markets and score samples as the Classic simulator, together with possession, shot, on-target, build-up and progression summaries.

This is a different simulation structure, not a claim of proven predictive superiority. Until historical out-of-sample testing demonstrates an improvement, it should be described as an experimental Pro model.

## Player and current-squad intelligence

The Pro endpoint enriches a team-vs-team simulation with player performance from each team's **current squad**. It does not require a selected fixture, a kickoff timestamp, an announced starting XI or a predicted formation.

The data flow is:

1. Match each Pitchline team to its API-Football team ID.
2. Retrieve its current current squad from `/players/squads?team={teamId}`.
3. Join the squad's player IDs to season-performance records.
4. Derive position-aware attack, creativity, defence and squad-depth indices.
5. Apply the player-derived factors only when both teams have adequate player-data coverage.

### Club teams

For club teams, Pitchline retrieves the current squad and the club's season player statistics using `/players?team={teamId}&season={season}&page={page}`. The API returns 20 player records per page. Pitchline checks a second page when the first page is full. If current-season coverage is too thin early in a season, it uses previous-season records only for players missing from the current-season results; current-season records take priority.

### National teams

For national teams, Pitchline retrieves the current squad and then requests each squad member's player-season record by player ID. This uses the player's club-season performance rather than relying on the small number of appearances they may have made for their national side.

These individual lookups are cached for 18 hours and run with limited concurrency. API requests are capped at six per App Hosting instance per minute and deferred player lookups resume automatically on a later refresh. Registered-squad snapshots are cached for 24 hours. They can consume a meaningful part of API-Football's 100-request free daily quota when a new international pairing is first analysed. Repeated simulations reuse the shared Firestore cache.

### How squad strength is estimated

- Player scores are derived from available season statistics: goals, assists, shooting, key passes, passing, tackling, interceptions, duels, dribbling, goalkeeper saves and provider season rating.
- Positions give the metrics different weights. Minutes played influence a player's contribution with diminishing returns, so a single high-minute player does not dominate the squad index.
- The lower-usage portion of the current squad contributes to the squad-depth index used in the late-match recovery curve. It is not a claim about who will be substituted or start.
- At least eight rated players and 30% squad coverage are required for a team's factors to be eligible. Factors are shrunk towards neutral in proportion to coverage.
- Both teams must pass the coverage threshold. If either side fails, neither team's player factors are applied; the Pro engine still runs using the existing team-level inputs.

The browser receives only aggregate Pitchline indices, coverage counts and bounded multipliers. Raw provider payloads, individual player records and the API key remain server-side.

### Squad-data limitation

API-Football documents `/players/squads` as returning a team's **current squad**, updated several times a week. It is not a historical archive of every squad officially registered for a past or future competition. For a future tournament, the model uses the national team's current API-Football squad snapshot at analysis time. If that snapshot has not yet been updated to the officially announced tournament squad, Pitchline cannot claim it is using that exact tournament roster. A future competition-specific squad override or a licensed historical registration feed would be needed for that.

The model uses available player-season data; it does not reproduce EA SPORTS FC player ratings and should not be described as an EA-equivalent simulation.

### Legal and configuration gate

The connector is disabled unless both environment settings exist:

- `API_FOOTBALL_KEY`: store as a Firebase App Hosting Secret Manager secret. Never place it in client-side configuration, source code or chat.
- `API_FOOTBALL_DATA_USE_ALLOWED=true`: set only after receiving confirmation that the intended Pitchline Pro use is permitted and any necessary competition/rights-holder authorisations are in place.

API-Football's published terms allow developers to build applications with its feed but say it does not grant a licence to publish the data in an application. The terms also warn that third-party rights may apply and that betting-related use may require additional permissions. The flag is therefore an explicit release gate, not a way to override those terms. See [API-Football terms](https://www.api-football.com/terms), [pricing](https://www.api-football.com/pricing) and [documentation](https://www.api-football.com/documentation-v3).

For Firebase setup and test steps, see [PRO_PLAYER_DATA_SETUP.md](./PRO_PLAYER_DATA_SETUP.md).

## EA SPORTS FC ratings

EA FC player ratings are not integrated. EA's public ratings page is not a commercial data licence, and its terms restrict extracting or redistributing EA content without authorisation. Pitchline derives its own indices from permitted football performance data instead.

## Validation before marketing claims

Backtest the squad-aware Pro engine against the team-level Pro engine and the Classic simulator on the same historical fixture set. Split chronologically into development and held-out periods. Compare 1X2, BTTS and totals using Brier score, log loss and calibration. Do not claim EA-equivalent performance or betting profitability from simulation volume alone.
