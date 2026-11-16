export type CompetitionSource = {
  slug: string
  name: string
  confederation: string
}

/**
 * Major senior national-team tournaments and qualifiers supported by ESPN's
 * public soccer scoreboard. Club competitions remain on the club match desk.
 */
export const INTERNATIONAL_COMPETITIONS: readonly CompetitionSource[] = [
  { slug: "caf.nations", name: "Africa Cup of Nations", confederation: "CAF" },
  { slug: "caf.nations_qual", name: "Africa Cup of Nations Qualifiers", confederation: "CAF" },
  { slug: "uefa.nations", name: "UEFA Nations League", confederation: "UEFA" },
  { slug: "fifa.world", name: "FIFA World Cup", confederation: "FIFA" },
  { slug: "fifa.worldq.uefa", name: "World Cup Qualifiers — UEFA", confederation: "UEFA" },
  { slug: "fifa.worldq.caf", name: "World Cup Qualifiers — CAF", confederation: "CAF" },
  { slug: "fifa.worldq.afc", name: "World Cup Qualifiers — AFC", confederation: "AFC" },
  { slug: "fifa.worldq.concacaf", name: "World Cup Qualifiers — CONCACAF", confederation: "CONCACAF" },
  { slug: "fifa.worldq.conmebol", name: "World Cup Qualifiers — CONMEBOL", confederation: "CONMEBOL" },
  { slug: "fifa.worldq.ofc", name: "World Cup Qualifiers — OFC", confederation: "OFC" },
  { slug: "fifa.worldq", name: "World Cup Qualifiers", confederation: "FIFA" },
  { slug: "uefa.euro", name: "UEFA European Championship", confederation: "UEFA" },
  { slug: "uefa.euroq", name: "UEFA European Championship Qualifiers", confederation: "UEFA" },
  { slug: "conmebol.america", name: "Copa América", confederation: "CONMEBOL" },
  { slug: "concacaf.gold", name: "CONCACAF Gold Cup", confederation: "CONCACAF" },
  { slug: "concacaf.nations.league", name: "CONCACAF Nations League", confederation: "CONCACAF" },
  { slug: "afc.asian.cup", name: "AFC Asian Cup", confederation: "AFC" },
  { slug: "conmebol.america_qual", name: "Copa América Qualifiers", confederation: "CONMEBOL" },
  { slug: "fifa.wwc", name: "FIFA Women's World Cup", confederation: "FIFA · Women" },
  { slug: "fifa.wwcq.ply", name: "Women's World Cup Qualifying Playoffs", confederation: "FIFA · Women" },
  { slug: "fifa.wworldq.uefa", name: "Women's World Cup Qualifiers — UEFA", confederation: "UEFA · Women" },
  { slug: "uefa.weuro", name: "UEFA Women's European Championship", confederation: "UEFA · Women" },
  { slug: "uefa.w.nations", name: "UEFA Women's Nations League", confederation: "UEFA · Women" },
  { slug: "concacaf.w.gold", name: "CONCACAF W Gold Cup", confederation: "CONCACAF · Women" },
  { slug: "conmebol.america.femenina", name: "Copa América Femenina", confederation: "CONMEBOL · Women" },
]
