"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { useFirebaseSession } from "@/components/auth/firebase-auth-provider"
import { ArrowLeftRight, Check, ChevronDown, LoaderCircle, Minus, Pause, Play, Plus, RotateCcw, Sparkles } from "lucide-react"
import {
  LEAGUES,
  formRate,
  leagueName,
  leagueShort,
  shapePair,
  type Board,
  type Fixture,
  type LeagueId,
  type RateSample,
  type Team,
} from "@/data/football"
import { clearStoredProPickCache, loadBoard, loadForm, loadProPickMarkets, loadProSimulation, readStoredProPickCache, writeStoredProPickCache, type FormResult, type ProPickFixtureInput } from "@/lib/board"
import { clearProPickCache, createProPickCacheKey, readProPickCache, writeProPickCache } from "@/lib/pro-pick-cache"
import { homeAdvantageForLeague } from "@/lib/home-advantage"
import { hasInternationalPickHistory } from "@/lib/international/pick-eligibility"
import type { ProReport } from "@/lib/pro-sim"
import type { ProPlayerData, ProTeamSquad } from "@/lib/pro-player-data"
import {
  analyticalSplit,
  fairDecimal,
  formatLine,
  indexFor,
  marginLabels,
  pctLabel,
  playOne,
  roundHalf,
  shareLabel,
  simulate,
  splitHandicap,
  splitTotal,
  totalLabels,
  type MarketProbabilities,
  type ModelKind,
  type Report,
  type TapeEvent,
} from "@/lib/sim"
import { MAX_SLIP_LEGS, type SlipLeg } from "@/lib/slip/types"

const STORAGE_KE¶»§q«^