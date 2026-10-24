import os
import configparser
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent  # api/
ROOT_DIR = BASE_DIR.parent                          # root/
CONFIG_INI_PATH = ROOT_DIR / "config.ini"

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
QR_CACHE_DIR = DATA_DIR / "qr_codes"
QR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Parse config.ini if it exists
config = configparser.ConfigParser()
if CONFIG_INI_PATH.exists():
    config.read(CONFIG_INI_PATH)

def get_cfg(section: str, key: str, default: str = "") -> str:
    try:
        return config.get(section, key, fallback=os.getenv(f"{section.upper()}_{key.upper()}", default))
    except Exception:
        return os.getenv(f"{section.upper()}_{key.upper()}", default)

class Settings:
    APP_NAME: str = "JVault Crypto Gateway"
    VERSION: str = "1.1.0"
    
    # Server
    HOST: str = get_cfg("server", "host", "127.0.0.1")
    PORT: int = int(get_cfg("server", "port", "8000"))
    SECRET_KEY: str = get_cfg("server", "secret_key", "jvault-super-secure-production-secret-key-2026")
    PUBLIC_BASE_URL: str = get_cfg("server", "public_base_url", f"http://{HOST}:{PORT}")
    
    # Database & Storage
    DATA_DIR: Path = DATA_DIR
    QR_CACHE_DIR: Path = QR_CACHE_DIR
    DB_RELATIVE_PATH: str = get_cfg("database", "db_path", "api/data/jvault.db")
    DB_PATH: Path = ROOT_DIR / DB_RELATIVE_PATH if not Path(DB_RELATIVE_PATH).is_absolute() else Path(DB_RELATIVE_PATH)
    
    # Telegram Bot
    TELEGRAM_API_ID: int = int(get_cfg("telegram", "api_id", "0") or "0")
    TELEGRAM_API_HASH: str = get_cfg("telegram", "api_hash", "")
    TELEGRAM_BOT_TOKEN: str = get_cfg("telegram", "bot_token", "")
    TELEGRAM_BOT_USERNAME: str = get_cfg("telegram", "bot_username", "JVaultPayBot")
    
    # Gateway
    INVOICE_EXPIRE_MINUTES: int = int(get_cfg("gateway", "default_invoice_expire_minutes", "30"))
    VALIDATOR_INTERVAL_SECONDS: int = int(get_cfg("gateway", "validator_interval_seconds", "5"))
    ENABLE_SIMULATION_MODE: bool = get_cfg("gateway", "simulation_mode", "true").lower() == "true"

settings = Settings()
DB_PATH = settings.DB_PATH
