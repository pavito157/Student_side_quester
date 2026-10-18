"""Real JWT signature checks with mock Clerk/Firebase provider boundaries."""

import os
import time
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from firebase_admin import auth

from backend.api import auth_routes
from backend.auth import firebase_helpers


class BridgeRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        app = FastAPI()
        app.include_router(auth_routes.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"CLERK_ISSUER": "https://example.clerk.accounts.dev",
                               "CLERK_SECRET_KEY": "test-secret",
                               "FRONTEND_ORIGINS": "http://localhost:5173"}).start()
        self.keys = patch.object(auth_routes, "clerk_signing_keys").start()
        self.keys.return_value.get_signing_key_from_jwt.return_value = SimpleNamespace(key=self.key.public_key())
        self.user = {"id": "user_student", "first_name": "Test", "last_name": "Student",
                     "primary_email_address_id": "email_primary", "banned": False, "locked": False,
                     "email_addresses": [{"id": "email_primary", "email_address": "Student@UFL.EDU",
                                          "verification": {"status": "verified"}}]}
        self.lookup = patch.object(auth_routes.httpx, "get", side_effect=lambda *args, **kwargs:
                                   httpx.Response(200, json=self.user, request=httpx.Request("GET", args[0]))).start()
        patch.object(auth_routes, "get_firebase_app").start()
        self.db = Mock()
        patch.object(auth_routes, "get_db", return_value=self.db).start()
        self.sync = patch.object(auth_routes, "synchronize_firebase_user").start()
        self.profile = patch.object(auth_routes, "ensure_profile").start()
        self.mint = patch.object(auth_routes.auth, "create_custom_token", return_value=b"firebase-custom-token").start()
        now = int(time.time())
        self.claims = {"iss": "https://example.clerk.accounts.dev", "sub": "user_student",
                       "sid": "sess_student", "azp": "http://localhost:5173",
                       "iat": now, "nbf": now - 1, "exp": now + 60}

    def token(self, changes=None, key=None):
        return jwt.encode({**self.claims, **(changes or {})}, key or self.key,
                          algorithm="RS256", headers={"kid": "test-key"})

    def post(self, token=None, body=None):
        return self.client.post("/auth/firebase", json={} if body is None else body,
                                headers={"Authorization": "Bearer " + (token or self.token())})

    def test_verified_identity_is_derived_from_signed_clerk_session(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"uid": "user_student", "firebaseCustomToken": "firebase-custom-token"})
        self.assertEqual(response.headers["cache-control"], "no-store")
        identity = {"uid": "user_student", "email": "student@ufl.edu", "displayName": "Test Student"}
        self.sync.assert_called_once_with(identity)
        self.profile.assert_called_once_with(self.db, identity)
        self.mint.assert_called_once_with("user_student")
        self.lookup.assert_called_once_with("https://api.clerk.com/v1/users/user_student",
                                            headers={"Authorization": "Bearer test-secret"}, timeout=5)

    def test_missing_or_wrong_authentication(self):
        for headers in [{}, {"Authorization": "Basic abc"}]:
            self.assertEqual(self.client.post("/auth/firebase", json={}, headers=headers).status_code, 401)
        self.lookup.assert_not_called()
        self.mint.assert_not_called()

    def test_forged_expired_wrong_issuer_or_origin_tokens(self):
        bad_tokens = [self.token(key=self.other_key), "not-a-token", self.token({"exp": int(time.time()) - 60}),
                      self.token({"iss": "https://wrong.clerk.accounts.dev"}),
                      self.token({"azp": "https://other-site.example"}),
                      self.token({"nbf": int(time.time()) + 60}), self.token({"sts": "pending"}),
                      self.token({"sub": "user_bad/path"}), self.token({"sid": ""})]
        for token in bad_tokens:
            with self.subTest(token=token[:12]):
                self.assertEqual(self.post(token).status_code, 401)
        self.lookup.assert_not_called()
        self.mint.assert_not_called()

    def test_missing_required_session_claims(self):
        for claim in ["iss", "sub", "sid", "azp", "exp", "iat", "nbf"]:
            claims = {key: value for key, value in self.claims.items() if key != claim}
            token = jwt.encode(claims, self.key, algorithm="RS256")
            self.assertEqual(self.post(token).status_code, 401)
        self.lookup.assert_not_called()

    def test_algorithm_substitution_is_rejected(self):
        token = jwt.encode(self.claims, "attacker-controlled-secret-at-least-32-bytes", algorithm="HS256")
        self.assertEqual(self.post(token).status_code, 401)
        self.mint.assert_not_called()

    def test_client_cannot_supply_identity_or_profile(self):
        for field in ["uid", "userId", "email", "email_verified", "xp", "totalXp", "dormId"]:
            self.assertEqual(self.post(body={field: "forged"}).status_code, 422)
        self.mint.assert_not_called()

    def test_unverified_or_invalid_primary_email_is_rejected(self):
        original = deepcopy(self.user)
        for email, status in [("student@gmail.com", "unverified"), ("ufl.edu", "verified"),
                              (None, "verified"), ("@gmail.com", "verified"), ("student@", "verified")]:
            self.user = deepcopy(original)
            self.user["email_addresses"][0].update(email_address=email, verification={"status": status})
            # A verified secondary email never substitutes for the primary one.
            self.user["email_addresses"].append({"id": "secondary", "email_address": "other@gmail.com",
                                                 "verification": {"status": "verified"}})
            self.assertEqual(self.post().status_code, 403)
        self.mint.assert_not_called()

    def test_verified_primary_emails_from_any_domain_can_sign_in(self):
        for email in ["Teammate@gmail.com", "tester@outlook.com", "tester@another-university.edu"]:
            with self.subTest(email=email):
                self.user["email_addresses"][0]["email_address"] = email
                self.assertEqual(self.post().status_code, 200)
                self.assertEqual(self.sync.call_args.args[0]["email"], email.lower())

    def test_banned_or_locked_accounts_are_rejected(self):
        for field in ["banned", "locked"]:
            self.user[field] = True
            self.assertEqual(self.post().status_code, 403)
            self.user[field] = False
        self.mint.assert_not_called()

    def test_provider_failures_fail_closed(self):
        self.lookup.side_effect = httpx.TimeoutException("No response")
        self.assertEqual(self.post().status_code, 503)
        self.mint.assert_not_called()
        self.lookup.side_effect = lambda *args, **kwargs: httpx.Response(
            401, request=httpx.Request("GET", args[0]))
        self.assertEqual(self.post().status_code, 503)

    def test_mismatched_provider_identity_is_rejected(self):
        self.user["id"] = "user_someone_else"
        self.assertEqual(self.post().status_code, 503)
        self.mint.assert_not_called()

    def test_missing_configuration_returns_clear_unavailable_status(self):
        with patch.dict(os.environ, {"CLERK_ISSUER": "", "CLERK_SECRET_KEY": ""}):
            self.assertEqual(self.post().status_code, 503)
        self.lookup.assert_not_called()
        self.mint.assert_not_called()

    def test_key_service_unavailable(self):
        self.keys.return_value.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientConnectionError("Unavailable")
        self.assertEqual(self.post().status_code, 503)
        self.lookup.assert_not_called()

    def test_email_collision_does_not_auto_link_accounts(self):
        self.sync.side_effect = auth.EmailAlreadyExistsError("Collision", None, None)
        self.assertEqual(self.post().status_code, 409)
        self.profile.assert_not_called()
        self.mint.assert_not_called()

    def test_profile_failure_does_not_issue_custom_token(self):
        self.profile.side_effect = ValueError("Bad configuration")
        self.assertEqual(self.post().status_code, 503)
        self.mint.assert_not_called()

    def test_firebase_id_token_endpoint_uses_shared_verifier(self):
        with patch.object(firebase_helpers, "get_firebase_app"), patch.object(
                firebase_helpers.auth, "verify_id_token", return_value={
                    "uid": "user_student", "email": "student@ufl.edu", "email_verified": True}) as verify:
            response = self.client.get("/auth/me", headers={"Authorization": "Bearer firebase-id-token"})
            self.assertEqual(response.json(), {"uid": "user_student"})
            verify.assert_called_once_with("firebase-id-token", check_revoked=True)


class FirebaseIdentityTests(unittest.TestCase):
    def setUp(self):
        self.identity = {"uid": "user_student", "email": "student@ufl.edu", "displayName": "Student"}

    def test_create_user_with_clerk_uid_and_verified_email(self):
        with patch.object(auth_routes.auth, "get_user", side_effect=auth.UserNotFoundError("Missing")), \
                patch.object(auth_routes.auth, "create_user") as create:
            auth_routes.synchronize_firebase_user(self.identity)
            create.assert_called_once_with(uid="user_student", email="student@ufl.edu", email_verified=True,
                                           display_name="Student")

    def test_existing_disabled_user_is_not_reenabled(self):
        with patch.object(auth_routes.auth, "get_user", return_value=SimpleNamespace(disabled=True)), \
                patch.object(auth_routes.auth, "update_user") as update:
            with self.assertRaises(HTTPException) as error:
                auth_routes.synchronize_firebase_user(self.identity)
            self.assertEqual(error.exception.status_code, 403)
            update.assert_not_called()

    def test_existing_email_is_verified_from_clerk(self):
        user = SimpleNamespace(disabled=False, email="old@ufl.edu", email_verified=False)
        with patch.object(auth_routes.auth, "get_user", return_value=user), \
                patch.object(auth_routes.auth, "update_user") as update:
            auth_routes.synchronize_firebase_user(self.identity)
            update.assert_called_once_with("user_student", email="student@ufl.edu", email_verified=True)

    def test_concurrent_user_creation_rechecks_the_existing_user(self):
        user = SimpleNamespace(disabled=False, email="student@ufl.edu", email_verified=True)
        with patch.object(auth_routes.auth, "get_user", side_effect=[auth.UserNotFoundError("Missing"), user]), \
                patch.object(auth_routes.auth, "create_user", side_effect=auth.UidAlreadyExistsError("Race", None, None)):
            self.assertIs(auth_routes.synchronize_firebase_user(self.identity), user)


class ApplicationAuthTests(unittest.TestCase):
    def test_real_app_mounts_auth_and_health_without_credentials(self):
        from main import app
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.post("/auth/firebase", json={}).status_code, 401)
            self.assertEqual(client.get("/auth/me").status_code, 401)

    def test_cors_preflight_allows_frontend_but_not_arbitrary_origins(self):
        from main import app
        with TestClient(app) as client:
            for origin, expected in [("http://localhost:5173", 200), ("https://untrusted.example", 400)]:
                response = client.options("/auth/firebase", headers={"Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type"})
                self.assertEqual(response.status_code, expected)


if __name__ == "__main__":
    unittest.main()
