import unittest

from backend.xp import read_xp


class XpTests(unittest.TestCase):
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
