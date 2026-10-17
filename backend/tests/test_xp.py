import unittest

from backend.xp import quest_xp_reward, read_xp


class XpTests(unittest.TestCase):
    def test_quest_reward_uses_duration_with_rounding_and_bounds(self):
        for minutes, expected in [
            (1, 5), (15, 5), (16, 10), (30, 10), (31, 15),
            (120, 40), (150, 50), (1000, 50),
        ]:
            with self.subTest(minutes=minutes):
                self.assertEqual(quest_xp_reward(minutes), expected)

    def test_quest_reward_rejects_invalid_duration(self):
        for minutes in [0, -1, True, 1.5, "30", None]:
            with self.subTest(minutes=minutes), self.assertRaises(ValueError):
                quest_xp_reward(minutes)

    def test_canonical_balance_wins_including_zero(self):
        self.assertEqual(read_xp({"xp": 0, "totalXp": 100}), 0)

    def test_legacy_balance_and_new_profile_default(self):
        self.assertEqual(read_xp({"totalXp": 42}), 42)
        self.assertEqual(read_xp({}, default=0), 0)

    def test_invalid_canonical_balance_never_falls_back(self):
        for value in [None, True, -1, 1.5, "25", 2**63, float("nan")]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                read_xp({"xp": value, "totalXp": 100})
        with self.assertRaises(ValueError):
            read_xp({})
