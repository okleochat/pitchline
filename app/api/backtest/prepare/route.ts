import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/firebase/server-session"
import { backtestRows, parseCsv } from "@/lib/backtest"
import { prepareBacktestRows, requiredRawColumns, stringifyPreparedRows } from "@/lib/prepare-backtest-dataset"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CSV_BYTES = 5 * 1024 * 1024

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return false
  try { return new URL(origin).origin === request.nextUrl.origin } catch { return false }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 })
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 })
  if (!user.isPro) return NextResponse.json({ error: "pro_required" }, { status: 403 })

  try {
    const form = await request.formData()
    const file = form.get("file")
    const windowSize = Number(form.get("window") ?? 5)
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "csv_file_required", detail: "Upload a raw historical .csv fixture archive." }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "file_size_invalid", detail: "Upload a CSV between 1 byte and 5 MB." }, { status: 413 })
    }
    if (!Number.isInteger(windowSize) || windowSize < 3 || windowSize > 10) {
      return NextResponse.json({ error: "invalid_window", detail: "Choose a rolling window between 3 and 10 matches." }, { status: 400 })
    }

    const rawRows = parseCsv(await file.text(), requiredRawColumns())
    if (rawRows.length > 20_000) {
      return NextResponse.json({ error: "too_many_fixtures", detail: "A single archive is limited to 20,000 raw fixtures." }, { status: 413 })
    }
    const preparedRows = prepareBacktestRows(rawRows, windowSize)
    const report = backtestRows(preparedRows)
    return NextResponse.json({
      sourceFixtures: rawRows.length,
      preparedFixtures: preparedRows.length,
      rollingWindow: windowSize,
      report,
      prematchCsv: stringifyPreparedRows(preparedRows),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare the historical archive."
    return NextResponse.json({ error: "backtest_prepare_failed", detail: message }, { status: 400 })
  }
}
