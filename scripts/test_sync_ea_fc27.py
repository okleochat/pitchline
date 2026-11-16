import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("sync_ea_fc27.py")
SPEC = importlib.util.spec_from_file_location("sync_ea_fc27", SCRIPT)
assert SPEC and SPEC.loader
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


def ea_player(player_id, club, gender="Men's Football"):
    return {
        "id": str(player_id),
        "firstName": "Test",
        "lastName": "Player",
        "commonName": "",
        "overallRating": 81,
        "gender": {"id": "1", "label": gender},
        "team": {"id": "99", "label": club},
        "nationality": {"id": "1", "label": "Testland"},
        "leagueName": "Test League",
        "position": {"shortLabel": "CM"},
        "alternatePositions": [{"shortLabel": "CDM"}],
        "playerAbilities": [
            {"label": "Intercept", "type": {"id": "playStyle"}},
            {"label": "Anticipate", "type": {"id": "playStylePlus"}},
        ],
        "stats": {
            "pac": {"value": 77, "diff": 0},
            "sho": {"value": 73, "diff": 0},
            "pas": {"value": 84, "diff": 0},
            "dri": {"value": 82, "diff": 0},
            "def": {"value": 71, "diff": 0},
            "phy": {"value": 75, "diff": 0},
            "vision": {"value": 86, "diff": 0},
        },
    }


class SyncEaFc27Tests(unittest.TestCase):
    def test_normalises_ea_raw_player_and_attribute_values(self):
        player = sync.normalise_player(ea_player(1, "Racing de Santander"))
        self.assertIsNotNone(player)
        self.assertEqual(player["name"], "Test Player")
        self.assertEqual(player["nameKeys"], ["test player"])
        self.assertEqual(player["overall"], 81)
        self.assertEqual(player["position"], "CM")
        self.assertEqual(player["stats"]["pas"], 84)
        self.assertEqual(player["playstyles"], ["Intercept"])
        self.assertEqual(player["playstylesPlus"], ["Anticipate"])

    def test_fc27_edition_validation_checks_official_top_ratings(self):
        players = [
            {**ea_player(11, "Club A"), "firstName": "Kylian", "lastName": "Mbappe", "overallRating": 91},
            {**ea_player(12, "Club B"), "firstName": "Erling", "lastName": "Haaland", "overallRating": 91},
            {**ea_player(13, "Club C"), "firstName": "Lamine", "lastName": "Yamal", "overallRating": 90},
        ]
        sync.validate_fc27_edition(players)

    def test_fc27_edition_validation_rejects_stale_ratings(self):
        players = [
            {**ea_player(11, "Club A"), "firstName": "Kylian", "lastName": "Mbappe", "overallRating": 90},
            {**ea_player(12, "Club B"), "firstName": "Erling", "lastName": "Haaland", "overallRating": 91},
            {**ea_player(13, "Club C"), "firstName": "Lamine", "lastName": "Yamal", "overallRating": 89},
        ]
        with self.assertRaises(RuntimeError):
            sync.validate_fc27_edition(players)

    def test_prefixed_ea_detail_fields_normalize_to_pitchline_attribute_names(self):
        raw = ea_player(5, "Test Club")
        raw["stats"] = {
            "attackingFinishing": {"value": 91},
            "mentalityVision": {"value": 88},
            "defendingStandingTackle": {"value": 79},
            "goalkeepingReflexes": {"value": 90},
        }
        player = sync.normalise_player(raw)
        self.assertEqual(player["stats"]["finishing"], 91)
        self.assertEqual(player["stats"]["vision"], 88)
        self.assertEqual(player["stats"]["standingTackle"], 79)
        self.assertEqual(player["stats"]["gkReflexes"], 90)

    def test_string_fields_and_snake_case_attributes_are_supported(self):
        raw = ea_player(6, "Test Club")
        raw["team"] = "Test Club"
        raw["gender"] = "Men's Football"
        raw["nationality"] = "Testland"
        raw["position"] = "CM"
        raw["stats"] = {
            "attacking_finishing": {"value": 89},
            "movement_acceleration": {"value": 91},
            "goalkeeping_reflexes": {"value": 70},
        }
        player = sync.normalise_player(raw)
        self.assertEqual(player["club"], "Test Club")
        self.assertEqual(player["gender"], "Men's Football")
        self.assertEqual(player["nationality"], "Testland")
        self.assertEqual(player["position"], "CM")
        self.assertEqual(player["stats"]["finishing"], 89)
        self.assertEqual(player["stats"]["acceleration"], 91)
        self.assertEqual(player["stats"]["gkReflexes"], 70)

    def test_gender_filter_includes_mens_records_and_excludes_womens(self):
        men = sync.normalise_player(ea_player(1, "Club A", "Men's Football"))
        women = sync.normalise_player(ea_player(2, "Club B", "Women's Football"))
        self.assertTrue(sync.is_mens_player(men))
        self.assertFalse(sync.is_mens_player(women))

    def test_builds_compact_mens_player_name_shards(self):
        players = [
            sync.normalise_player(ea_player(1, "Racing de Santander")),
            sync.normalise_player(ea_player(2, "Real Sociedad")),
            sync.normalise_player(ea_player(3, "Women's Club", "Women's Football")),
        ]
        documents = sync.firestore_player_shards(players, "2026-11-17T00:00:00Z")
        self.assertIn("te", documents)
        shard = documents["te"]
        self.assertEqual(shard["playerCount"], 2)
        self.assertEqual(shard["database"], "EA SPORTS FC 27")
        self.assertEqual({player["id"] for player in shard["players"]}, {"1", "2"})
        self.assertEqual(shard["syncedAt"], "2026-11-17T00:00:00Z")

    def test_snapshot_collection_name_is_versioned_and_safe(self):
        self.assertEqual(
            sync.snapshot_collection_name("2026-11-17T05:23:00Z"),
            "ea_fc27_players_20261117T052300Z",
        )

    def test_shard_ids_use_first_two_normalized_name_characters(self):
        self.assertEqual(sync.player_shard_id("kylian mbappe"), "ky")
        self.assertEqual(sync.player_shard_id("é"), "e_")
        self.assertEqual(sync.player_shard_id(""), "__")

    def test_players_without_a_club_can_still_be_indexed_by_name(self):
        raw = ea_player(4, "")
        raw["team"] = None
        player = sync.normalise_player(raw)
        self.assertIsNotNone(player)
        self.assertEqual(player["club"], "")
        self.assertEqual(sync.player_shard_id(player["nameKeys"][0]), "te")

    def test_bad_or_unidentified_records_are_ignored(self):
        self.assertIsNone(sync.normalise_player({}))
        self.assertIsNone(sync.normalise_player({"id": "1", "firstName": "", "lastName": ""}))


if __name__ == "__main__":
    unittest.main()
