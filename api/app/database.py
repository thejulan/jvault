import sqlite3
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.config import settings, DB_PATH
from app.crypto.security import hash_password, encrypt_payload, decrypt_payload
from app.crypto.generator import WalletGenerator
from app.crypto.networks import NETWORKS

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes tables and runs lightweight column migrations."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        encrypted_mnemonic TEXT NOT NULL,
        encrypted_seed TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_balance_usd REAL DEFAULT 0.0,
        is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS addresses (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        network_id TEXT NOT NULL,
        address TEXT NOT NULL,
        address_index INTEGER NOT NULL,
        derivation_path TEXT NOT NULL,
        public_key TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        label TEXT,
        balance REAL DEFAULT 0.0,
        balance_usd REAL DEFAULT 0.0,
        is_temporary INTEGER DEFAULT 0,
        duration_minutes INTEGER DEFAULT 0,
        expires_at TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id)
    );

    CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        contract_address TEXT,
        is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        address_id TEXT,
        network_id TEXT,
        currency TEXT,
        token_symbol TEXT,
        contract_address TEXT,
        amount REAL NOT NULL,
        amount_usd REAL DEFAULT 0.0,
        status TEXT NOT NULL,
        pay_address TEXT,
        tx_hash TEXT,
        confirmations INTEGER DEFAULT 0,
        required_confirmations INTEGER DEFAULT 1,
        gas_fee_est TEXT,
        description TEXT,
        customer_ref TEXT,
        qr_data TEXT,
        web_link TEXT,
        telegram_link TEXT,
        is_blind INTEGER DEFAULT 0,
        is_temporary INTEGER DEFAULT 0,
        telegram_user_id TEXT,
        telegram_chat_id TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id)
    );

    CREATE TABLE IF NOT EXISTS telegram_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        last_status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (payment_id) REFERENCES payments (id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        tx_hash TEXT,
        confirmations INTEGER DEFAULT 0,
        block_height INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (payment_id) REFERENCES payments (id)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        network_id TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        destination_address TEXT NOT NULL,
        amount REAL NOT NULL,
        amount_usd REAL DEFAULT 0.0,
        fee_total REAL DEFAULT 0.0,
        is_secured_chain INTEGER DEFAULT 0,
        chain_hops_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        final_tx_hash TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id)
    );

    CREATE TABLE IF NOT EXISTS withdrawal_hops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        withdrawal_id TEXT NOT NULL,
        hop_index INTEGER NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount REAL NOT NULL,
        tx_hash TEXT,
        gas_fee REAL DEFAULT 0.0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (withdrawal_id) REFERENCES withdrawals (id)
    );
    """)
    conn.commit()

    # Column migrations if old schema exists
    try:
        cursor.execute("ALTER TABLE addresses ADD COLUMN is_temporary INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE addresses ADD COLUMN duration_minutes INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE addresses ADD COLUMN expires_at TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE addresses ADD COLUMN status TEXT DEFAULT 'ACTIVE'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN is_blind INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN gas_fee_est TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN is_temporary INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN telegram_user_id TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE payments ADD COLUMN telegram_chat_id TEXT")
    except Exception:
        pass
    conn.commit()

    # Seed default system settings
    default_settings = {
        "telegram_api_id": str(settings.TELEGRAM_API_ID or ""),
        "telegram_api_hash": settings.TELEGRAM_API_HASH,
        "telegram_bot_token": settings.TELEGRAM_BOT_TOKEN,
        "telegram_bot_username": settings.TELEGRAM_BOT_USERNAME,
        "public_base_url": settings.PUBLIC_BASE_URL,
        "simulation_mode": "true",
        "hide_zero_balances": "false",
        "default_fiat": "USD"
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)", (k, v))
    conn.commit()

    # Seed initial tokens
    for net_id, net_info in NETWORKS.items():
        for tok in net_info.get("tokens", []):
            tok_id = f"{net_id}_{tok['symbol']}"
            cursor.execute(
                "INSERT OR IGNORE INTO tokens (id, network_id, symbol, name, decimals, contract_address, is_custom) VALUES (?, ?, ?, ?, ?, ?, 0)",
                (tok_id, net_id, tok["symbol"], tok["name"], tok["decimals"], tok.get("contract"))
            )
    conn.commit()

    # Seed initial Primary Vault wallet ONLY on first-ever install if never initialized
    cursor.execute("SELECT value FROM system_settings WHERE key = 'initial_wallet_seeded'")
    seeded_flag = cursor.fetchone()
    if not seeded_flag:
        cursor.execute("SELECT COUNT(*) FROM wallets")
        if cursor.fetchone()[0] == 0:
            seed_default_wallet(conn)
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('initial_wallet_seeded', 'true')")
        conn.commit()

    conn.close()

def seed_default_wallet(conn):
    cursor = conn.cursor()
    mnemonic = WalletGenerator.generate_mnemonic(12)
    seed = WalletGenerator.mnemonic_to_seed(mnemonic)
    
    enc_mnemonic = encrypt_payload(mnemonic)
    enc_seed = encrypt_payload(seed.hex())
    
    wallet_id = "wal_" + uuid.uuid4().hex[:10]
    now = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO wallets (id, name, encrypted_mnemonic, encrypted_seed, created_at, total_balance_usd, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)",
        (wallet_id, "Primary Balance Vault", enc_mnemonic, enc_seed, now, 0.0)
    )
    
    # Generate addresses for all 10 networks (initial balance 0.0)
    all_addrs = WalletGenerator.generate_all_network_addresses(seed, address_index=0)
    for item in all_addrs:
        addr_id = "addr_" + uuid.uuid4().hex[:10]
        enc_priv = encrypt_payload(item["private_key"])
        cursor.execute("""
            INSERT INTO addresses (
                id, wallet_id, network_id, address, address_index, derivation_path,
                public_key, encrypted_private_key, label, balance, balance_usd,
                is_temporary, duration_minutes, expires_at, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0, 0, NULL, 'ACTIVE', ?)
        """, (
            addr_id, wallet_id, item["network_id"], item["address"],
            item["address_index"], item["derivation_path"], item["public_key"],
            enc_priv, f"Default {item['short_name']} Address", now
        ))
    conn.commit()

class DBRepo:
    @staticmethod
    def has_admin_user() -> bool:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM users")
        row = cursor.fetchone()
        conn.close()
        return bool(row and row["cnt"] > 0)

    @staticmethod
    def get_setting(key: str, default: str = "") -> str:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row["value"] if row else default

    @staticmethod
    def set_setting(key: str, value: str):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
        conn.close()

    @staticmethod
    def get_all_settings() -> Dict[str, str]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM system_settings")
        rows = cursor.fetchall()
        conn.close()
        return {r["key"]: r["value"] for r in rows}

    @staticmethod
    def list_wallets() -> List[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, created_at, total_balance_usd, is_default FROM wallets ORDER BY is_default DESC, created_at ASC")
        rows = [dict(r) for r in cursor.fetchall()]
        
        for w in rows:
            cursor.execute("SELECT COUNT(*) as count FROM addresses WHERE wallet_id = ?", (w["id"],))
            w["addresses_count"] = cursor.fetchone()["count"]
            cursor.execute("SELECT SUM(balance_usd) as total FROM addresses WHERE wallet_id = ?", (w["id"],))
            tot_row = cursor.fetchone()
            sum_usd = round((tot_row["total"] or 0.0) if tot_row else 0.0, 2)
            w["total_balance_usd"] = sum_usd
            cursor.execute("UPDATE wallets SET total_balance_usd = ? WHERE id = ?", (sum_usd, w["id"]))
        conn.commit()
        conn.close()
        return rows

    @staticmethod
    def get_wallet(wallet_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM wallets WHERE id = ?", (wallet_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        w = dict(row)
        cursor.execute("SELECT SUM(balance_usd) as total FROM addresses WHERE wallet_id = ?", (wallet_id,))
        tot_row = cursor.fetchone()
        w["total_balance_usd"] = round((tot_row["total"] or 0.0) if tot_row else 0.0, 2)
        conn.close()
        return w

    @staticmethod
    def create_wallet(name: str, mnemonic: str = None, auto_generate_addresses: bool = True) -> Dict[str, Any]:
        if not mnemonic:
            mnemonic = WalletGenerator.generate_mnemonic(12)
        elif not WalletGenerator.validate_mnemonic(mnemonic):
            raise ValueError("Invalid BIP39 mnemonic phrase")

        seed = WalletGenerator.mnemonic_to_seed(mnemonic)
        enc_mnemonic = encrypt_payload(mnemonic)
        enc_seed = encrypt_payload(seed.hex())
        
        wallet_id = "wal_" + uuid.uuid4().hex[:10]
        now = datetime.now(timezone.utc).isoformat()
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO wallets (id, name, encrypted_mnemonic, encrypted_seed, created_at, total_balance_usd, is_default) VALUES (?, ?, ?, ?, ?, 0.0, 0)",
            (wallet_id, name, enc_mnemonic, enc_seed, now)
        )
        
        if auto_generate_addresses:
            all_addrs = WalletGenerator.generate_all_network_addresses(seed, address_index=0)
            for item in all_addrs:
                addr_id = "addr_" + uuid.uuid4().hex[:10]
                enc_priv = encrypt_payload(item["private_key"])
                cursor.execute("""
                    INSERT INTO addresses (
                        id, wallet_id, network_id, address, address_index, derivation_path,
                        public_key, encrypted_private_key, label, balance, balance_usd,
                        is_temporary, duration_minutes, expires_at, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0, 0, NULL, 'ACTIVE', ?)
                """, (
                    addr_id, wallet_id, item["network_id"], item["address"],
                    item["address_index"], item["derivation_path"], item["public_key"],
                    enc_priv, f"Main {item['short_name']}", now
                ))
            
        conn.commit()
        conn.close()
        
        return {
            "id": wallet_id,
            "name": name,
            "mnemonic": mnemonic,
            "created_at": now
        }

    @staticmethod
    def update_wallet(wallet_id: str, name: str = None, is_default: bool = None) -> Optional[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        if is_default:
            cursor.execute("UPDATE wallets SET is_default = 0")
        
        updates = []
        params = []
        if name is not None and name.strip():
            updates.append("name = ?")
            params.append(name.strip())
        if is_default is not None:
            updates.append("is_default = ?")
            params.append(1 if is_default else 0)
            
        if updates:
            params.append(wallet_id)
            cursor.execute(f"UPDATE wallets SET {', '.join(updates)} WHERE id = ?", tuple(params))
            conn.commit()
            
        conn.close()
        return DBRepo.get_wallet(wallet_id)

    @staticmethod
    def delete_wallet(wallet_id: str) -> bool:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if wallet exists
        cursor.execute("SELECT is_default FROM wallets WHERE id = ?", (wallet_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
            
        was_default = bool(row["is_default"])
        
        # Delete addresses for this wallet
        cursor.execute("DELETE FROM addresses WHERE wallet_id = ?", (wallet_id,))
        # Delete withdrawals associated with this wallet
        cursor.execute("DELETE FROM withdrawals WHERE wallet_id = ?", (wallet_id,))
        # Delete payments associated with this wallet
        cursor.execute("DELETE FROM payments WHERE wallet_id = ?", (wallet_id,))
        # Delete the wallet itself
        cursor.execute("DELETE FROM wallets WHERE id = ?", (wallet_id,))
        
        # If this was default, assign default to another wallet if one exists
        if was_default:
            cursor.execute("SELECT id FROM wallets ORDER BY created_at ASC LIMIT 1")
            other = cursor.fetchone()
            if other:
                cursor.execute("UPDATE wallets SET is_default = 1 WHERE id = ?", (other["id"],))
                
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def get_wallet_addresses(wallet_id: str, network_id: str = None) -> List[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        if network_id and network_id != 'ALL':
            cursor.execute(
                "SELECT * FROM addresses WHERE wallet_id = ? AND network_id = ? ORDER BY address_index ASC",
                (wallet_id, network_id)
            )
        else:
            cursor.execute(
                "SELECT * FROM addresses WHERE wallet_id = ? ORDER BY network_id ASC, address_index ASC",
                (wallet_id,)
            )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        
        now_dt = datetime.now(timezone.utc)
        for r in rows:
            net_info = NETWORKS.get(r["network_id"], {})
            r["network_name"] = net_info.get("name", r["network_id"])
            r["short_name"] = net_info.get("short_name", "")
            r["icon"] = net_info.get("icon", "")
            r["gas_fee_est"] = net_info.get("gas_fee_est", "")
            r["confirmations_required"] = net_info.get("confirmations_required", 1)
            r["explorer_url"] = net_info.get("explorer_addr", "").format(address=r["address"])

            # Check temporary status
            if r.get("is_temporary") and r.get("expires_at"):
                try:
                    exp_dt = datetime.fromisoformat(r["expires_at"])
                    remaining_sec = int((exp_dt - now_dt).total_seconds())
                    r["remaining_seconds"] = max(0, remaining_sec)
                    if remaining_sec <= 0:
                        r["status"] = "EXPIRED"
                except Exception:
                    pass

        # Purge and filter out any expired disposable addresses
        active_rows = []
        expired_ids = []
        for r in rows:
            if r.get("status") == "EXPIRED":
                expired_ids.append(r["id"])
            else:
                active_rows.append(r)

        if expired_ids:
            try:
                conn_del = get_db()
                cur_del = conn_del.cursor()
                cur_del.executemany("DELETE FROM addresses WHERE id = ?", [(eid,) for eid in expired_ids])
                conn_del.commit()
                conn_del.close()
                DBRepo.refresh_wallet_total(wallet_id)
            except Exception:
                pass

        return active_rows

    @staticmethod
    def create_new_address(
        wallet_id: str,
        network_id: str,
        label: str = None,
        is_temporary: bool = False,
        duration_minutes: int = 0
    ) -> Dict[str, Any]:
        wallet = DBRepo.get_wallet(wallet_id)
        if not wallet:
            raise ValueError("Wallet not found")
        if network_id not in NETWORKS:
            raise ValueError(f"Unsupported network: {network_id}")

        seed_hex = decrypt_payload(wallet["encrypted_seed"])
        seed_bytes = bytes.fromhex(seed_hex)

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT MAX(address_index) as max_idx FROM addresses WHERE wallet_id = ? AND network_id = ?",
            (wallet_id, network_id)
        )
        row = cursor.fetchone()
        next_idx = (row["max_idx"] + 1) if row and row["max_idx"] is not None else 0

        item = WalletGenerator.derive_address_for_network(seed_bytes, network_id, address_index=next_idx)
        addr_id = "addr_" + uuid.uuid4().hex[:10]
        enc_priv = encrypt_payload(item["private_key"])
        
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        
        expires_at = None
        if is_temporary and duration_minutes > 0:
            expires_at = (now_dt + timedelta(minutes=duration_minutes)).isoformat()

        lbl = label or f"{item['short_name']} #{next_idx + 1}"
        if is_temporary:
            lbl += f" (Temp {duration_minutes}m)"

        cursor.execute("""
            INSERT INTO addresses (
                id, wallet_id, network_id, address, address_index, derivation_path,
                public_key, encrypted_private_key, label, balance, balance_usd,
                is_temporary, duration_minutes, expires_at, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, ?, ?, ?, 'ACTIVE', ?)
        """, (
            addr_id, wallet_id, network_id, item["address"],
            next_idx, item["derivation_path"], item["public_key"],
            enc_priv, lbl, 1 if is_temporary else 0, duration_minutes, expires_at, now
        ))
        conn.commit()
        conn.close()

        item["id"] = addr_id
        item["wallet_id"] = wallet_id
        item["label"] = lbl
        item["balance"] = 0.0
        item["balance_usd"] = 0.0
        item["is_temporary"] = is_temporary
        item["duration_minutes"] = duration_minutes
        item["expires_at"] = expires_at
        item["status"] = "ACTIVE"
        item["created_at"] = now
        return item

    @staticmethod
    def update_address_label(address_id: str, new_label: str):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE addresses SET label = ? WHERE id = ?", (new_label.strip(), address_id))
        conn.commit()
        conn.close()

    @staticmethod
    def update_address_balance(address_id: str, balance: float, balance_usd: float):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE addresses SET balance = ?, balance_usd = ? WHERE id = ?",
            (balance, balance_usd, address_id)
        )
        conn.commit()
        conn.close()

    @staticmethod
    def refresh_wallet_total(wallet_id: str) -> float:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(balance_usd) as total FROM addresses WHERE wallet_id = ?", (wallet_id,))
        row = cursor.fetchone()
        total = row["total"] or 0.0
        cursor.execute("UPDATE wallets SET total_balance_usd = ? WHERE id = ?", (total, wallet_id))
        conn.commit()
        conn.close()
        return total

    @staticmethod
    def add_payment_log(payment_id: str, message: str, event_type: str = "INFO", tx_hash: str = None, confirmations: int = 0, block_height: int = None):
        try:
            conn = get_db()
            cursor = conn.cursor()
            now = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
                INSERT INTO payment_logs (payment_id, event_type, message, tx_hash, confirmations, block_height, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (payment_id, event_type, message, tx_hash, confirmations, block_height, now))
            conn.commit()
            conn.close()
        except Exception:
            pass

    @staticmethod
    def get_payment_logs(payment_id: str) -> List[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payment_logs WHERE payment_id = ? ORDER BY id ASC", (payment_id,))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def create_withdrawal(
        wallet_id: str,
        network_id: str,
        token_symbol: str,
        destination_address: str,
        amount: float,
        amount_usd: float,
        fee_total: float,
        is_secured_chain: bool,
        chain_hops_count: int,
        hops_data: List[Dict[str, Any]],
        final_tx_hash: str,
        status: str = "COMPLETED"
    ) -> Dict[str, Any]:
        wid = "PAY-" + uuid.uuid4().hex[:8].upper()
        now = datetime.now(timezone.utc).isoformat()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO withdrawals (
                id, wallet_id, network_id, token_symbol, destination_address,
                amount, amount_usd, fee_total, is_secured_chain, chain_hops_count,
                status, final_tx_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            wid, wallet_id, network_id, token_symbol, destination_address,
            amount, amount_usd, fee_total, 1 if is_secured_chain else 0, chain_hops_count,
            status, final_tx_hash, now
        ))

        for idx, hop in enumerate(hops_data):
            cursor.execute("""
                INSERT INTO withdrawal_hops (
                    withdrawal_id, hop_index, from_address, to_address, amount, tx_hash, gas_fee, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                wid, idx + 1, hop["from_address"], hop["to_address"], hop["amount"],
                hop["tx_hash"], hop.get("gas_fee", 0.0), "COMPLETED", now
            ))

        conn.commit()
        conn.close()
        return DBRepo.get_withdrawal(wid)

    @staticmethod
    def get_withdrawal(withdrawal_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        w_dict = dict(row)
        cursor.execute("SELECT * FROM withdrawal_hops WHERE withdrawal_id = ? ORDER BY hop_index ASC", (withdrawal_id,))
        w_dict["hops"] = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return w_dict

    @staticmethod
    def list_withdrawals(wallet_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        if wallet_id:
            cursor.execute("SELECT * FROM withdrawals WHERE wallet_id = ? ORDER BY created_at DESC", (wallet_id,))
        else:
            cursor.execute("SELECT * FROM withdrawals ORDER BY created_at DESC", ())
        withdrawals = [dict(r) for r in cursor.fetchall()]
        for w in withdrawals:
            cursor.execute("SELECT * FROM withdrawal_hops WHERE withdrawal_id = ? ORDER BY hop_index ASC", (w["id"],))
            w["hops"] = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return withdrawals
