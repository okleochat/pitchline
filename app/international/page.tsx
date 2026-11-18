import { InternationalPageClient } from "@/components/international-page-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function lagosDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + "-" + values.month + "-" + values.day
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + "T00:00:00Z")
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export default async function InternationalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const params = await searchParams
  const suppliedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const date = suppliedDate && isValidDate(suppliedDate) ? suppliedDate : lagosDate()

  // Render the page shell immediately. Live board and date-specific fixtures
  // load through the client after the heading/date controls are visible.
  return <InternationalPageClient initialDate={date} />
}
