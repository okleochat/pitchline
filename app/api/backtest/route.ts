import { NextRequest, NextResponse } from "next/server"
import { backtestRows, parseCsv } from "@/lib/backtest"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CSV_BYTES = 5 * 1024 * 1024

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 })
  }

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 })
  if (!user.isPro) return NextResponse.json({ error: "pro_required" }, { status: 403 })

  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "csv_file_required" }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "file_size_invalid", detail: "Upload a CSV between 1 byte and 5 MB." }, { status: 413 })
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "csv_file_required", detail: "Upload a .csv file." }, { status: 400 })
    }

    const rows = parseCsv(await file.text())
    if (rows.length > 20_000) {
      return NextResponse.json({ error: "too_many_fixtures", detail: "A single backtest is limited to 20,000 fixtures." }, { status: 413 })
    }
    const report = backtestRows(rows)
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate the historical dataset."
    return NextResponse.json({ error: "backtest_invalid", detail: message }, { status: 400 })
  }
}
