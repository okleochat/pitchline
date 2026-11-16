# Pitchline

Pitchline is a football match probability and simulation app built with Next.js App Router, React and TypeScript.

## Run locally

Requirements: Node.js 20.9+ (Node 22 recommended).

```bash
npm install
npm run dev
```

Open http://localhost:8080. The simulator does not require Firebase.

## Features

- Cross-league match desk and fixture board
- Independent Poisson and Dixon–Coles goal models
- Exact-grid headline probabilities with deterministic 1,000-run score simulation
- Recency-weighted recent form
- Fair odds and manual bookmaker-price comparison
- ESPN live standings and fixture data with snapshot fallback

See docs/MODEL_VALIDATION.md and docs/FIREBASE_SETUP.md for model and account setup.
