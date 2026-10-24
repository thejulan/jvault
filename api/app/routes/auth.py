from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
from app.database import get_db, DBRepo
from app.crypto.security import verify_password, hash_password
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# Session tokens store
ACTIVE_SESSIONS = {}

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.replace("Bearer ", "").strip()
    user = ACTIVE_SESSIONS.get(token)
    if not user:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id as id, username, role FROM sessions WHERE token = ?", (token,))
        row = cursor.fetchone()
        conn.close()
        if row:
            user = dict(row)
            ACTIVE_SESSIONS[token] = user

    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return user

@router.get("/status")
def auth_status():
    """Checks if an administrator has been initialized."""
    return {"has_admin": DBRepo.has_admin_user()}

@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username.strip(),))
    user = cursor.fetchone()

    if not user:
        conn.close()
        # Check if any user exists at all
        if not DBRepo.has_admin_user():
            raise HTTPException(
                status_code=400,
                detail="No administrator account found. Initialize admin via: python run.py --create admin --username 'admin' --password 'VeryStrongPassword123!'"
            )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(req.password, user["password_hash"], user["salt"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = "vt_" + uuid.uuid4().hex
    user_info = {
        "id": user["id"],
        "username": user["username"],
        "role": "admin"
    }
    ACTIVE_SESSIONS[token] = user_info

    from datetime import datetime, timezone
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "INSERT OR REPLACE INTO sessions (token, user_id, username, role, created_at) VALUES (?, ?, ?, ?, ?)",
        (token, user["id"], user["username"], "admin", now_str)
    )
    conn.commit()
    conn.close()

    return {
        "token": token,
        "user": user_info
    }

@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

@router.post("/change-password")
def change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user["username"],))
    u = cursor.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(req.current_password, u["password_hash"], u["salt"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password incorrect")

    new_hash, new_salt = hash_password(req.new_password)
    cursor.execute(
        "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
        (new_hash, new_salt, user["username"])
    )
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Password updated successfully"}
