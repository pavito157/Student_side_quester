from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
