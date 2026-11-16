import { InternationalFixtures } from "@/components/fixtures/international-fixtures"
import { getInternationalFixtures } from "@/lib/international.server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function InternationalFixturesPage() {
  const fixtures = await getInternationalFixtures()
  return <InternationalFixtures initial={fixtures} />
}
