"""Compatibility name for the existing Firebase ID-token dependency.

Clerk sessions are exchanged only through /auth/firebase. Protected quest routes
and callers of get_current_user_id use the resulting Firebase ID token.
Importing this module does not load credentials, environment files, or JWKS.
"""

from backend.auth.firebase_helpers import current_uid as get_current_user_id

__all__ = ["get_current_user_id"]
