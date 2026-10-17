"""Canonical xp balance, with read compatibility for older totalXp records."""


def read_xp(record, default=None):
    # Explicit xp always wins, including zero. Never fall back from invalid xp.
    value = record["xp"] if "xp" in record else record.get("totalXp", default)
    if type(value) is not int or not 0 <= value <= 2**63 - 1:
        raise ValueError("XP balance must be a nonnegative Firestore integer")
    return value
