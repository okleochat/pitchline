# Pitchline Pro Simulation Engine

## Engine selector

Pro subscribers receive the **Pro Engine** by default. They can switch to the existing Classic Monte Carlo simulator. The selected mode is saved locally per browser. Free accounts use the Classic simulator.

The Pro calculation is executed by \`POST /api/pro/simulate\`. The route calls \`requireProUser()\` before accepting simulation inputs, so hiding the engine selector is not the access-control boundary.

## Version 1: Phase of Play

The Pro engine simulates a match as a sequence of possessions. Each possession moves through build-up, progression, chance creation and finishing. Phase probabilities respond to team attacking and defending rates, match state, late-game urgency and fatigue.

The model returns the core markets and score samples as the Classic simulator, together with possession, shot, on-target, build-up and progression summaries.

This is an experimental model, not a claim of proven predictive superiority. Historical out-of-sample testing is required before making accuracy or profitability claims.

## Player and current-squad intelligence

The Pro engine combines two distinct inputs:

- **ESPN provides current roster membership and team identity.** Pitchline reuses the team's ESPN ID and competition slug from the live board.
- **EA SPORTS FC 27 provides player-quality attributes.** Pitchline uses EA's overall rating, detailed attributes and position data to estimate player contributions.

Pitchline does not use SportAPI.ai, API-Football or individual ESPN season-stat requests for this player-intelligence feature. This is not the same as an EA match-engine simulation.

### Data flow

1. Read the selected club or national team's current ESPN roster.
2. Normalize each roster player's name, position and nationality.
3. Load the required two-character name-prefix shards from the private \`ea_fc27_player_shards\` Firestore collection.
4. Match by exact normalized name keys. Position and nationality can disambiguate duplicate names; an unresolved collision remains unmatched.
5. Calculate per-player attack, creativity, defence and goalkeeper scores from EA's detailed attributes.
6. Aggregate matched players by their current ESPN roster positions and estimate squad depth from the lower-rated half.
7. Apply squad adjustments only when both teams meet the coverage threshold.

No fuzzy player join is used. EA club affiliation is not used to decide current team membership, because EA's base ratings page may not reflect a later real-world transfer. ESPN supplies the roster; EA supplies the player-quality attributes.

### How the player scores are built

- **Attack:** finishing, positioning, shot power, long shots, volleys, shooting, pace, dribbling and acceleration/sprint speed.
- **Creativity:** vision, short/long passing, passing, ball control, dribbling and crossing/curve.
- **Defence:** defensive awareness, standing/sliding tackle, interceptions, defending, strength, aggression, heading/jumping and physicality.
- **Goalkeeping:** diving, handling, positioning, reflexes, kicking and reactions.

Position weights determine the effect of players on attack, creativity and defence. Goalkeepers have their own score. EA does not publish real-world minutes or appearances in this dataset, so Pitchline does not invent playing-time weights. Each matched player contributes by role; the lower-rated half is used as a squad-depth estimate.

### Coverage and fallback

- Each team needs at least **12 EA-matched roster members** and **60% coverage**.
- Both teams must meet the threshold. If either side fails, neither side receives player-derived multipliers.
- A missing ESPN roster, unavailable EA shard, ambiguous name or incomplete player record does not stop the match simulation. The engine continues with the existing team-level inputs.
- Raw EA player data remains server-side. The browser receives aggregate squad indices, coverage, three top-rated matched players and the database sync date.

For international fixtures, the same logic applies only when ESPN returns a usable current national-team roster. Pitchline never substitutes all players of a nationality for an actual national-team squad.

### What EA ratings do not tell us

EA's public FC ratings are base game attributes, not current real-world form. They do not tell Pitchline who is injured, suspended, selected, expected to start or likely to play a particular match. The public page also does not promise up-to-the-minute club affiliation. Therefore the Pro feature must be described as an **EA-based player-quality prior combined with ESPN current-roster context**, not a live-form model, official EA prediction or replica of EA's proprietary simulation engine.

The EA Drop endpoint is undocumented and may change. The scraper fails closed if the expected FC 27 feed cannot be validated. Raw ratings are stored privately and must not be republished or redistributed. Review EA's current user terms and rights requirements before any commercial expansion.

## Setup and refresh

Follow [EA_FC_RATINGS_SETUP.md](./EA_FC_RATINGS_SETUP.md) to:

1. Probe EA's public ratings endpoint.
2. Download and normalize the full FC 27 player database using the Python collector.
3. Upload the men's player-name shards to private Firebase Firestore.
4. Refresh the snapshot periodically and verify the sync date and coverage in the Pro UI.

No API key is required for the EA download or ESPN roster lookup. Firestore upload uses the user's Google Cloud Application Default Credentials.

## Validation before marketing claims

Backtest the Pro simulator with and without EA player inputs on the same historical fixtures. Split chronologically into development and held-out periods. Compare 1X2, BTTS and totals using Brier score, log loss and calibration. Do not claim EA-equivalent performance or betting profitability from simulation volume alone.
