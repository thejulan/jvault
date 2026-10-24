import os
import sys
import argparse
from pathlib import Path

# Add api to sys.path
ROOT_DIR = Path(__file__).resolve().parent
API_DIR = ROOT_DIR / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.config import settings
from app.database import init_db, get_db
from app.crypto.security import hash_password

def create_admin_user(username: str, password: str):
    """Creates or updates an admin user with salted sha256 hash."""
    if not username or not password:
        print("[ERROR] Username and password cannot be empty.")
        sys.exit(1)

    init_db()
    conn = get_db()
    cursor = conn.cursor()

    pwd_hash, salt = hash_password(password)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
            (pwd_hash, salt, username)
        )
        print(f"[SUCCESS] Admin user '{username}' password successfully updated.")
    else:
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
            (username, pwd_hash, salt, now)
        )
        print(f"[SUCCESS] Admin user '{username}' created successfully.")

    conn.commit()
    conn.close()

def main():
    parser = argparse.ArgumentParser(description="JVault Crypto Gateway Server & CLI")
    parser.add_argument("--create", choices=["admin"], help="Create administrative entity (e.g. admin)")
    parser.add_argument("--username", help="Admin username")
    parser.add_argument("--password", help="Admin password")
    parser.add_argument("--host", default=settings.HOST, help="Server host")
    parser.add_argument("--port", type=int, default=settings.PORT, help="Server port")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")

    args = parser.parse_args()

    if args.create == "admin":
        if not args.username or not args.password:
            print("[ERROR] Please provide --username and --password.")
            print('Example: python run.py --create admin --username "admin" --password "VeryStrongPassword123!"')
            sys.exit(1)
        create_admin_user(args.username, args.password)
        return

    # Normal server startup
    import uvicorn
    print(f"==================================================")
    print(f" Starting {settings.APP_NAME} v{settings.VERSION}")
    print(f" Server URL: http://{args.host}:{args.port}")
    print(f" Database:   {settings.DB_PATH}")
    print(f"==================================================")

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)

if __name__ == "__main__":
    main()
