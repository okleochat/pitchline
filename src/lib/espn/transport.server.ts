import "server-only"

/**
 * Shared ESPN Site API transport.
 *
 * ESPN's undocumented API is CDN-protected and can throttle burst traffic.
 * Do not spoof a browser User-Agent: the API has returned CDN denials to
 * scripted clients using custom User-Agent headers. Keep requests paced and
 * retry transient network/429/5xx failures centrally.
 */

const ESPN_REQUEST_INTERVAL_MS = 200
const ESPN_REQUEST_TIMEOUT_MS = 15_000
const ESPN_MAX_ATTEMPTS = 4
const ESPN_MAX_RETRY_AFTER_MS = 10_000

let nextEspnRequestAt = 0
let espnRequestQueue: Promise<void> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Serializes request start times across concurrent calls in this process. */
async function waitForEspnRequestSlot(): Promise<void> {
  let release!: () => void
  const previous = espnRequestQueue
  espnRequestQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    const waitMs = Math.max(0, nextEspnRequestAt - Date.now())
    if (waitMs > 0) await sleep(waitMs)
    nextEspnRequestAt = Date.now() + ESPN_REQUEST_INTERVAL_MS
  } finally {
    release()
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(ESPN_MAX_RETRY_AFTER_MS, seconds * 1000)
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.min(ESPN_MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()))
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function requestPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return "unknown ESPN endpoint"
  }
}

/**
 * Shared server-side ESPN Site API transport used by the club board and the
 * international competition feed. The public API needs no key or auth header.
 */

const ESPN_BATCH_MAX_CONCURRENT = 8
let espnBatchInFlight = 0
const espnBatchWaiters: Array<() => void> = []

async function acquireEspnBatchSlot(): Promise<() => void> {
  if (espnBatchInFlight < ESPN_BATCH_MAX_CONCURRENT) {
    espnBatchInFlight += 1
  } else {
    await new Promise<void>((resolve) => espnBatchWaiters.push(resolve))
    // A waiting request inherits the released slot; the count stays reserved.
    return releaseEspnBatchSlot
  }
  return releaseEspnBatchSlot
}

function releaseEspnBatchSlot(): void {
  const next = espnBatchWaiters.shift()
  if (next) next()
  else espnBatchInFlight = Math.max(0, espnBatchInFlight - 1)
}

/**
 * Bounded-concurrency transport for independent ESPN scoreboard requests.
 * It skips the global 200 ms start-time queue, but caps concurrency at eight.
 * Transient failures fall back to the conservative retrying transport above.
 */
export async function getEspnJsonBatch(url: string): Promise<Record<string, unknown> | null> {
  const path = requestPath(url)
  const release = await acquireEspnBatchSlot()
  let fallbackToPacedRequest = false
  let value: Record<string, unknown> | null = null

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ESPN_REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    })

    if (response.ok) {
      try {
        value = (await response.json()) as Record<string, unknown>
      } catch {
        console.warn("[Pitchline ESPN] Batch response contained invalid JSON; retrying with paced transport", { path })
        fallbackToPacedRequest = true
      }
    } else if (retryableStatus(response.status)) {
      console.warn("[Pitchline ESPN] Batch request received a transient response; retrying with paced transport", {
        path,
        status: response.status,
      })
      fallbackToPacedRequest = true
    } else {
      console.warn("[Pitchline ESPN] Batch request rejected", { path, status: response.status })
    }
  } catch (error) {
    console.warn("[Pitchline ESPN] Batch request failed; retrying with paced transport", {
      path,
      reason: error instanceof Error ? error.name : "unknown",
    })
    fallbackToPacedRequest = true
  } finally {
    release()
  }

  return fallbackToPacedRequest ? getEspnJson(url) : value
}

/**
 * Fast bounded transport for user-facing team-squad lookups. A roster miss
 * should fail visibly within a short window and be retried on the next request,
 * not sit through the board transport's four long retries.
 */
export async function getEspnJsonQuick(url: string): Promise<Record<string, unknown> | null> {
  const path = requestPath(url)
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await waitForEspnRequestSlot()
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: { accept: "application/json" },
        cache: "no-store",
      })
      if (response.ok) {
        try {
          return await response.json() as Record<string, unknown>
        } catch {
          if (attempt === 1) continue
          console.warn("[Pitchline ESPN] Quick roster response contained invalid JSON", { path })
          return null
        }
      }
      if (!retryableStatus(response.status) || attempt === 2) {
        console.warn("[Pitchline ESPN] Quick roster request rejected", {
          path, status: response.status, attempts: attempt,
        })
        return null
      }
      await sleep(250)
    } catch (error) {
      if (attempt === 2) {
        console.warn("[Pitchline ESPN] Quick roster request failed", {
          path, reason: error instanceof Error ? error.name : "unknown",
        })
        return null
      }
      await sleep(250)
    }
  }
  return null
}

export async function getEspnJson(url: string): Promise<Record<string, unknown> | null> {
  const path = requestPath(url)

  for (let attempt = 1; attempt <= ESPN_MAX_ATTEMPTS; attempt += 1) {
    try {
      await waitForEspnRequestSlot()

      // Intentionally omit User-Agent. ESPN's CDN can reject scripted traffic
      // when clients send a spoofed/custom User-Agent header.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(ESPN_REQUEST_TIMEOUT_MS),
        headers: { accept: "application/json" },
        cache: "no-store",
      })

      if (response.ok) {
        try {
          return (await response.json()) as Record<string, unknown>
        } catch {
          if (attempt === ESPN_MAX_ATTEMPTS) {
            console.warn("[Pitchline ESPN] Invalid JSON response", { path })
            return null
          }
          await sleep(350 * 2 ** (attempt - 1))
          continue
        }
      }

      if (!retryableStatus(response.status) || attempt === ESPN_MAX_ATTEMPTS) {
        console.warn("[Pitchline ESPN] Request rejected", {
          path,
          status: response.status,
          attempts: attempt,
        })
        return null
      }

      const serverDelay = retryAfterMs(response.headers.get("retry-after"))
      await sleep(serverDelay ?? 400 * 2 ** (attempt - 1))
    } catch (error) {
      if (attempt === ESPN_MAX_ATTEMPTS) {
        console.warn("[Pitchline ESPN] Request failed after retries", {
          path,
          attempts: attempt,
          reason: error instanceof Error ? error.name : "unknown",
        })
        return null
      }
      await sleep(400 * 2 ** (attempt - 1))
    }
  }

  return null
}
