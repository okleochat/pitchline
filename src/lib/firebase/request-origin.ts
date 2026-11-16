type OriginInput = {
  origin: string | null
  appBaseUrl?: string | null
  requestOrigin: string
  forwardedHost?: string | null
  forwardedProto?: string | null
  host?: string | null
}

function normalize(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Match the browser Origin against the public app origin or reverse-proxy
 * headers. Firebase App Hosting may expose an internal container origin to
 * Next.js after terminating TLS at the edge.
 */
export function isAllowedRequestOrigin(input: OriginInput): boolean {
  const origin = normalize(input.origin)
  if (!origin) return false

  const candidates = new Set<string>()
  const configured = normalize(input.appBaseUrl)
  if (configured) candidates.add(configured)

  const requestOrigin = normalize(input.requestOrigin)
  if (requestOrigin) candidates.add(requestOrigin)

  const forwardedHost = input.forwardedHost?.split(",")[0]?.trim()
  const host = forwardedHost || input.host?.split(",")[0]?.trim()
  const requestProtocol = input.forwardedProto?.split(",")[0]?.trim().replace(/:$/, "") ||
    (requestOrigin ? new URL(requestOrigin).protocol.replace(/:$/, "") : "https")
  if (host) {
    const forwardedOrigin = normalize(requestProtocol + "://" + host)
    if (forwardedOrigin) candidates.add(forwardedOrigin)
  }

  return candidates.has(origin)
}
