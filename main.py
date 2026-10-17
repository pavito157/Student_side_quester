
from fastapi import FastAPI
from firebase_config import db

app = FastAPI(title="Sidequester API")


@app.get("/")
def home():
    return {"message": "Sidequester backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/users")
def create_user():
    return {
        "message": "Create user endpoint is ready",
        "status": "not implemented"
    }


@app.get("/quests")
def get_quests():
    return {
        "message": "Get quests endpoint is ready",
        "status": "not implemented",
        "quests": []
    }


@app.post("/quests/assign")
def assign_quest():
    return {
        "message": "Assign quest endpoint is ready",
        "status": "not implemented"
    }


@app.post("/quests/{id}/complete")
def complete_quest(id: int):
    return {
        "message": "Complete quest endpoint is ready",
        "quest_id": id,
        "status": "not implemented"
    }


@app.get("/users/{id}")
def get_user(id: int):
    return {
        "message": "Get user endpoint is ready",
        "user_id": id,
        "status": "not implemented"
    }


@app.get("/leaderboard")
def get_leaderboard():
    return {
        "message": "Leaderboard endpoint is ready",
        "status": "not implemented",
        "leaderboard": []
    }


@app.post("/test-firestore")
def test_firestore():
    doc_ref = db.collection("connection_tests").document("fastapi_test")

    doc_ref.set({
        "message": "Hello from FastAPI!",
        "status": "connected"
    })

    doc = doc_ref.get()

    return {
        "success": doc.exists,
        "data": doc.to_dict()
    }
