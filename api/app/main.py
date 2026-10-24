import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings, BASE_DIR
from app.database import init_db
from app.payments.validator import PaymentValidator
from app.telegram_bot.bot import TelegramBotManager
from app.routes import auth, wallets, payments, telegram, settings as settings_routes

DASHBOARD_DIR = BASE_DIR.parent / "dashboard"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    PaymentValidator.start()
    try:
        await TelegramBotManager.start()
    except Exception as e:
        print(f"Telegram Bot startup note: {e}")
    yield
    # Shutdown
    PaymentValidator.stop()
    await TelegramBotManager.stop()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Register API Routers
app.include_router(auth.router)
app.include_router(wallets.router)
app.include_router(payments.router)
app.include_router(telegram.router)
app.include_router(settings_routes.router)

# Mount dashboard static assets if directory exists
if DASHBOARD_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(DASHBOARD_DIR)), name="static")

@app.get("/manifest.json")
async def serve_manifest():
    mf_file = DASHBOARD_DIR / "manifest.json"
    if mf_file.exists():
        return FileResponse(mf_file, media_type="application/manifest+json")
    raise HTTPException(status_code=404)

@app.get("/sw.js")
async def serve_sw():
    sw_file = DASHBOARD_DIR / "sw.js"
    if sw_file.exists():
        return FileResponse(sw_file, media_type="application/javascript", headers={"Service-Worker-Allowed": "/"})
    raise HTTPException(status_code=404)

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index_file = DASHBOARD_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>JVault API Running. Dashboard file not found.</h1>")

@app.get("/pay/{payment_id}", response_class=HTMLResponse)
async def serve_checkout(payment_id: str):
    pay_file = DASHBOARD_DIR / "pay.html"
    if pay_file.exists():
        return FileResponse(pay_file)
    return HTMLResponse(f"<h1>JVault Checkout Invoice: {payment_id}</h1>")

@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_spa_catchall(full_path: str):
    # Do not intercept api endpoints, static assets, docs, or pay
    clean_path = full_path.strip("/")
    if (
        clean_path == "api" or clean_path.startswith("api/")
        or clean_path == "static" or clean_path.startswith("static/")
        or clean_path == "pay" or clean_path.startswith("pay/")
        or clean_path in ("docs", "redoc", "openapi.json")
    ):
        raise HTTPException(status_code=404, detail="Not Found")
    index_file = DASHBOARD_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>JVault API Running. Dashboard file not found.</h1>")

