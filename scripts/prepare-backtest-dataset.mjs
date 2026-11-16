import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseCsv } from "../src/lib/backtest.ts"
import { prepareBacktestRows, requiredRawColumns, stringifyPreparedRows } from "../src/lib/prepare-backtest-dataset.ts"

async function main() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf("--input")
  const outputIndex = args.indexOf("--output")
  const windowIndex = args.indexOf("--window")
  const input = inputIndex >= 0 ? args[inputIndex + 1] : null
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null
  const windowSize = windowIndex >= 0 ? Number(args[windowIndex + 1]) : 5

  if (!input || input.startsWith("--") || !output || output.startsWith("--")) {
    throw new Error("Usage: npm run prepare-backtest -- --input historical-fixtures.csv --output prematch-rates.csv [--window 5]")
  }
  const raw = parseCsv(await readFile(input, "utf8"), requiredRawColumns())
  const prepared = prepareBacktestRows(raw, windowSize)
  await writeFile(output, stringifyPreparedRows(prepared), "utf8")
  process.stdout.write(
    `Prepared ${prepared.length} prematch fixtures from ${raw.length} raw matches using the previous ${windowSize} completed matches. Wrote ${path.resolve(output)}\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error?.message ?? error) + "\n")
    process.exitCode = 1
  })
}
