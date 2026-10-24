from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.database import DBRepo, get_db
from app.crypto.networks import NETWORKS
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

class UpdateSettingsRequest(BaseModel):
    public_base_url: Optional[str] = None
    simulation_mode: Optional[str] = None
    hide_zero_balances: Optional[str] = None
    default_fiat: Optional[str] = None
    treasury_currency: Optional[str] = None

@router.get("")
def get_settings(user: dict = Depends(get_current_user)):
    all_s = DBRepo.get_all_settings()
    # Mask sensitive telegram bot token if present
    masked_token = ""
    if all_s.get("telegram_bot_token"):
        tok = all_s["telegram_bot_token"]
        masked_token = tok[:6] + "..." + tok[-4:] if len(tok) > 10 else "***"
    all_s["telegram_bot_token_masked"] = masked_token
    return all_s

@router.post("")
def update_settings(req: UpdateSettingsRequest, user: dict = Depends(get_current_user)):
    if req.public_base_url is not None:
        raw_url = req.public_base_url.strip().rstrip("/")
        if raw_url:
            if not raw_url.startswith("http://") and not raw_url.startswith("https://"):
                if "127.0.0.1" in raw_url or "localhost" in raw_url:
                    raw_url = f"http://{raw_url}"
                else:
                    raw_url = f"https://{raw_url}"
            DBRepo.set_setting("public_base_url", raw_url)
            try:
                import configparser
                from app.config import CONFIG_INI_PATH
                if CONFIG_INI_PATH.exists():
                    cfg = configparser.ConfigParser()
                    cfg.read(CONFIG_INI_PATH)
                    if not cfg.has_section("server"):
                        cfg.add_section("server")
                    cfg.set("server", "public_base_url", raw_url)
                    with open(CONFIG_INI_PATH, "w") as f:
                        cfg.write(f)
            except Exception:
                pass
    if req.simulation_mode is not None:
        DBRepo.set_setting("simulation_mode", req.simulation_mode.strip().lower())
    if req.hide_zero_balances is not None:
        DBRepo.set_setting("hide_zero_balances", req.hide_zero_balances.strip().lower())
    if req.default_fiat is not None:
        DBRepo.set_setting("default_fiat", req.default_fiat.strip().upper())
    if req.treasury_currency is not None:
        DBRepo.set_setting("treasury_currency", req.treasury_currency.strip().upper())
    return {"status": "success", "settings": DBRepo.get_all_settings()}

@router.get("/export")
def export_treasury_backup(user: dict = Depends(get_current_user)):
    """Exports safe metadata of wallets and payments for backup."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, created_at, is_default FROM wallets")
    wallets = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT id, wallet_id, network_id, address, address_index, derivation_path, label, created_at FROM addresses")
    addresses = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT id, wallet_id, network_id, currency, amount, status, pay_address, tx_hash, created_at FROM payments")
    payments = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return {
        "version": "1.0.0",
        "wallets": wallets,
        "addresses": addresses,
        "payments": payments,
        "networks": list(NETWORKS.keys())
    }

# ==================== ENCRYPTED BACKUP & RESTORE (.jvault) ====================
import os
import json
import base64
from datetime import datetime, timezone
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

class EncryptedBackupRequest(BaseModel):
    pin: str

class EncryptedRestoreRequest(BaseModel):
    file_data_base64: str
    pin: str

def derive_backup_key(pin: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return kdf.derive(pin.strip().encode('utf-8'))

BACKUP_TABLES = [
    'wallets',
    'addresses',
    'tokens',
    'payments',
    'system_settings',
    'payment_logs',
    'withdrawals',
    'withdrawal_hops',
    'telegram_messages'
]

@router.post("/backup")
def create_encrypted_backup(req: EncryptedBackupRequest, user: dict = Depends(get_current_user)):
    pin = (req.pin or "").strip()
    if len(pin) != 6:
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 characters (digits and letters).")

    conn = get_db()
    cursor = conn.cursor()

    backup_payload: Dict[str, Any] = {
        "version": "2.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tables": {}
    }

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = set(r[0] for r in cursor.fetchall())

    for tbl in BACKUP_TABLES:
        if tbl in existing_tables:
            cursor.execute(f"SELECT * FROM {tbl}")
            backup_payload["tables"][tbl] = [dict(r) for r in cursor.fetchall()]

    conn.close()

    # Encrypt with AES-GCM
    salt = os.urandom(16)
    nonce = os.urandom(12)
    key = derive_backup_key(pin, salt)
    aesgcm = AESGCM(key)

    plaintext = json.dumps(backup_payload, ensure_ascii=False).encode('utf-8')
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Magic header: b'VAULTIX1' (8 bytes) + salt (16 bytes) + nonce (12 bytes) + ciphertext
    full_file_bytes = b'VAULTIX1' + salt + nonce + ciphertext
    b64_content = base64.b64encode(full_file_bytes).decode('ascii')

    timestamp_str = datetime.now().strftime("%Y-%m-%d-%H%M")
    filename = f"jvault-backup-{timestamp_str}.jvault"

    return {
        "status": "success",
        "filename": filename,
        "file_data_base64": b64_content
    }

@router.post("/restore")
def restore_encrypted_backup(req: EncryptedRestoreRequest, user: dict = Depends(get_current_user)):
    pin = (req.pin or "").strip()
    if not pin or len(pin) != 6:
        raise HTTPException(status_code=400, detail="Invalid PIN: must be 6 characters.")

    if not req.file_data_base64:
        raise HTTPException(status_code=400, detail="No backup file data provided.")

    try:
        file_bytes = base64.b64decode(req.file_data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 backup file data.")

    if not file_bytes.startswith(b'VAULTIX1') or len(file_bytes) < 36:
        raise HTTPException(status_code=400, detail="Invalid backup file: not a recognized .jvault encrypted file.")

    salt = file_bytes[8:24]
    nonce = file_bytes[24:36]
    ciphertext = file_bytes[36:]

    try:
        key = derive_backup_key(pin, salt)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        payload = json.loads(plaintext.decode('utf-8'))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Incorrect PIN or corrupted .jvault backup file.")

    tables_data = payload.get("tables", {})
    if not tables_data:
        raise HTTPException(status_code=400, detail="Corrupted backup payload: no table data found.")

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA foreign_keys = OFF;")
        cursor.execute("BEGIN TRANSACTION;")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = set(r[0] for r in cursor.fetchall())

        for tbl, rows in tables_data.items():
            if tbl in existing_tables:
                cursor.execute(f"DELETE FROM {tbl}")
                if rows and isinstance(rows, list):
                    for row in rows:
                        cols = list(row.keys())
                        placeholders = ', '.join(['?'] * len(cols))
                        col_names = ', '.join([f'"{c}"' for c in cols])
                        cursor.execute(
                            f"INSERT INTO {tbl} ({col_names}) VALUES ({placeholders})",
                            [row[c] for c in cols]
                        )

        conn.commit()
    except Exception as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to restore database: {str(err)}")
    finally:
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.close()

    return {
        "status": "success",
        "message": "JVault database and keystore restored successfully."
    }

@router.post("/self-destroy")
def self_destroy_data(user: dict = Depends(get_current_user)):
    """Permanently purges all wallets, private keys, addresses, payments, and system records."""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys = OFF;")
        cursor.execute("BEGIN TRANSACTION;")
        
        tables_to_purge = [
            "payment_logs",
            "withdrawal_hops",
            "withdrawals",
            "telegram_messages",
            "payments",
            "addresses",
            "wallets",
            "sessions"
        ]
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = set(r[0] for r in cursor.fetchall())
        
        for table in tables_to_purge:
            if table in existing_tables:
                cursor.execute(f"DELETE FROM {table};")

        # Also purge any notifications table if present
        for tbl in ["notifications", "app_notifications", "user_notifications"]:
            if tbl in existing_tables:
                cursor.execute(f"DELETE FROM {tbl};")

        # Mark initial_wallet_seeded so wallets are not resurrected on server start
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('initial_wallet_seeded', 'true');")

        conn.commit()

        # Clean cached payment QR codes from disk
        try:
            from app.config import settings
            if settings.QR_CACHE_DIR and settings.QR_CACHE_DIR.exists():
                for qr_file in settings.QR_CACHE_DIR.glob("*"):
                    if qr_file.is_file():
                        qr_file.unlink()
        except Exception:
            pass

    except Exception as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Self-destruct sequence failed: {str(err)}")
    finally:
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.close()

    return {
        "status": "success",
        "message": "All wallets, addresses, payments, and gateway data have been permanently destroyed."
    }



