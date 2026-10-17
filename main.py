from firebase_config import db
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from auth import get_current_user_id
from xp_service import complete_assigned_quest


app = FastAPI(title="Sidequester API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
   )

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


@app.post("/quests/{assigned_quest_id}/complete")
def complete_quest(assigned_quest_id: str, user_id: str = Depends(get_current_user_id)):
    result = complete_assigned_quest(user_id, assigned_quest_id)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Quest or user not found")
    if result["status"] in ("invalid_status", "invalid_xp"):
        raise HTTPException(status_code=409, detail=f"Cannot complete: {result['status']}")
    return result


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
