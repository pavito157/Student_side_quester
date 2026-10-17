"""Compatibility shim for Backend 1; share the default Firebase app and ADC.

Importing this module alone performs no credential lookup or database access.
Existing `from firebase_config import db` callers still obtain the shared client.
New routes should use Depends(get_db) so authentication runs before DB access.
"""

from backend.firebase_helpers import get_db, get_firebase_app


def __getattr__(name):
    if name == "db":
        return get_db()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
