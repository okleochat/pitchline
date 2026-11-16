# Pitchline model validation

Pitchline's headline 1X2, BTTS, clean-sheet and common total-goal probabilities use a normalized 0–12 Poisson goal grid. Dixon–Coles low-score corrections are applied before normalization. A deterministic 1,000-draw simulation powers scoreline visualizations and match tape.

Recent form is newest-first. Last 5 and Last 10 use exponentially decaying weights, with the most recent completed result receiving the greatest weight.

## Historical backtesting

The existing `npm run backtest` command accepts a CSV containing fixture date, a feature timestamp, team attack/defence rates and final scores. It refuses any row where `features_as_of` is not before kickoff. It reports 1X2, BTTS and Over 2.5 Brier score, log loss, accuracy and reliability. It does not claim betting ROI.

A StatsBomb Open Data pipeline has been added to derive pre-match xG features from selected public tournaments:

```bash
npm run backtest:statsbomb -- --list
npm run backtest:statsbomb -- --competition-id <id> --season-id <id> --window 5 --output reports/statsbomb
```

The pipeline downloads that competition/season's match and shot-event JSON, aggregates `shot.statsbomb_xg` for each side, and constructs rolling xG-for/xG-against rates from the previous five completed matches for each team. It evaluates each date before adding any matches from that date to the history, so same-day fixtures cannot leak into features. Fixtures without enough prior history or complete shot-level xG are excluded rather than filled with goals or zeros.

It writes a prematch CSV and JSON evaluation report. StatsBomb Open Data is limited to selected competitions and seasons, so the eligible sample can be small or zero for tournaments with too few preceding matches. Results are an evaluation of the xG-driven goal-grid engine on that sample, not universal model validation.

## Important caveats

- StatsBomb Open Data must be attributed when results or data are published: [Hudl StatsBomb Open Data](https://github.com/hudl/open-data).
- Match-level shot xG is post-kickoff information. It is used only to build *later* matches' rolling prematch inputs, never the same fixture's forecast.
- Do not combine xG rates with goals-per-match rates without recording and validating the feature definition.
- ESPN standings are not a historical point-in-time store. Current standings must not be used to reconstruct old pre-match features.
- The UEFA association coefficient remains a coarse cross-league proxy, not calibrated club Elo.
- No xG accuracy, calibration or profitable betting result should be claimed until a real backtest is run and its sample size and data provenance are reviewed.
