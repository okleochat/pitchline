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

STAT_ALIASES = {
    "pac": ("pac", "pace"),
    "sho": ("sho", "shooting"),
    "pas": ("pas", "passing"),
    "dri": ("dri",),
    "def": ("def", "defending"),
    "phy": ("phy", "physicality"),
    "crossing": ("crossing", "attackingCrossing", "attacking_crossing"),
    "finishing": ("finishing", "attackingFinishing", "attacking_finishing"),
    "headingAccuracy": ("headingAccuracy", "attackingHeadingAccuracy", "attacking_heading_accuracy", "heading"),
    "shortPassing": ("shortPassing", "attackingShortPassing", "attacking_short_passing"),
    "volleys": ("volleys", "attackingVolleys", "attacking_volleys"),
    "dribbling": ("dribbling", "skillDribbling", "skill_dribbling"),
    "curve": ("curve", "skillCurve", "skill_curve"),
    "freeKickAccuracy": ("freeKickAccuracy", "skillFkAccuracy", "skill_fk_accuracy", "fkAccuracy", "freeKick"),
    "longPassing": ("longPassing", "skillLongPassing", "skill_long_passing"),
    "ballControl": ("ballControl", "skillBallControl", "skill_ball_control"),
    "acceleration": ("acceleration", "movementAcceleration", "movement_acceleration"),
    "sprintSpeed": ("sprintSpeed", "movementSprintSpeed", "movement_sprint_speed"),
    "agility": ("agility", "movementAgility", "movement_agility"),
    "reactions": ("reactions", "movementReactions", "movement_reactions"),
    "balance": ("balance", "movementBalance", "movement_balance"),
    "shotPower": ("shotPower", "powerShotPower", "power_shot_power"),
    "jumping": ("jumping", "powerJumping", "power_jumping"),
    "stamina": ("stamina", "powerStamina", "power_stamina"),
    "strength": ("strength", "powerStrength", "power_strength"),
    "longShots": ("longShots", "powerLongShots", "power_long_shots"),
    "aggression": ("aggression", "mentalityAggression", "mentality_aggression"),
    "interceptions": ("interceptions", "mentalityInterceptions", "mentality_interceptions"),
    "positioning": ("positioning", "mentalityPositioning", "mentality_positioning"),
    "vision": ("vision", "mentalityVision", "mentality_vision"),
    "penalties": ("penalties", "mentalityPenalties", "mentality_penalties"),
    "composure": ("composure", "mentalityComposure", "mentality_composure"),
    "defensiveAwareness": ("defensiveAwareness", "defendingAwareness", "defending_awareness", "marking"),
    "standingTackle": ("standingTackle", "defendingStandingTackle", "defending_standing_tackle"),
    "slidingTackle": ("slidingTackle", "defendingSlidingTackle", "defending_sliding_tackle"),
    "gkDiving": ("gkDiving", "goalkeepingDiving", "goalkeeping_diving"),
    "gkHandling": ("gkHandling", "goalkeepingHandling", "goalkeeping_handling"),
    "gkKicking": ("gkKicking", "goalkeepingKicking", "goalkeeping_kicking"),
    "gkPositioning": ("gkPositioning", "goalkeepingPositioning", "goalkeeping_positioning"),
    "gkReflexes": ("gkReflexes", "goalkeepingReflexes", "goalkeeping_reflexes"),
}


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


def label_value(value: Any, *keys: str) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in keys:
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    return ""


def normalise_player(raw: dict[str, Any]) -> dict[str, Any] | None:
    player_id = raw.get("id")
    team = as_dict(raw.get("team"))
    position = raw.get("position")
    gender = raw.get("gender")
    nationality = raw.get("nationality")

    if player_id is None or not str(player_id).strip():
        return None
    club_label = label_value(raw.get("team"), "label", "name", "displayName")

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
    stats: dict[str, int | float] = {}
    for canonical, aliases in STAT_ALIASES.items():
        for raw_key in aliases:
            value = stat_number(raw_stats, raw_key)
            if value is not None:
                stats[canonical] = value
                break

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
    if isinstance(overall, dict):
        overall = overall.get("value")
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
        "position": label_value(position, "shortLabel", "abbreviation", "name") or "UNK",
        "alternatePositions": alternate_positions,
        "club": club_label,
        "clubId": str(team.get("id") or ""),
        "league": raw.get("leagueName") if isinstance(raw.get("leagueName"), str) else "",
        "nationality": label_value(nationality, "label", "name", "displayName"),
        "gender": label_value(gender, "label", "name", "displayName"),
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
    # Keep this mapping in sync with normalisePlayerName() in
    # src/lib/pro-player-model.ts. NFD/NFKD alone do not transliterate
    # characters such as ø, ł, đ, ð, þ, æ, œ, ß, ı, ħ and ŋ.
    transliteration = str.maketrans({
        "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th",
        "æ": "ae", "œ": "oe", "ß": "ss", "ı": "i", "ħ": "h", "ŋ": "n",
    })
    decomposed = unicodedata.normalize("NFKD", value.lower().translate(transliteration))
    ascii_text = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    ascii_text = ascii_text.replace("&", " and ")
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
    compact = re.sub(r"[^a-z0-9]", "", fold_name(name_key))
    return compact[:4].ljust(4, "_") if compact else "____"


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

    if not documents:
        raise RuntimeError("No men's EA player-name shards were created; refusing to upload an empty database.")
    return documents

def snapshot_collection_name(synced_at: str) -> str:
    token = re.sub(r"[^A-Za-z0-9]", "", synced_at)
    if not token:
        raise RuntimeError("A valid sync timestamp is required to publish an EA snapshot.")
    return f"ea_fc27_players_{token}"


def delete_firestore_collection(client: Any, collection: Any, batch_size: int = 400) -> None:
    snapshots = list(collection.stream())
    for start in range(0, len(snapshots), batch_size):
        batch = client.batch()
        for snapshot in snapshots[start:start + batch_size]:
            batch.delete(snapshot.reference)
        batch.commit()


def upload_firestore(
    documents: dict[str, dict[str, Any]],
    project_id: str,
    synced_at: str,
) -> None:
    try:
        from google.cloud import firestore
    except ImportError as error:
        raise RuntimeError(
            "Firestore upload needs google-cloud-firestore. Run: "
            "python -m pip install -r scripts/requirements-ea-fc27.txt"
        ) from error

    client = firestore.Client(project=project_id)
    metadata_ref = client.collection("ea_fc27_meta").document("current")
    previous_metadata = metadata_ref.get().to_dict() or {}
    previous_collection_name = previous_metadata.get("activeCollection")
    retired_collection_name = previous_metadata.get("previousCollection")

    # Stage a complete new version. The app keeps reading the previous
    # snapshot until every shard is committed and verified.
    collection_name = snapshot_collection_name(synced_at)
    collection = client.collection(collection_name)
    desired_ids = set(documents)
    operations = [
        (collection.document(document_id), document)
        for document_id, document in documents.items()
    ]

    batch_size = 400
    for start in range(0, len(operations), batch_size):
        batch = client.batch()
        for reference, value in operations[start:start + batch_size]:
            batch.set(reference, value)
        batch.commit()
        print(f"Firestore staging: {min(start + batch_size, len(operations))}/{len(operations)} shard writes.")

    published_ids = {snapshot.id for snapshot in collection.stream()}
    if published_ids != desired_ids:
        missing = sorted(desired_ids - published_ids)[:10]
        unexpected = sorted(published_ids - desired_ids)[:10]
        raise RuntimeError(
            "Firestore snapshot verification failed; the previous active database was left unchanged. "
            f"Missing shards: {missing}; unexpected shards: {unexpected}."
        )

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
        "syncedAt": synced_at,
        "snapshotId": collection_name.removeprefix("ea_fc27_players_"),
        "activeCollection": collection_name,
        # Retain the just-replaced active snapshot for instances with a cached
        # collection pointer. It becomes eligible for cleanup on the next sync.
        "previousCollection": (
            previous_collection_name
            if isinstance(previous_collection_name, str)
            and previous_collection_name.startswith("ea_fc27_players_")
            and previous_collection_name != collection_name
            else None
        ),
    }

    # One metadata write is the publish/commit point used by the app.
    metadata_ref.set(metadata)
    print(
        f"Published {metadata['playerCount']:,} men's players across "
        f"{metadata['shardCount']:,} verified name shards to project {project_id}. "
        f"Active collection: {collection_name}."
    )

    # Keep the just-replaced active version for one full refresh cycle. This
    # protects app instances that briefly cache the old activeCollection value.
    # Delete only the older retired snapshot, after the new pointer is published.
    if (
        isinstance(retired_collection_name, str)
        and retired_collection_name.startswith("ea_fc27_players_")
        and retired_collection_name not in {collection_name, previous_collection_name}
    ):
        try:
            delete_firestore_collection(client, client.collection(retired_collection_name), batch_size)
            print(f"Removed retired EA player snapshot: {retired_collection_name}.")
        except Exception as error:
            print(
                "Warning: the new EA snapshot is active, but the previous snapshot "
                f"could not be cleaned up: {error}",
                file=sys.stderr,
            )

def main() -> int:
    parser = argparse.ArgumentParser(description="Sync public EA FC 27 player ratings to Pitchline.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Local normalized JSON output path.")
    parser.add_argument("--page-delay", type=float, default=0.35, help="Delay between EA pages in seconds (default: 0.35).")
    parser.add_argument("--probe-only", action="store_true", help="Fetch and validate only the first EA page.")
    parser.add_argument("--upload-firestore", action="store_true", help="Upload men's player-name shards to Firestore after download.")
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
            upload_firestore(documents, args.project_id, synced_at)
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
