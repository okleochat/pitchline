import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { backtestRows, parseCsv } from "../src/lib/backtest.ts"

async function main() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf("--input")
  const input = inputIndex >= 0 ? args[inputIndex + 1] : null
  const outputIndex = args.indexOf("--output")
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null
  if (!input || input.startsWith("--")) {
    throw new Error("Usage: npm run backtest -- --input prematch-rates.csv [--output report.json]")
  }

  const rows = parseCsv(await readFile(input, "utf8"))
  const report = JSON.stringify(backtestRows(rows), null, 2) + "\n"
  if (output) {
    await writeFile(output, report, "utf8")
    process.stdout.write("Backtest report written to " + path.resolve(output) + "\n")
  } else {
    process.stdout.write(report)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error?.message ?? error) + "\n")
    process.exitCode = 1
  })
}
