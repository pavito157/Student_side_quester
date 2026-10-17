from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.api_core.exceptions import GoogleAPICallError

from backend.firebase_helpers import current_uid, get_db

from backend.auth_routes import frontend_origins, router as auth_router
from backend.quest_assignment_routes import router as quest_assignment_router
from backend.quest_routes import router as quest_router
from backend.request_timing import measure_quest_request
from backend.quest_generation import close_gemini_http_client


@asynccontextmanager
async def lifespan(app):
    try:
        yield
    finally:
        close_gemini_http_client()


app = FastAPI(title="Sidequester API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=frontend_origins(),
                   allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Server-Timing"])
app.middleware("http")(measure_quest_request)
app.include_router(auth_router)
app.include_router(quest_assignment_router)
app.include_router(quest_router)


@app.get("/")
def home():
    return {"message": "Sidequester backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


# Preserve Backend 1's unique API placeholders without advertising fake success.
@app.post("/users", status_code=501)
def create_user(uid: str = Depends(current_uid)):
    raise HTTPException(501, "User creation is handled by /auth/firebase; this endpoint is not implemented")


@app.get("/users/{user_id}", status_code=501)
def get_user(user_id: str, uid: str = Depends(current_uid)):
    raise HTTPException(501, "User lookup is not implemented")


@app.get("/leaderboard", status_code=501)
def get_leaderboard(uid: str = Depends(current_uid)):
    raise HTTPException(501, "Leaderboard is not implemented")


@app.post("/test-firestore")
def test_firestore(uid: str = Depends(current_uid), db=Depends(get_db)):
    """Authenticated connection check; never creates or overwrites test data."""
    try:
        snapshot = db.collection("connection_tests").document("fastapi_test").get(timeout=10)
    except GoogleAPICallError:
        raise HTTPException(503, "Firestore temporarily unavailable") from None
    return {"connected": True, "documentExists": snapshot.exists}
