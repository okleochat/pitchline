# Pitchline Pro Simulation Engine

## Engine selector

Pro subscribers receive the **Pro Engine** by default. They can switch to the existing Classic Monte Carlo simulator at any time. The selected mode is saved locally per browser. Free accounts only use the Classic simulator.

The Pro calculation is executed by `POST /api/pro/simulate`. The route calls `requireProUser()` before accepting simulation inputs, so hiding the engine selector is not the access-control boundary.

## Version 1: Phase of Play

The first Pro engine simulates a match as a sequence of possessions. Each possession moves through four stages:

1. Build-up
2. Progression
3. Chance creation
4. Shot quality and finishing

The phase probabilities respond to the matchup between each team's current attack and the opponent's goals-conceded rate. The match loop also accounts for the score state, late-game urgency, a fatigue curve and a small generic substitution recovery. It returns the same core markets and score samples as the Classic simulator, together with possession, shot, on-target, build-up and progression summaries.

This is a new simulation approach, not a claim of proven predictive superiority. Its team-level inputs are the existing Pitchline team rates. Until it has passed historical out-of-sample testing, it should be described as an experimental Pro model.

## Player data is a separate next layer

Version 1 does **not** claim to use actual starting XIs, player-specific finishing, goalkeeper ratings, fitness or individual tactical roles. Those values are not present in Pitchline's current match-board data, and the engine must not fabricate them.

EA SPORTS FC player ratings are not integrated. EA's current User Agreement restricts copying, extracting or distributing EA content/data unless expressly authorised. EA's FC Community API is currently restricted to three approved community sites. The public ratings page is useful for manual research, but public visibility is not a commercial data licence.

A possible no-subscription connector to evaluate is API-Football. Its current free plan advertises 100 requests/day and includes player and lineup endpoints, but request limits, competition coverage and data-use permissions must be confirmed before production reliance. The lineup endpoint is only populated shortly before kickoff for covered competitions. Add any API key as a server-side secret only; never send it to the browser.

## Validation before marketing claims

Backtest this engine against the Classic simulator on the same historical fixture set, split chronologically into development and held-out periods. Compare 1X2, BTTS and totals using Brier score, log loss and calibration. Keep the model only where it improves out-of-sample forecasts. Do not claim EA-equivalent performance or betting profitability from simulation volume alone.
