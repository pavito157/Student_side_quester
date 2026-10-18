"""Two-level organization authorization. Roles never come from browser claims."""
from fastapi import APIRouter, Depends, HTTPException
from google.api_core.exceptions import GoogleAPICallError, RetryError
from firebase_admin import firestore
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

from .firebase_helpers import current_uid, get_db, USERS

ORGANIZATIONS = "Organizations"
PLATFORM_ACCESS_ID = "_platform_access"
router = APIRouter(tags=["Organization administration"])


def is_explicit_admin(db, uid, transaction=None):
    snapshot = db.collection(ORGANIZATIONS).document(PLATFORM_ACCESS_ID).get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else {}
    admins = data.get("explicitAdminUserIds", [])
    return isinstance(admins, list) and uid in admins


def require_explicit_admin(db, uid, transaction=None):
    if not is_explicit_admin(db, uid, transaction):
        raise HTTPException(403, "Explicit admin access required.")


def publishing_organizations(db, uid):
    explicit = is_explicit_admin(db, uid)
    collection = db.collection(ORGANIZATIONS)
    query = collection.where("isActive", "==", True) if explicit else collection.where("adminUserIds", "array_contains", uid)
    organizations = []
    for snapshot in query.stream():
        data = snapshot.to_dict()
        if snapshot.id != PLATFORM_ACCESS_ID and data.get("isActive") is True:
            organizations.append({"id": snapshot.id, "name": data.get("name", "Organization")})
    organizations.sort(key=lambda org: org["name"].casefold())
    return organizations, "explicit_admin" if explicit else "regular_admin" if organizations else "member"


def authorize_publishing(db, uid, organization_id, transaction=None):
    explicit = is_explicit_admin(db, uid, transaction)
    snapshot = db.collection(ORGANIZATIONS).document(organization_id).get(transaction=transaction)
    data = snapshot.to_dict() if snapshot.exists else {}
    admins = data.get("adminUserIds", [])
    if (organization_id == PLATFORM_ACCESS_ID or data.get("isActive") is not True
            or not (explicit or isinstance(admins, list) and uid in admins)):
        raise HTTPException(403, "Admin access to this organization is required.")
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(409, "Organization name needs configuration.")
    return name


class NewOrganization(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=120)


class OrganizationAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    userId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    action: Literal["grant", "revoke"] = "grant"


def new_organization(db, uid, payload):
    ref = db.collection(ORGANIZATIONS).document()
    @firestore.transactional
    def commit(transaction):
        require_explicit_admin(db, uid, transaction)
        transaction.create(ref, {"name": payload.name, "isActive": True, "isPublic": False,
                                 "adminUserIds": [], "createdBy": uid, "createdAt": firestore.SERVER_TIMESTAMP})
        return {"id": ref.id, "name": payload.name, "adminUserIds": []}
    return commit(db.transaction())


def assign_organization_admin(db, uid, organization_id, payload):
    if organization_id == PLATFORM_ACCESS_ID or "/" in organization_id or len(organization_id) > 128:
        raise HTTPException(400, "Choose a valid organization.")
    ref = db.collection(ORGANIZATIONS).document(organization_id)
    @firestore.transactional
    def commit(transaction):
        require_explicit_admin(db, uid, transaction)
        snapshot = ref.get(transaction=transaction)
        data = snapshot.to_dict() if snapshot.exists else {}
        if data.get("isActive") is not True:
            raise HTTPException(404, "Active organization not found.")
        admins = data.get("adminUserIds", [])
        if not isinstance(admins, list) or any(not isinstance(admin, str) for admin in admins):
            raise HTTPException(409, "Organization memberships need repair.")
        if payload.action == "grant":
            profile = db.collection(USERS).document(payload.userId).get(transaction=transaction)
            if not profile.exists:
                raise HTTPException(404, "User profile not found. Ask them to sign in first, then use their user ID.")
            updated = sorted(set([*admins, payload.userId]))
        else:
            updated = [admin for admin in admins if admin != payload.userId]
        transaction.update(ref, {"adminUserIds": updated})
        return {"id": ref.id, "name": data["name"], "adminUserIds": updated}
    return commit(db.transaction())


@router.get("/organization-admin")
def list_admin_organizations(uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        require_explicit_admin(db, uid)
        organizations = []
        for snapshot in db.collection(ORGANIZATIONS).where("isActive", "==", True).stream():
            data = snapshot.to_dict()
            if snapshot.id != PLATFORM_ACCESS_ID:
                organizations.append({"id": snapshot.id, "name": data["name"], "adminUserIds": data.get("adminUserIds", [])})
        return {"organizations": sorted(organizations, key=lambda org: org["name"].casefold())}
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Organization administration is temporarily unavailable.") from None


@router.post("/organizations", status_code=201)
def create_organization(payload: NewOrganization, uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        return new_organization(db, uid, payload)
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Could not create the organization.") from None


@router.put("/organizations/{organization_id}/admins")
def update_organization_admin(organization_id: str, payload: OrganizationAssignment,
                              uid: str = Depends(current_uid), db=Depends(get_db)):
    try:
        return assign_organization_admin(db, uid, organization_id, payload)
    except (GoogleAPICallError, RetryError):
        raise HTTPException(503, "Could not update organization access.") from None
