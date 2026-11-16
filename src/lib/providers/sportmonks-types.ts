export type SportmonksParticipant = {
  id?: number
  name?: string
  short_code?: string | null
  meta?: { location?: "home" | "away" | string }
}

export type SportmonksXgMetric = {
  location?: "home" | "away" | string
  participant_id?: number
  type_id?: number
  type?: { id?: number; name?: string; code?: string }
  data?: { value?: number | string }
}

export type SportmonksOdd = {
  id?: number
  fixture_id?: number
  market_id?: number
  bookmaker_id?: number
  label?: string
  value?: string
  name?: string
  market_description?: string
  latest_bookmaker_update?: string
  bookmaker?: { name?: string }
  market?: { name?: string; description?: string }
}

export type SportmonksFixture = {
  id: number
  name?: string
  starting_at?: string
  participants?: SportmonksParticipant[]
  league?: { name?: string }
  state?: { name?: string; short_name?: string; state?: string }
  xGFixture?: SportmonksXgMetric[]
  xgfixture?: SportmonksXgMetric[]
  odds?: SportmonksOdd[]
  scores?: unknown[]
}

export type SportmonksFixtureResult = {
  configured: boolean
  xgEnabled: boolean
  oddsEnabled: boolean
  fixtures: SportmonksFixture[]
  fetchedAt: string
}

export type TeamXgForm = { xgf: number; xga: number; date: string; source: string }
