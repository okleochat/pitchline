export type ManagedBookmaker = {
  key: string
  name: string
  siteUrl: string
}

export const MANAGED_BOOKMAKERS: ManagedBookmaker[] = [
  { key: "football.com", name: "Football.com", siteUrl: "https://www.football.com/ng/" },
  { key: "onexbet", name: "1xBet", siteUrl: "https://1xbet.ng/" },
  { key: "22bet", name: "22Bet", siteUrl: "https://22bet.ng/" },
  { key: "bet9ja", name: "Bet9ja", siteUrl: "https://www.bet9ja.com/" },
  { key: "paripesa", name: "Paripesa", siteUrl: "https://paripesa.com/" },
  { key: "afropari_ng", name: "Afropari", siteUrl: "https://afropari.com/" },
]

export const MANUAL_ONLY_BOOKMAKERS = [
  { name: "Betway", reason: "The available integration supports it as a source, not a new-code destination." },
  { name: "BetPawa", reason: "Its public share feature is for sharing an already placed bet, not creating a pre-bet slip code." },
  { name: "SportPesa", reason: "No verified new-code endpoint is available in the supported integration." },
  { name: "BC.Game", reason: "No verified new-code endpoint is available in the supported integration." },
  { name: "Hollywoodbets", reason: "No verified new-code endpoint is available in the supported integration." },
] as const

export function managedBookmaker(key: string): ManagedBookmaker | undefined {
  return MANAGED_BOOKMAKERS.find((item) => item.key === key)
}
