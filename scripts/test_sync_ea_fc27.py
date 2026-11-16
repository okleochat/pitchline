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

    def test_gender_filter_includes_mens_records_and_excludes_womens(self):
        men = sync.normalise_player(ea_player(1, "Club A", "Men's Football"))
        women = sync.normalise_player(ea_player(2, "Club B", "Women's Football"))
        self.assertTrue(sync.is_mens_player(men))
        self.assertFalse(sync.is_mens_player(women))

    def test_team_document_id_matches_accent_folded_slug(self):
        self.assertEqual(sync.team_document_id("Atlético Madrid"), "atletico-madrid")
        self.assertEqual(sync.team_document_id("Racing de Santander"), "racing-de-santander")

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

    def test_shard_ids_use_first_two_normalized_name_characters(self):
        self.assertEqual(sync.player_shard_id("kylian mbappe"), "ky")
        self.assertEqual(sync.player_shard_id("é"), "e_")
        self.assertEqual(sync.player_shard_id(""), "__")

    def test_bad_or_unidentified_records_are_ignored(self):
        self.assertIsNone(sync.normalise_player({}))
        self.assertIsNone(sync.normalise_player({"id": "1", "team": {"label": "  "}}))


if __name__ == "__main__":
    unittest.main()
