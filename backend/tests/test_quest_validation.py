import math
import unittest

from backend.quest_validation import calculate_distance, valid_number, validate_completion


class DistanceTests(unittest.TestCase):
    def test_identical_coordinates(self):
        self.assertEqual(calculate_distance(29.65, -82.34, 29.65, -82.34), 0)

    def test_equator_one_degree(self):
        self.assertAlmostEqual(calculate_distance(0, 0, 0, 1), 111_194.9266, places=3)

    def test_antipodes(self):
        self.assertAlmostEqual(calculate_distance(0, 0, 0, 180), math.pi * 6_371_000)

    def test_antimeridian_short_path_and_symmetry(self):
        forward = calculate_distance(0, 179.999, 0, -179.999)
        self.assertAlmostEqual(forward, 222.38985, places=3)
        self.assertAlmostEqual(forward, calculate_distance(0, -179.999, 0, 179.999))

    def test_poles(self):
        self.assertAlmostEqual(calculate_distance(90, -180, 90, 180), 0)

    def test_bad_coordinates_raise(self):
        for latitude, longitude in [(91, 0), (-91, 0), (0, 181), (0, -181),
                                    (True, 0), (None, 0), ("29", 0),
                                    (float("nan"), 0), (0, float("inf")), (10**1000, 0)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                with self.assertRaises(ValueError):
                    calculate_distance(latitude, longitude, 0, 0)
                with self.assertRaises(ValueError):
                    calculate_distance(0, 0, latitude, longitude)

    def test_valid_number_does_not_coerce_or_overflow(self):
        for value in [True, False, None, "5", float("nan"), float("inf"), -float("inf"), 10**1000]:
            with self.subTest(value=value):
                self.assertFalse(valid_number(value))
        self.assertTrue(valid_number(0))
        self.assertTrue(valid_number(1.5))


class CompletionValidationTests(unittest.TestCase):
    def setUp(self):
        self.assignment = {"userId": "student", "questId": "quest", "status": "assigned"}
        self.quest = {"isActive": True, "latitude": 0, "longitude": 0,
                      "radiusMeters": 100, "xpReward": 25}

    def validate(self, **changes):
        arguments = dict(user_id="student", assignment=self.assignment, quest=self.quest,
                         latitude=0, longitude=0, accuracy=10)
        arguments.update(changes)
        return validate_completion(**arguments)

    def test_valid_reading_does_not_mutate_records(self):
        before = (self.assignment.copy(), self.quest.copy())
        self.assertTrue(self.validate()["valid"])
        self.assertEqual((self.assignment, self.quest), before)

    def test_owner_and_state_checks(self):
        for change in [{"userId": "other"}, {"status": "completed"},
                       {"status": "cancelled"}, {"status": None}]:
            with self.subTest(change=change):
                self.assertFalse(self.validate(assignment={**self.assignment, **change})["valid"])
        self.assertFalse(self.validate(user_id=None, assignment={"status": "assigned"})["valid"])

    def test_inactive_quest_rejected(self):
        for active in [False, None, 1, "true"]:
            self.assertFalse(self.validate(quest={**self.quest, "isActive": active})["valid"])

    def test_invalid_user_coordinates(self):
        for latitude, longitude in [(91, 0), (-91, 0), (0, 181), (0, -181),
                                    (True, 0), ("0", 0), (None, 0),
                                    (float("nan"), 0), (0, float("inf"))]:
            with self.subTest(latitude=latitude, longitude=longitude):
                self.assertFalse(self.validate(latitude=latitude, longitude=longitude)["valid"])

    def test_invalid_accuracy(self):
        for accuracy in [0, -1, True, "10", None, float("nan"), float("inf"), 10**1000]:
            with self.subTest(accuracy=accuracy):
                self.assertFalse(self.validate(accuracy=accuracy)["valid"])

    def test_accuracy_limit_inclusive_and_configurable(self):
        self.assertTrue(self.validate(accuracy=50)["valid"])
        self.assertFalse(self.validate(accuracy=50.01)["valid"])
        self.assertTrue(self.validate(accuracy=60, max_accuracy=60)["valid"])
        for maximum in [0, -1, True, None, "50", float("nan"), float("inf")]:
            self.assertFalse(self.validate(max_accuracy=maximum)["valid"])

    def test_destination_configuration(self):
        for field, values in {
            "latitude": [None, 91, True, float("nan")],
            "longitude": [None, -181, False, float("inf")],
            "radiusMeters": [None, 0, -1, True, "100", float("inf"), float("nan")],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    self.assertFalse(self.validate(quest={**self.quest, field: value})["valid"])

    def test_accuracy_circle_must_fit(self):
        # About 94.5m from a 100m destination: center is inside, 10m circle is not.
        result = self.validate(longitude=0.00085)
        self.assertLess(result["distanceMeters"], 100)
        self.assertFalse(result["valid"])
        self.assertFalse(self.validate(longitude=0.002)["valid"])

    def test_exact_boundary_and_just_outside_without_rounding(self):
        distance = calculate_distance(0, 0.0005, 0, 0)
        self.quest["radiusMeters"] = distance + 10
        self.assertTrue(self.validate(longitude=0.0005)["valid"])
        self.quest["radiusMeters"] -= 0.000001
        self.assertFalse(self.validate(longitude=0.0005)["valid"])

    def test_accuracy_larger_than_radius_even_at_destination(self):
        self.assertFalse(self.validate(quest={**self.quest, "radiusMeters": 5})["valid"])


if __name__ == "__main__":
    unittest.main()
