from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.database import DBRepo
from app.telegram_bot.bot import TelegramBotManager
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api/telegram", tags=["telegram"])

class TelegramConfigRequest(BaseModel):
    api_id: str
    api_hash: str
    bot_token: Optional[str] = ""
    bot_username: Optional[str] = "JVaultPayBot"

@router.get("/status")
def get_telegram_status(user: dict = Depends(get_current_user)):
    return TelegramBotManager.get_status()

@router.post("/configure")
async def configure_telegram(req: TelegramConfigRequest, user: dict = Depends(get_current_user)):
    DBRepo.set_setting("telegram_api_id", req.api_id.strip())
    DBRepo.set_setting("telegram_api_hash", req.api_hash.strip())
    if req.bot_token and req.bot_token.strip():
        DBRepo.set_setting("telegram_bot_token", req.bot_token.strip())
    clean_user = (req.bot_username or "").strip().lstrip("@")
    if clean_user:
        DBRepo.set_setting("telegram_bot_username", clean_user)

    # Restart bot
    await TelegramBotManager.stop()
    await TelegramBotManager.start()

    return TelegramBotManager.get_status()

@router.post("/toggle")
async def toggle_telegram_bot(user: dict = Depends(get_current_user)):
    if TelegramBotManager.is_running:
        await TelegramBotManager.stop()
    else:
        await TelegramBotManager.start()
    return TelegramBotManager.get_status()
