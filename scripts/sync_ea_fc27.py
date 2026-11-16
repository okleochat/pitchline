#!/usr/bin/env python3
"""Download EA SPORTS FC 27 base-player ratings and sync private player-name shards to Firestore.

This uses the public ratings feed requested by EA's own ratings page. It is a
private-data ingestion utility for Pitchline; it does not bypass authentication,
CAPTCHAs, access controls, or rate limits. EA can change this undocumented feed
or its feature header at any time.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "ea-fc27" / "players.json"

# EA's current public ratings page uses this feed and feature header. The
# x-feature value is an observed page feature identifier, not an API key.
EA_RATINGS_PAGE = "https://www.ea.com/games/ea-sports-fc/ratings"
EA_API = "https://drop-api.ea.com/rating/ea-sports-fc"
EA_FEATURE_ID = "9281653454195393000"
PAGE_SIZE = 100
MAX_RETRIES = 4
REQUEST_TIMEOUT = 45

STAT_KEYS = (
    "pac", "sho", "pas", "dri", "def", "phy",
    "acceleration", "sprintSpeed", "finishing", "shotPower", "longShots",
    "volleys", "penalties", "positioning", "crossing", "curve",
    "freeKickAccuracy", "longPassing", "shortPassing", "vision", "agility",
    "balance", "reactions", "ballControl", "dribbling", "composure",
    "interceptions", "defensiveAwareness", "standingTackle", "slidingTackle",
    "jumping", "stamina", "strength", "aggression", "headingAccuracy",
    "gkDiving", "gkHandling", "gkKicking", "gkPositioning", "gkReflexes",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def stat_number(stats: dict[str, Any], key: str) -> int | float | None:
    item = stats.get(key)
    if isinstance(item, dict):
        item = item.get("value")
    if isinstance(item, bool) or not isinstance(item, (int, float)):
        return None
    if not math.isfinite(item):
        return None
    return int(item) if int(item) == item else float(item)


def normalise_player(raw: dict[str, Any]) -> dict[str, Any] | None:
    player_id = raw.get("id")
    team = as_dict(raw.get("team"))
    position = as_dict(raw.get("position"))
    gender = as_dict(raw.get("gender"))
    nationality = as_dict(raw.get("nationality"))

    if player_id is None or not str(player_id).strip():
        return None
    club = team.get("label")
    club_label = club.strip() if isinstance(club, str) else ""

    common_name = raw.get("commonName")
    first_name = raw.get("firstName")
    last_name = raw.get("lastName")
    name = (
        common_name.strip()
        if isinstance(common_name, str) and common_name.strip()
        else " ".join(part.strip() for part in (first_name, last_name) if isinstance(part, str) and part.strip())
    )
    if not name:
        return None

    raw_stats = as_dict(raw.get("stats"))
    stats = {
        key: value
        for key in STAT_KEYS
        if (value := stat_number(raw_stats, key)) is not None
    }

    abilities = raw.get("playerAbilities")
    playstyles: list[str] = []
    playstyles_plus: list[str] = []
    if isinstance(abilities, list):
        for ability in abilities:
            item = as_dict(ability)
            label = item.get("label")
            ability_type = as_dict(item.get("type")).get("id")
            if not isinstance(label, str) or not label.strip():
                continue
            if ability_type == "playStylePlus":
                playstyles_plus.append(label.strip())
            elif ability_type == "playStyle":
                playstyles.append(label.strip())

    alt_positions = raw.get("alternatePositions")
    alternate_positions = [
        item.get("shortLabel")
        for entry in (alt_positions if isinstance(alt_positions, list) else [])
        if isinstance((item := as_dict(entry)).get("shortLabel"), str)
    ]

    overall = raw.get("overallRating")
    if isinstance(overall, bool) or not isinstance(overall, (int, float)):
        overall = None

    full_name = " ".join(part.strip() for part in (first_name, last_name) if isinstance(part, str) and part.strip())
    name_keys = sorted({key for candidate in (name, full_name) if (key := fold_name(candidate))})
    return {
        "id": str(player_id),
        "name": name,
        "nameKeys": name_keys,
        "firstName": first_name if isinstance(first_name, str) else "",
        "lastName": last_name if isinstance(last_name, str) else "",
        "overall": int(overall) if overall is not None else None,
        "position": position.get("shortLabel") if isinstance(position.get("shortLabel"), str) else "UNK",
        "alternatePositions": alternate_positions,
        "club": club_label,
        "clubId": str(team.get("id") or ""),
        "league": raw.get("leagueName") if isinstance(raw.get("leagueName"), str) else "",
        "nationality": nationality.get("label") if isinstance(nationality.get("label"), str) else "",
        "gender": gender.get("label") if isinstance(gender.get("label"), str) else "",
        "preferredFoot": raw.get("preferredFoot"),
        "skillMoves": raw.get("skillMoves"),
        "weakFoot": raw.get("weakFootAbility"),
        "height": raw.get("height"),
        "weight": raw.get("weight"),
        "birthdate": raw.get("birthdate") if isinstance(raw.get("birthdate"), str) else "",
        "stats": stats,
        "playstyles": playstyles,
        "playstylesPlus": playstyles_plus,
    }


def fold_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    ascii_text = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    ascii_text = ascii_text.lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", ascii_text)).strip()



EXPECTED_FC27_RATINGS = {
    "kylian mbappe": 91,
    "erling haaland": 91,
    "lamine yamal": 90,
}


def validate_fc27_edition(raw_players: list[dict[str, Any]]) -> None:
    observed: dict[str, int] = {}
    for raw in raw_players:
        player = normalise_player(raw)
        if not player:
            continue
        overall = player.get("overall")
        if not isinstance(overall, int):
            continue
        for name_key in player.get("nameKeys", []):
            if name_key in EXPECTED_FC27_RATINGS:
                observed[name_key] = overall

    mismatches = {
        name: {"expected": rating, "observed": observed.get(name)}
        for name, rating in EXPECTED_FC27_RATINGS.items()
        if observed.get(name) != rating
    }
    if mismatches:
        raise RuntimeError(
            "The EA response does not match the verified FC 27 base ratings for "
            + json.dumps(mismatches, ensure_ascii=False)
            + ". EA may be serving an older edition or may have changed its feed; sync aborted."
        )


def request_page(offset: int, cache_buster: int) -> dict[str, Any]:
    params = urlencode({
        "locale": "en",
        "limit": PAGE_SIZE,
        "offset": offset,
        "cb": cache_buster,
    })
    request = Request(
        f"{EA_API}?{params}",
        headers={
            "Accept": "application/json",
            "User-Agent": "Pitchline-EA-FC27-Ratings-Sync/1.0",
            "Referer": EA_RATINGS_PAGE,
            "drop-referrer": EA_RATINGS_PAGE,
            "x-feature": EA_FEATURE_ID,
        },
    )

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
                raise RuntimeError("EA returned an unexpected JSON shape; expected an items array.")
            return payload
        except HTTPError as error:
            if error.code in (401, 403, 404):
                raise RuntimeError(
                    f"EA ratings endpoint returned HTTP {error.code}. The public feed may have changed "
                    "or denied this request. Pitchline will not attempt to bypass that restriction."
                ) from error
            if error.code == 429 or 500 <= error.code < 600:
                if attempt >= MAX_RETRIES:
                    raise RuntimeError(f"EA ratings endpoint kept returning HTTP {error.code}.") from error
                retry_after = error.headers.get("Retry-After")
                try:
                    delay = min(60.0, max(1.0, float(retry_after))) if retry_after else 2.0 ** attempt
                except (TypeError, ValueError):
                    delay = 2.0 ** attempt
                print(f"EA returned HTTP {error.code}; retrying in {delay:.0f}s ({attempt + 1}/{MAX_RETRIES})")
                time.sleep(delay)
                continue
            raise RuntimeError(f"EA ratings endpoint returned HTTP {error.code}.") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt >= MAX_RETRIES:
                raise RuntimeError(f"Could not retrieve valid JSON from EA: {error}") from error
            delay = min(30.0, 2.0 ** attempt)
            print(f"EA request failed; retrying in {delay:.0f}s ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(delay)

    raise RuntimeError("EA request failed unexpectedly.")


def fetch_all_players(page_delay: float = 0.35) -> tuple[list[dict[str, Any]], int]:
    cache_buster = int(time.time())
    first = request_page(0, cache_buster)
    total = first.get("totalItems")
    if isinstance(total, bool) or not isinstance(total, int) or total < 10_000 or total > 100_000:
        raise RuntimeError(
            f"EA reported {total!r} records. Refusing to save this as FC 27; "
            "the edition response may be stale or incomplete."
        )

    first_items = first["items"]
    if not first_items:
        raise RuntimeError("EA returned an empty first page; sync aborted.")

    pages = math.ceil(total / PAGE_SIZE)
    print(f"EA reports {total:,} player items ({pages} pages).")
    raw_players: list[dict[str, Any]] = [
        item for item in first_items if isinstance(item, dict)
    ]

    for page_number, offset in enumerate(range(PAGE_SIZE, total, PAGE_SIZE), start=2):
        payload = request_page(offset, cache_buster)
        if payload.get("totalItems") != total:
            raise RuntimeError("EA's total item count changed during pagination; sync aborted.")
        items = payload.get("items", [])
        if not isinstance(items, list) or not items:
            raise RuntimeError(f"EA returned an empty or invalid page at offset {offset}; sync aborted.")
        raw_players.extend(item for item in items if isinstance(item, dict))
        if page_number == pages or page_number % 10 == 0:
            print(f"Fetched page {page_number}/{pages} ({len(raw_players):,}/{total:,} rows).")
        if page_delay > 0:
            time.sleep(page_delay)

    players_by_id: dict[str, dict[str, Any]] = {}
    for raw in raw_players:
        player = normalise_player(raw)
        if player:
            players_by_id[player["id"]] = player

    players = list(players_by_id.values())
    if len(players) < int(total * 0.95):
        raise RuntimeError(
            f"Only {len(players):,} unique usable players were normalized from {total:,} items. "
            "Sync aborted rather than publishing an incomplete database."
        )

    validate_fc27_edition(raw_players)
    return players, total


def is_mens_player(player: dict[str, Any]) -> bool:
    gender = fold_name(str(player.get("gender") or ""))
    return gender in {"men", "men s football", "mens football", "male", "mens"}


def player_shard_id(name_key: str) -> str:
    compact = re.sub(r"[^a-z0-9]", "", name_key.lower())
    return compact[:2].ljust(2, "_") if compact else "__"


def firestore_player_shards(players: list[dict[str, Any]], synced_at: str) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

    for player in players:
        if not is_mens_player(player):
            continue
        name_keys = player.get("nameKeys") or [fold_name(str(player.get("name") or ""))]
        compact_player = {
            "id": player["id"],
            "name": player["name"],
            "nameKeys": name_keys,
            "overall": player.get("overall"),
            "position": player.get("position") or "UNK",
            "alternatePositions": player.get("alternatePositions") or [],
            "stats": player.get("stats") or {},
            "playstyles": player.get("playstyles") or [],
            "playstylesPlus": player.get("playstylesPlus") or [],
            "club": player.get("club") or "",
            "league": player.get("league") or "",
            "nationality": player.get("nationality") or "",
        }
        for name_key in name_keys:
            if not name_key:
                continue
            shard_id = player_shard_id(name_key)
            grouped[shard_id][player["id"]] = compact_player

    documents: dict[str, dict[str, Any]] = {}
    for shard_id, shard_players in grouped.items():
        records = sorted(
            shard_players.values(),
            key=lambda item: item.get("overall") or 0,
            reverse=True,
        )
        document = {
            "shardId": shard_id,
            "playerCount": len(records),
            "players": records,
            "database": "EA SPORTS FC 27",
            "syncedAt": synced_at,
        }
        encoded_size = len(json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        if encoded_size >= 900_000:
            raise RuntimeError(
                f"EA player-name shard '{shard_id}' would exceed Firestore's safe document-size budget ({encoded_size:,} bytes)."
            )
        documents[shard_id] = document

    if len(documents) < 100:
        raise RuntimeError(
            f"Only {len(documents)} name shards were built. Refusing to upload an incomplete or incorrectly parsed player database."
        )
    return documents

def upload_firestore(documents: dict[str, dict[str, Any]], project_id: str) -> None:
    try:
        from google.cloud import firestore
    except ImportError as error:
        raise RuntimeError(
            "Firestore upload needs google-cloud-firestore. Run: "
            "python -m pip install -r scripts/requirements-ea-fc27.txt"
        ) from error

    client = firestore.Client(project=project_id)
    collection = client.collection("ea_fc27_player_shards")
    existing = {snapshot.id for snapshot in collection.stream()}
    desired = set(documents)
    stale = existing - desired
    operations: list[tuple[str, Any, Any]] = []

    for document_id, document in documents.items():
        operations.append(("set", collection.document(document_id), document))
    for document_id in stale:
        operations.append(("delete", collection.document(document_id), None))

    batch_size = 400
    for start in range(0, len(operations), batch_size):
        batch = client.batch()
        for action, reference, value in operations[start:start + batch_size]:
            if action == "set":
                batch.set(reference, value)
            else:
                batch.delete(reference)
        batch.commit()
        print(f"Firestore sync: {min(start + batch_size, len(operations))}/{len(operations)} writes.")

    unique_player_ids = {
        str(player.get("id"))
        for document in documents.values()
        for player in document.get("players", [])
        if player.get("id") is not None
    }
    metadata = {
        "database": "EA SPORTS FC 27",
        "source": "EA public player ratings page",
        "playerCount": len(unique_player_ids),
        "shardCount": len(documents),
        "syncedAt": now_iso(),
    }
    client.collection("ea_fc27_meta").document("current").set(metadata)
    print(
        f"Uploaded {metadata['playerCount']:,} men's players across "
        f"{metadata['shardCount']:,} player-name shards to project {project_id}."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync public EA FC 27 player ratings to Pitchline.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Local normalized JSON output path.")
    parser.add_argument("--page-delay", type=float, default=0.35, help="Delay between EA pages in seconds (default: 0.35).")
    parser.add_argument("--probe-only", action="store_true", help="Fetch and validate only the first EA page.")
    parser.add_argument("--upload-firestore", action="store_true", help="Upload men's club squads to Firestore after download.")
    parser.add_argument("--project-id", default="pitchline-app", help="Google Cloud/Firebase project ID.")
    args = parser.parse_args()

    if args.page_delay < 0 or args.page_delay > 10:
        parser.error("--page-delay must be between 0 and 10 seconds.")

    try:
        if args.probe_only:
            sample = request_page(0, int(time.time()))
            total = sample.get("totalItems")
            items = sample.get("items") or []
            if not isinstance(total, int) or total < 10_000 or not isinstance(items, list):
                raise RuntimeError(f"EA probe returned an unexpected database size or page shape: totalItems={total!r}.")
            validate_fc27_edition([item for item in items if isinstance(item, dict)])
            print(f"EA FC 27 probe passed: totalItems={total:,}, firstPageItems={len(items)}; verified top-player ratings.")
            return 0

        players, total = fetch_all_players(args.page_delay)
        synced_at = now_iso()
        payload = {
            "database": "EA SPORTS FC 27",
            "source": EA_API,
            "ratingsPage": EA_RATINGS_PAGE,
            "retrievedAt": synced_at,
            "totalItems": total,
            "normalizedPlayerCount": len(players),
            "players": players,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(args.output)
        print(f"Saved {len(players):,} normalized players to {args.output}.")

        if args.upload_firestore:
            documents = firestore_player_shards(players, synced_at)
            upload_firestore(documents, args.project_id)
        else:
            men = sum(1 for player in players if is_mens_player(player))
            shards = len(firestore_player_shards(players, synced_at))
            print(
                f"Firestore upload not requested. Found {men:,} men's players across "
                f"{shards:,} name shards. Re-run with --upload-firestore after configuring Google credentials."
            )
        return 0
    except Exception as error:
        print(f"EA FC 27 sync failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
