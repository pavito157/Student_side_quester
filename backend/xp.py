"""Canonical xp balance, with read compatibility for older totalXp records."""


def quest_xp_reward(estimated_minutes):
    """Calculate a bounded quest reward from validated generated duration."""
    if type(estimated_minutes) is not int or estimated_minutes <= 0:
        raise ValueError("Quest duration must be a positive integer number of minutes")
    return min(50, max(5, ((estimated_minutes + 14) // 15) * 5))


def read_xp(record, default=None):
    # Explicit xp always wins, including zero. Never fall back from invalid xp.
    value = record["xp"] if "xp" in record else record.get("totalXp", default)
    if type(value) is not int or not 0 <= value <= 2**63 - 1:
        raise ValueError("XP balance must be a nonnegative Firestore integer")
    return value
