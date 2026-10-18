"""Operator-only bootstrap for explicit admins; no public API grants this role."""
import argparse
import re
from dotenv import load_dotenv
from firebase_admin import firestore
from backend.firebase_helpers import get_db
from backend.organization_access import PLATFORM_ACCESS_ID, ORGANIZATIONS


def grant(db, uid):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',uid):
        raise ValueError('Use a valid verified user ID')
    ref = db.collection(ORGANIZATIONS).document(PLATFORM_ACCESS_ID)
    ref.set({'explicitAdminUserIds':firestore.ArrayUnion([uid])},merge=True)
    return uid in ref.get().to_dict().get('explicitAdminUserIds',[])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-id',required=True)
    args = parser.parse_args()
    load_dotenv()
    db = get_db()
    if not grant(db,args.user_id): raise SystemExit('Role verification failed')
    print('Verified explicit admin membership in project',db.project)
