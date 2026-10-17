import unittest

from backend.xp import quest_xp_reward, read_xp, xp_for_stop


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

    def test_multi_stop_rewards_split_evenly_and_preserve_the_total(self):
        self.assertEqual([xp_for_stop(40, 2, index) for index in range(2)], [20, 20])
        rewards = [xp_for_stop(41, 3, index) for index in range(3)]
        self.assertEqual(rewards, [14, 14, 13])
        self.assertEqual(sum(rewards), 41)
        self.assertEqual(xp_for_stop(40, 1, 0), 40)

    def test_stop_reward_split_rejects_invalid_indexes_and_totals(self):
        for values in [(True, 2, 0), (5, 0, 0), (5, 2, 2), (-1, 2, 0)]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                xp_for_stop(*values)
