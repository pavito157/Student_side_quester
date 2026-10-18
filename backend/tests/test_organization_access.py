import os
import unittest
from unittest.mock import Mock

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from backend import organization_access as access
from backend import global_quests as quests
from backend.tests import test_global_quests as fixture
from backend.firebase_helpers import current_uid, get_db


class OrganizationAccessRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(access.router)
        self.app.dependency_overrides[get_db] = lambda: Mock()
        self.app.dependency_overrides[current_uid] = lambda: 'regular'
        self.client = TestClient(self.app); self.addCleanup(self.client.close)

    def test_routes_require_existing_firebase_auth(self):
        self.app.dependency_overrides.pop(current_uid)
        for method,path,body in [('GET','/organization-admin',None), ('POST','/organizations',{'name':'Club'}),
                                 ('PUT','/organizations/club/admins',{'userId':'regular'})]:
            result = self.client.request(method,path,**({'json':body} if body else {}))
            self.assertEqual(result.status_code,401)

    def test_client_cannot_supply_role_or_members_on_creation(self):
        for path, body in [('/organizations',{'name':'Club','explicitAdminUserIds':['regular']}),
                           ('/organizations/club/admins',{'userId':'regular','role':'explicit_admin'})]:
            response = self.client.request('POST' if path=='/organizations' else 'PUT',path,json=body)
            self.assertEqual(response.status_code,422)


@unittest.skipUnless(os.environ.get('FIRESTORE_EMULATOR_HOST'),'Local emulator required')
class OrganizationAccessEmulatorTests(unittest.TestCase):
    def setUp(self):
        fixture.GlobalQuestEmulatorTests.setUp(self)
        self.explicit = self.prefix + '-explicit'
        self.role_ref = self.db.collection(access.ORGANIZATIONS).document(access.PLATFORM_ACCESS_ID)
        before = self.role_ref.get()
        self.role_ref.set({'explicitAdminUserIds':[self.explicit]})
        self.addCleanup(lambda:self.role_ref.set(before.to_dict()) if before.exists else self.role_ref.delete())

    def new_org(self):
        org = access.new_organization(self.db,self.explicit,access.NewOrganization(name='Another Club'))
        self.addCleanup(self.db.collection(access.ORGANIZATIONS).document(org['id']).delete)
        return org

    def test_regular_admin_only_publishes_for_assigned_organization(self):
        other = self.new_org()
        self.assertEqual(access.authorize_publishing(self.db,self.uid,self.org),'Test Organization')
        with self.assertRaises(HTTPException) as caught:
            access.authorize_publishing(self.db,self.uid,other['id'])
        self.assertEqual(caught.exception.status_code,403)
        organizations, role = access.publishing_organizations(self.db,self.uid)
        self.assertEqual(role,'regular_admin')
        self.assertEqual([org['id'] for org in organizations],[self.org])

    def test_explicit_admin_creates_and_publishes_under_unassigned_organizations(self):
        other = self.new_org()
        self.assertEqual(other['adminUserIds'],[])
        self.assertEqual(access.authorize_publishing(self.db,self.explicit,other['id']),'Another Club')
        event = quests.publish_event(self.db,self.explicit,fixture.payload(other['id']))
        self.addCleanup(self.db.collection(quests.EVENTS).document(event.id).delete)
        self.assertEqual(event.organizationName,'Another Club')
        organizations, role = access.publishing_organizations(self.db,self.explicit)
        self.assertEqual(role,'explicit_admin')
        self.assertTrue({self.org,other['id']} <= {org['id'] for org in organizations})
        self.assertNotIn(access.PLATFORM_ACCESS_ID,[org['id'] for org in organizations])

    def test_regular_admin_cannot_create_assign_or_self_promote(self):
        for operation in [lambda:access.new_organization(self.db,self.uid,access.NewOrganization(name='Bad Club')),
                          lambda:access.assign_organization_admin(self.db,self.uid,self.org,access.OrganizationAssignment(userId=self.uid)),
                          lambda:access.list_admin_organizations(self.uid,self.db)]:
            with self.assertRaises(HTTPException) as caught: operation()
            self.assertEqual(caught.exception.status_code,403)
        self.assertFalse(access.is_explicit_admin(self.db,self.uid))

    def test_explicit_assign_and_revoke_regular_access_without_changing_user_xp(self):
        other = self.new_org()
        result = access.assign_organization_admin(self.db,self.explicit,other['id'],access.OrganizationAssignment(userId=self.uid))
        self.assertEqual(result['adminUserIds'],[self.uid])
        self.assertEqual(access.authorize_publishing(self.db,self.uid,other['id']),'Another Club')
        self.assertEqual(self.user_ref.get().to_dict()['xp'],10)
        self.assertFalse(access.is_explicit_admin(self.db,self.uid))
        access.assign_organization_admin(self.db,self.explicit,other['id'],access.OrganizationAssignment(userId=self.uid,action='revoke'))
        with self.assertRaises(HTTPException): access.authorize_publishing(self.db,self.uid,other['id'])
        self.assertEqual(access.authorize_publishing(self.db,self.uid,self.org),'Test Organization')

    def test_grant_rejects_unknown_users_and_platform_document(self):
        with self.assertRaises(HTTPException) as caught:
            access.assign_organization_admin(self.db,self.explicit,self.org,access.OrganizationAssignment(userId='missing-user'))
        self.assertEqual(caught.exception.status_code,404)
        with self.assertRaises(HTTPException):
            access.assign_organization_admin(self.db,self.explicit,access.PLATFORM_ACCESS_ID,access.OrganizationAssignment(userId=self.uid))
        self.assertFalse(access.is_explicit_admin(self.db,self.uid))

    def test_explicit_revocation_immediately_removes_global_authority(self):
        other = self.new_org()
        self.role_ref.update({'explicitAdminUserIds':[]})
        with self.assertRaises(HTTPException):
            quests.publish_event(self.db,self.explicit,fixture.payload(other['id']))
        with self.assertRaises(HTTPException):
            access.new_organization(self.db,self.explicit,access.NewOrganization(name='No longer allowed'))
