
print("Firebase test script is starting...")
import firebase_admin
from firebase_admin import credentials, firestore


# 1. Authenticate with Firebase
cred = credentials.Certificate("serviceAccountKey.json")

# 2. Initialize the Firebase Admin SDK
firebase_admin.initialize_app(cred)

# 3. Create a Firestore client
db = firestore.client()


# 4. Write a test document
doc_ref = db.collection("connection_tests").document("fastapi_test")

doc_ref.set({
    "message": "Hello from Sidequester!",
    "status": "connected",
})

print("Test document written successfully!")


# 5. Read the document back
doc = doc_ref.get()

if doc.exists:
    print("Test document read successfully!")
    print(doc.to_dict())
else:
    print("Document was not found.")
