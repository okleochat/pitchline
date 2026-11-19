#!/usr/bin/env python3
"""Read-only audit of ESPN current rosters against Pitchline's active EA FC 27 snapshot.

This script only reads the public Pitchline board, ESPN's public roster feed and
Firestore EA rating documents. It never writes to Firestore or changes profiles.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from google.cloud import firestore
from rapidfuzz import fuzz

BOARD_URL = "https://pitchline-okleo.vercel.app/api/board"
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
PROJECT_ID = "pitchline-app"
MAX_WORKERS = 8
TIMEOUT = 12
TRANSLITERATION = str.maketrans({
    "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th",
    "æ": "ae", "œ": "oe", "ß": "ss", "ı": "i", "ħ": "h",
    "ı": "i", "ŋ": "n",
})
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v", "junior", "senior"}
IGNORED_TOKENS = SUFFIXES | {"fc", "cf", "sc", "afc", "club", "city", "united"}

def get_json(url: str, attempts: int = 4):
    headers = {"accept": "application/json"}
    for attempt in range(attempts):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code not in (408, 425, 429) and exc.code < 500:
                raise
            if attempt == attempts - 1:
                raise
            delay = min(10, 0.5 * (2 ** attempt))
            time.sleep(delay)
        except (URLError, TimeoutError, json.JSONDecodeError):
            if attempt == attempts - 1:
                raise
            time.sleep(min(8, 0.5 * (2 ** attempt)))
    return None

def normalize_prod(value: str) -> str:
    # Exact equivalent of src/lib/pro-player-model.ts normalisePlayerName().
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()

def normalize_translit(value: str) -> str:
    value = value.lower().translate(TRANSLITERATION)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()

def rec(value):
    return value if isinstance(value, dict) else {}

def first_string(item, *keys):
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""

def position_group(value: str) -> str:
    raw = (value or "").strip().upper()
    if raw in {"G", "GK", "GKP"} or "GOALKEEPER" in raw:
        return "GK"
    if raw in {"D", "DF", "DEF", "CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB", "SW"} or "DEFENDER" in raw or "BACK" in raw:
        return "DF"
    if raw in {"M", "MF", "MID", "CDM", "CM", "LCM", "RCM", "CAM", "LM", "RM", "DM"} or "MIDFIELDER" in raw:
        return "MF"
    if raw in {"F", "FW", "ATT", "ST", "CF", "LW", "RW", "LF", "RF"} or any(x in raw for x in ("FORWARD", "STRIKER", "ATTACKER")):
        return "FW"
    return "UNK"

def parse_espn_roster(payload):
    players, seen = [], set()

    def visit(value, inherited_position=None, depth=0):
        if depth > 8 or value is None:
            return
        if isinstance(value, list):
            for child in value:
                visit(child, inherited_position, depth + 1)
            return
        item = rec(value)
        if not item:
            return
        athlete = rec(item.get("athlete")) or rec(item.get("player")) or item
        athlete_id = athlete.get("id", athlete.get("athleteId", athlete.get("athlete_id")))
        if athlete_id is not None and str(athlete_id).isdigit():
            name_candidates = []
            for key in ("fullName", "displayName", "name", "display_name", "shortName", "short_name"):
                value = athlete.get(key)
                if isinstance(value, str) and value.strip():
                    name_candidates.append(value.strip())
            first = first_string(athlete, "firstName", "first_name")
            last = first_string(athlete, "lastName", "last_name")
            if first or last:
                name_candidates.append(" ".join(x for x in (first, last) if x))
            name_candidates = list(dict.fromkeys(name_candidates))
            if name_candidates and str(athlete_id) not in seen:
                seen.add(str(athlete_id))
                position = athlete.get("position", item.get("position", inherited_position))
                if isinstance(position, dict):
                    position = first_string(position, "shortLabel", "abbreviation", "abbr", "name", "displayName")
                elif position is not None:
                    position = str(position)
                nationality = athlete.get("nationality", athlete.get("citizenship", item.get("nationality")))
                if isinstance(nationality, dict):
                    nationality = first_string(nationality, "displayName", "name", "abbreviation")
                players.append({
                    "espn_id": str(athlete_id),
                    "name": name_candidates[0],
                    "names": name_candidates,
                    "position": position or "",
                    "position_group": position_group(position or ""),
                    "nationality": str(nationality or "").strip(),
                })
                return
        next_position = item.get("position", inherited_position)
        if isinstance(next_position, dict):
            next_position = first_string(next_position, "shortLabel", "abbreviation", "name", "displayName")
        for key in ("athletes", "players", "items", "roster", "entries", "groups"):
            if key in item:
                visit(item[key], next_position, depth + 1)

    root = rec(payload)
    visit(root.get("athletes", root.get("players", root.get("roster", root))))
    return players

def fetch_team_roster(team):
    slug, team_id = team["feedSlug"], str(team["espnId"])
    url = f"{ESPN_BASE}/{slug}/teams/{team_id}/roster"
    try:
        payload = get_json(url)
        roster = parse_espn_roster(payload) if isinstance(payload, dict) else []
        if not roster:
            return team, [], "empty_or_unrecognized_roster"
        return team, roster, None
    except Exception as exc:
        return team, [], f"{type(exc).__name__}: {exc}"

def ea_name_keys(player):
    keys = player.get("nameKeys")
    if not isinstance(keys, list):
        keys = []
    if isinstance(player.get("name"), str):
        keys = keys + [player["name"]]
    return list(dict.fromkeys(x.strip() for x in keys if isinstance(x, str) and x.strip()))

def load_ea_snapshot(db):
    metadata = db.collection("ea_fc27_meta").document("current").get().to_dict() or {}
    collection = metadata.get("activeCollection")
    if not isinstance(collection, str) or not collection.startswith("ea_fc27_players_"):
        raise RuntimeError("EA activeCollection pointer is missing or invalid.")
    players_by_id = {}
    shard_count = 0
    for snapshot in db.collection(collection).stream():
        shard_count += 1
        document = snapshot.to_dict() or {}
        for raw in document.get("players", []):
            if not isinstance(raw, dict) or raw.get("id") is None:
                continue
            player_id = str(raw["id"])
            existing = players_by_id.get(player_id)
            if existing:
                # Same EA ID is copied to each of its name shards. Merge aliases.
                existing["nameKeys"] = list(dict.fromkeys(existing["nameKeys"] + ea_name_keys(raw)))
            else:
                players_by_id[player_id] = {
                    **raw,
                    "id": player_id,
                    "nameKeys": ea_name_keys(raw),
                }
    if not players_by_id:
        raise RuntimeError(f"Active EA collection {collection} contains no player records.")
    return collection, metadata, players_by_id, shard_count

def score_is_usable(player):
    # Mirrors deriveEaPlayerScores()'s hasAnyPlayerData gate.
    overall = player.get("overall")
    if overall is None:
        overall = player.get("overallRating")
    if isinstance(overall, dict):
        overall = overall.get("value")
    if isinstance(overall, (int, float)) and not isinstance(overall, bool):
        return True
    stats = rec(player.get("stats"))
    keys = (
        "pac", "pace", "sho", "shooting", "pas", "passing", "dri", "dribbling",
        "def", "defending", "phy", "physicality",
        "gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking", "reactions",
    )
    for key in keys:
        value = stats.get(key, player.get(key))
        if isinstance(value, dict):
            value = value.get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return True
    return False

def match_exact(espn, ea_players, exact_index):
    keys = {normalize_prod(name) for name in espn["names"]}
    keys.discard("")
    ids = set()
    for key in keys:
        ids.update(exact_index.get(key, ()))
    matches = [ea_players[pid] for pid in ids if pid in ea_players]
    if len(matches) <= 1:
        return (matches[0] if matches else None), ("exact" if matches else "unmatched"), len(matches)
    ep = espn["position_group"]
    if ep != "UNK":
        position_matches = [p for p in matches if position_group(str(p.get("position", ""))) == ep]
        if len(position_matches) == 1:
            return position_matches[0], "exact_disambiguated_position", len(matches)
        if len(position_matches) > 1:
            matches = position_matches
    nationality = normalize_prod(espn["nationality"])
    if nationality:
        nat_matches = [
            p for p in matches
            if normalize_prod(str(p.get("nationality", ""))) == nationality
        ]
        if len(nat_matches) == 1:
            return nat_matches[0], "exact_disambiguated_nationality", len(matches)
    return (matches[0] if len(matches) == 1 else None), ("exact" if len(matches) == 1 else "ambiguous_exact"), len(matches)

def candidate_indexes(ea_players):
    by_exact = defaultdict(set)
    by_token = defaultdict(set)
    by_surname = defaultdict(set)
    player_aliases = {}
    for pid, player in ea_players.items():
        aliases = player["nameKeys"] or [str(player.get("name", ""))]
        variants = []
        for alias in aliases:
            prod = normalize_prod(alias)
            trans = normalize_translit(alias)
            if prod or trans:
                variants.append((prod, trans, alias))
                if prod:
                    by_exact[prod].add(pid)
                tokens = {t for t in trans.split() if t not in IGNORED_TOKENS and len(t) > 1}
                for token in tokens:
                    by_token[token].add(pid)
                all_tokens = [t for t in trans.split() if t not in SUFFIXES]
                if all_tokens:
                    by_surname[all_tokens[-1]].add(pid)
        player_aliases[pid] = variants
    return by_exact, by_token, by_surname, player_aliases

def fuzzy_candidates(espn, ea_players, indexes, limit=3):
    """
    Conservative candidate review. Never equate players merely because they
    share one token: token_set_ratio caused many obvious false positives
    (e.g. a common first name or surname being treated as a 100% match).
    """
    _, by_token, by_surname, player_aliases = indexes
    names = espn["names"]
    norm_names = [(normalize_prod(n), normalize_translit(n)) for n in names]
    meaningful_tokens = {
        token
        for _, translit in norm_names
        for token in translit.split()
        if token not in IGNORED_TOKENS and len(token) > 1
    }
    # A one-token short name is deliberately not fuzzy-matched. If it is an
    # exact EA alias it was already considered by the production-equivalent
    # matcher; otherwise it is too ambiguous to recover safely.
    if len(meaningful_tokens) < 2:
        return []

    pool = set()
    for token in meaningful_tokens:
        pool.update(by_token.get(token, ()))
    for _, translit in norm_names:
        token_list = [t for t in translit.split() if t not in SUFFIXES]
        if len(token_list) >= 2:
            pool.update(by_surname.get(token_list[-1], ()))
    pool.discard("")
    if not pool:
        return []

    def core_tokens(value):
        return [token for token in value.split() if token not in SUFFIXES]

    output = []
    espn_pos = espn["position_group"]
    espn_nat = normalize_prod(espn["nationality"])

    for pid in pool:
        player = ea_players[pid]
        if not score_is_usable(player):
            continue

        ea_pos = position_group(str(player.get("position", "")))
        position_match = espn_pos != "UNK" and espn_pos == ea_pos
        ea_nat = normalize_prod(str(player.get("nationality", "")))
        nationality_match = bool(espn_nat and ea_nat and espn_nat == ea_nat)
        position_known = espn_pos != "UNK" and ea_pos != "UNK"
        nationality_known = bool(espn_nat and ea_nat)
        context_match_count = int(position_match) + int(nationality_match)
        context_mismatch = (
            (position_known and not position_match) or
            (nationality_known and not nationality_match)
        )

        best = None
        for ep, et, _ in player_aliases[pid]:
            if not et:
                continue
            ea_tokens = core_tokens(et)
            if len(ea_tokens) < 2:
                continue

            for xp, xt in norm_names:
                if not xt:
                    continue
                espn_tokens = core_tokens(xt)
                if len(espn_tokens) < 2:
                    continue

                reason = None
                similarity = fuzz.ratio(xt, et)
                same_transliterated_name = xt == et
                same_token_order_variant = sorted(espn_tokens) == sorted(ea_tokens)
                same_first_last = (
                    len(espn_tokens) >= 2 and len(ea_tokens) >= 2 and
                    espn_tokens[0] == ea_tokens[0] and
                    espn_tokens[-1] == ea_tokens[-1]
                )
                first_initial_match = (
                    len(espn_tokens[0]) == 1 and
                    espn_tokens[0][0] == ea_tokens[0][0] and
                    espn_tokens[-1] == ea_tokens[-1]
                ) or (
                    len(ea_tokens[0]) == 1 and
                    ea_tokens[0][0] == espn_tokens[0][0] and
                    espn_tokens[-1] == ea_tokens[-1]
                )

                if same_transliterated_name:
                    reason = "transliteration_only"
                    similarity = 100.0
                elif same_token_order_variant:
                    reason = "name_order_or_token_variant"
                    similarity = 100.0
                elif same_first_last:
                    reason = "middle_name_or_initial_expansion"
                    similarity = 100.0
                elif first_initial_match:
                    reason = "first_initial_and_exact_surname"
                elif (
                    similarity >= 93 and
                    espn_tokens[-1] == ea_tokens[-1] and
                    fuzz.ratio(espn_tokens[0], ea_tokens[0]) >= 88
                ):
                    reason = "near_spelling_same_surname"

                if reason is None:
                    continue

                candidate = {
                    "id": pid,
                    "name": player.get("name", ""),
                    "overall": player.get("overall", ""),
                    "position": player.get("position", ""),
                    "nationality": player.get("nationality", ""),
                    "similarity": round(similarity, 1),
                    "reason": reason,
                    "position_match": position_match,
                    "nationality_match": nationality_match,
                    "surname_match": espn_tokens[-1] == ea_tokens[-1],
                    "context_match_count": context_match_count,
                    "context_mismatch": context_mismatch,
                }
                if best is None or candidate["similarity"] > best["similarity"]:
                    best = candidate

        if best is None:
            continue

        # A conflicting known position or nationality is a hard stop. When
        # both are known, require both for approximate (not exact) identities.
        if best["context_mismatch"]:
            continue

        exact_variant = best["reason"] in {
            "transliteration_only",
            "name_order_or_token_variant",
        }
        if exact_variant and context_match_count >= 1:
            confidence = "high"
        elif best["reason"] == "middle_name_or_initial_expansion" and context_match_count >= 1:
            confidence = "high" if context_match_count == 2 or not (position_known and nationality_known) else "medium"
        elif best["reason"] in {"first_initial_and_exact_surname", "near_spelling_same_surname"}:
            if context_match_count == 2:
                confidence = "high"
            elif context_match_count == 1:
                confidence = "medium"
            else:
                continue
        else:
            continue

        output.append({
            **best,
            "confidence": confidence,
        })

    output.sort(key=lambda x: (
        {"high": 3, "medium": 2, "low": 1}[x["confidence"]],
        x["context_match_count"],
        x["similarity"],
        x["position_match"],
        x["nationality_match"],
    ), reverse=True)
    # Multiple EA IDs can represent same-looking names. Preserve alternatives
    # in the report rather than silently collapsing potential collisions.
    return output[:limit]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="audit-output")
    args = parser.parse_args()
    outdir = Path(args.output_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    board = get_json(BOARD_URL)
    if not isinstance(board, dict) or not isinstance(board.get("teams"), list):
        raise RuntimeError("Pitchline board did not return a teams array.")
    teams_all = [t for t in board["teams"] if isinstance(t, dict) and t.get("espnId") and t.get("feedSlug")]
    # Team IDs are global. Prefer a domestic feed when the same ESPN team occurs
    # in domestic and UEFA competition lists; retain national teams as a separate cohort.
    league_priority = {"ucl": 4, "uel": 5, "uecl": 6, "int": 7}
    deduped = {}
    for team in teams_all:
        tid = str(team["espnId"])
        rank = league_priority.get(team.get("league"), 0)
        old = deduped.get(tid)
        if old is None or rank < old[0]:
            deduped[tid] = (rank, team)
    teams = [item[1] for item in deduped.values()]

    print(f"Board snapshot: {board.get('updatedAt')}; teams listed={len(teams_all)}; unique ESPN IDs={len(teams)}")
    db = firestore.Client(project=PROJECT_ID)
    collection, metadata, ea_players, shard_count = load_ea_snapshot(db)
    print(f"Read-only EA snapshot: {collection}; unique EA player IDs={len(ea_players):,}; shards={shard_count:,}; syncedAt={metadata.get('syncedAt')}")
    indexes = candidate_indexes(ea_players)

    fetched, failures = [], []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(fetch_team_roster, team) for team in teams]
        for future in as_completed(futures):
            team, roster, error = future.result()
            fetched.append((team, roster))
            if error:
                failures.append({"team": team.get("name"), "league": team.get("league"), "espnId": team.get("espnId"), "error": error})
    print(f"ESPN roster fetches: successful={len(fetched)-len(failures)}; failed/empty={len(failures)}")

    team_rows, unmatched_rows = [], []
    totals = Counter()
    claimed_by_team = {}
    for team, roster in fetched:
        team_name = team.get("name", "")
        exact_ids = set()
        exact = 0
        identity_exact = 0
        unrated_identity = 0
        ambiguous = 0
        conflict = 0
        high = medium = low = 0
        rated_exact = 0
        for player in roster:
            match, status, duplicate_count = match_exact(player, ea_players, indexes[0])
            if status == "ambiguous_exact":
                ambiguous += 1
                totals["ambiguous_exact"] += 1
                unmatched_rows.append({
                    "league": team.get("league", ""),
                    "team": team_name,
                    "espn_team_id": team.get("espnId", ""),
                    "espn_player_id": player["espn_id"],
                    "espn_player": player["name"],
                    "espn_name_candidates": " | ".join(player["names"]),
                    "position": player["position"],
                    "nationality": player["nationality"],
                    "candidate_count": duplicate_count,
                    "top_candidate": "",
                    "top_candidate_id": "",
                    "top_candidate_overall": "",
                    "top_candidate_position": "",
                    "top_candidate_nationality": "",
                    "similarity": "",
                    "confidence": "ambiguous",
                    "reason": "multiple_exact_EA_records_could_not_be_disambiguated",
                    "other_candidates": "",
                })
                continue
            elif match:
                identity_exact += 1
                totals["exact_identity_matches"] += 1
                if match["id"] in exact_ids:
                    conflict += 1
                    totals["duplicate_identity_conflicts"] += 1
                    continue
                exact_ids.add(match["id"])
                if score_is_usable(match):
                    exact += 1
                    rated_exact += 1
                    totals["exact_matches"] += 1
                    totals["rated_exact_matches"] += 1
                    continue
                # The identity exists in EA, but the app cannot create scores
                # from this record; it therefore does not count as rated coverage.
                unrated_identity += 1
                totals["unrated_exact_identity"] += 1
                unmatched_rows.append({
                    "league": team.get("league", ""),
                    "team": team_name,
                    "espn_team_id": team.get("espnId", ""),
                    "espn_player_id": player["espn_id"],
                    "espn_player": player["name"],
                    "espn_name_candidates": " | ".join(player["names"]),
                    "position": player["position"],
                    "nationality": player["nationality"],
                    "candidate_count": 1,
                    "top_candidate": match.get("name", ""),
                    "top_candidate_id": match.get("id", ""),
                    "top_candidate_overall": match.get("overall", ""),
                    "top_candidate_position": match.get("position", ""),
                    "top_candidate_nationality": match.get("nationality", ""),
                    "similarity": 100,
                    "confidence": "unrated",
                    "reason": "exact_EA_identity_but_no_usable_rating_fields",
                    "other_candidates": match.get("name", ""),
                })
                continue

            candidates = fuzzy_candidates(player, ea_players, indexes, limit=3)
            top = candidates[0] if candidates else None
            confidence = top["confidence"] if top else "none"
            if confidence == "high":
                high += 1
                totals["high_confidence_unmatched"] += 1
            elif confidence == "medium":
                medium += 1
                totals["medium_confidence_unmatched"] += 1
            elif confidence == "low":
                low += 1
                totals["low_confidence_unmatched"] += 1
            else:
                totals["no_candidate"] += 1
            candidate_text = " | ".join(
                f'{c["name"]} [{c["confidence"]},{c["similarity"]}%]'
                for c in candidates
            )
            unmatched_rows.append({
                "league": team.get("league", ""),
                "team": team_name,
                "espn_team_id": team.get("espnId", ""),
                "espn_player_id": player["espn_id"],
                "espn_player": player["name"],
                "espn_name_candidates": " | ".join(player["names"]),
                "position": player["position"],
                "nationality": player["nationality"],
                "candidate_count": len(candidates),
                "top_candidate": top["name"] if top else "",
                "top_candidate_id": top["id"] if top else "",
                "top_candidate_overall": top["overall"] if top else "",
                "top_candidate_position": top["position"] if top else "",
                "top_candidate_nationality": top["nationality"] if top else "",
                "similarity": top["similarity"] if top else "",
                "confidence": confidence,
                "reason": top["reason"] if top else "no_close_candidate",
                "other_candidates": candidate_text,
            })
        roster_count = len(roster)
        coverage = exact / roster_count if roster_count else 0
        projected = min(roster_count, exact + high)
        team_rows.append({
            "league": team.get("league", ""),
            "feed_slug": team.get("feedSlug", ""),
            "team": team_name,
            "espn_team_id": team.get("espnId", ""),
            "roster_count": roster_count,
            "exact_identity_matches": identity_exact,
            "exact_matches": rated_exact,
            "rated_exact_matches": rated_exact,
            "unrated_exact_identity": unrated_identity,
            "coverage_pct": round(coverage * 100, 1),
            "ambiguous_exact": ambiguous,
            "duplicate_identity_conflicts": conflict,
            "high_confidence_unmatched": high,
            "medium_confidence_unmatched": medium,
            "low_confidence_unmatched": low,
            "no_candidate": roster_count - rated_exact - ambiguous - conflict - unrated_identity - high - medium - low,
            "projected_coverage_with_high_candidates_pct": round(projected / roster_count * 100, 1) if roster_count else 0,
            "current_60pct_and_12_gate": exact >= 12 and coverage >= 0.6,
            "projected_60pct_and_12_gate": projected >= 12 and (projected / roster_count >= 0.6 if roster_count else False),
        })
        totals["espn_roster_players"] += roster_count
        totals["ambiguous_roster_players"] += ambiguous
        totals["team_count_audited"] += 1
        totals["current_gate_teams"] += int(exact >= 12 and coverage >= 0.6)
        totals["projected_gate_teams"] += int(projected >= 12 and (projected / roster_count >= 0.6 if roster_count else False))

    rostered = totals["espn_roster_players"]
    exact_count = totals["exact_identity_matches"]
    rated_count = totals["rated_exact_matches"]
    unmatched_count = max(0, rostered - rated_count)
    high_count = totals["high_confidence_unmatched"]
    summary = {
        "audit_type": "read_only_espn_to_ea_player_identity_audit",
        "board_updated_at": board.get("updatedAt"),
        "ea_database": "EA SPORTS FC 27",
        "ea_active_collection": collection,
        "ea_synced_at": metadata.get("syncedAt"),
        "ea_unique_player_ids": len(ea_players),
        "ea_shard_documents_read": shard_count,
        "board_team_records_with_espn_ids": len(teams_all),
        "unique_espn_teams_audited": totals["team_count_audited"],
        "roster_fetch_failures_or_empty": len(failures),
        "espn_roster_players": rostered,
        "exact_identity_matches": exact_count,
        "rated_exact_matches": rated_count,
        "exact_rating_coverage_pct": round(rated_count / rostered * 100, 2) if rostered else 0,
        "ambiguous_exact_matches": totals["ambiguous_exact"],
        "duplicate_identity_conflicts": totals["duplicate_identity_conflicts"],
        "unrated_exact_identity_records": totals["unrated_exact_identity"],
        "unmatched_after_current_logic": unmatched_count,
        "high_confidence_name_variant_candidates": high_count,
        "medium_confidence_candidates": totals["medium_confidence_unmatched"],
        "low_confidence_candidates": totals["low_confidence_unmatched"],
        "no_close_candidate": totals["no_candidate"],
        "teams_meeting_current_12_player_60pct_gate": totals["current_gate_teams"],
        "teams_that_could_meet_gate_if_high_confidence_candidates_were_verified": totals["projected_gate_teams"],
        "method": {
            "exact": "Replicates Pitchline's strict normalized-name matcher, including position/nationality disambiguation and one-EA-record-per-ESPN-player guard.",
            "candidate_review": "Full active EA snapshot search using accent/transliteration normalization, token-order checks and RapidFuzz similarity; position and nationality are supporting evidence. High/medium/low are review priorities, not automatic matches.",
            "safety": "No writes to Firestore; all candidate matches require human review before any production matching change.",
            "scope": "All board teams with ESPN IDs and feed slugs; duplicate ESPN team IDs deduplicated, preferring domestic feeds over UEFA competition feeds. International teams remain included where they have valid ESPN IDs."
        },
        "league_breakdown": {},
        "top_recoverable_teams": [],
        "failures": failures,
    }
    by_league = defaultdict(Counter)
    for row in team_rows:
        c = by_league[row["league"]]
        for key in ("roster_count", "exact_matches", "high_confidence_unmatched", "medium_confidence_unmatched", "low_confidence_unmatched", "no_candidate"):
            c[key] += row[key]
        c["teams"] += 1
    summary["league_breakdown"] = {
        league: {
            **dict(counts),
            "coverage_pct": round(counts["exact_matches"] / counts["roster_count"] * 100, 1) if counts["roster_count"] else 0,
        }
        for league, counts in sorted(by_league.items())
    }
    summary["top_recoverable_teams"] = sorted(
        [row for row in team_rows if row["high_confidence_unmatched"] or row["medium_confidence_unmatched"]],
        key=lambda row: (row["high_confidence_unmatched"], row["medium_confidence_unmatched"]),
        reverse=True,
    )[:40]

    def write_csv(path, rows):
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        with path.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    write_csv(outdir / "team_summary.csv", sorted(team_rows, key=lambda x: (x["coverage_pct"], x["team"])))
    write_csv(outdir / "unmatched_players.csv", sorted(unmatched_rows, key=lambda x: (
        {"high": 0, "medium": 1, "low": 2, "none": 3}.get(x["confidence"], 4),
        x["league"], x["team"], x["espn_player"]
    )))
    (outdir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("method", "league_breakdown", "top_recoverable_teams", "failures")}, indent=2))
    print(f"Reports written to {outdir.resolve()}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"AUDIT FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
