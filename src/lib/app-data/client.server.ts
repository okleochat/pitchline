import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import {
  assertSameSiteRequest,
  CrossSiteRequestError,
} from "../auth/isolation.server.ts";
import { env, isWorkspacePreview } from "../env.server.ts";
import { assertAppDataServerOnly } from "./server-only.ts";
import {
  CONNECTOR_TOKEN_HEADER,
  CONNECTOR_TOKEN_PENDING_CODE,
  ConnectorType,
  type CallToolOptions,
  type CallToolResult,
  type ToolArgs,
} from "./types.ts";

assertAppDataServerOnly("app-data/client.server");

export const CONNECTORS_HOST_STAGING = "connectors.app-builder-testing.com";
export const CONNECTORS_HOST_PROD = "connectors.grok.me";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

type InboundContext = {
  token: string | null;
  publicHost: string | null;
  connectorsBase: string | null;
};

function connectorsBaseFor(publicHost: string | null): string | null {
  const explicit = env("GROK_CONNECTORS_URL");
  if (explicit) return explicit.replace(/\/+$/, "");

  const host = publicHost?.toLowerCase();
  if (!host || isLoopbackHost(host)) return null;
  if (
    host === "app-builder-testing.com" ||
    host.endsWith(".app-builder-testing.com")
  ) {
    return `https://${CONNECTORS_HOST_STAGING}`;
  }
  if (host === "grok.me" || host.endsWith(".grok.me")) {
    return `https://${CONNECTORS_HOST_PROD}`;
  }
  return null;
}

function tryGetRequest(): Request | null¶»§q«^