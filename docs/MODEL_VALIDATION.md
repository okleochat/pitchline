# Pitchline model validation

Pitchline retains deterministic 1,000-draw Monte Carlo scorelines and match tape. Headline 1X2, BTTS, clean-sheet and common goals-market probabilities are calculated from a normalized 0–12 goal grid; Dixon–Coles low-score corrections are applied before normalization.

Recent form is exponentially weighted, with newest completed match at weight 1. The weight halves every 2.5 matches for Last 5 or every 5 matches for Last 10. The ESPN schedule is explicitly sorted newest-first before slicing.

Historical backtesting still requires point-in-time pre-match attack/defence rates for every fixture. Current season tables must not be used as features for earlier matches because that leaks future information. xG/xGA remain optional source-attributed fields only; no xG values are fabricated from goals. The UEFA association coefficient is a coarse cross-league proxy, not club Elo. Cross-league outputs remain exploratory until calibrated.
