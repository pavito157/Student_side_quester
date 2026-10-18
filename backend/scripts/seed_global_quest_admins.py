"""Explicit one-time membership grant. Run: python -m backend.scripts.seed_global_quest_admins."""
from dotenv import load_dotenv
from firebase_admin import firestore
from backend.firebase_helpers import get_db

ORGANIZATION_ID = "campus-events"
ADMIN_IDS = ["user_3KnxdJw5EezulC4qR3fF1Lv3Mkc", "user_3KpQRFpXWJtJoOZLnxrdo7movV0"]


def seed(db):
    ref = db.collection("Organizations").document(ORGANIZATION_ID)

    @firestore.transactional
    def commit(transaction):
        snapshot = ref.get(transaction=transaction)
        data = snapshot.to_dict() if snapshot.exists else {}
        # Preserve existing admins and organization metadata. Only this explicit
        # operator command grants access; sign-in never creates admin roles.
        transaction.set(ref, {
            "name": data.get("name", "Campus Events"), "isActive": True,
            "adminUserIds": firestore.ArrayUnion(ADMIN_IDS),
        }, merge=True)
    commit(db.transaction())
    snapshot = ref.get()
    return all(uid in snapshot.to_dict().get("adminUserIds", []) for uid in ADMIN_IDS)


if __name__ == "__main__":
    load_dotenv()
    db = get_db()
    print("Target Firestore project:", db.project)
    if not seed(db):
        raise SystemExit("Admin membership verification failed")
    print("Verified both admin memberships in Organizations/campus-events")
