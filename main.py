from fastapi import FastAPI

app = FastAPI(title="Sidequester API")


@app.get("/")
def home():
    return {"message": "Sidequester backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}