import os
import uuid
import qrcode
import io
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from app.config import settings, QR_CACHE_DIR
from app.database import get_db, DBRepo
from app.crypto.networks import NETWORKS, CURRENCY_NETWORK_MATRIX
from app.payments.balance_checker import ESTIMATED_PRICES_USD, PriceService

class PaymentService:
    @staticmethod
    def get_currency_options() -> Dict[str, Any]:
        """Returns the currency-network matrix for the checkout UI."""
        return CURRENCY_NETWORK_MATRIX

    @staticmethod
    def create_payment(
        currency: str = None,
        network_id: str = None,
        amount: float = 0.0,
        description: str = "",
        customer_ref: str = "",
        wallet_id: str = None,
        address_id: str = None,
        is_temporary: bool = False,
        duration_minutes: int = 30
    ) -> Dict[str, Any]:
        """Creates a payment invoice (universal blind link or pre-assigned)."""
        conn = get_db()
        cursor = conn.cursor()

        # Find default wallet
        if not wallet_id:
            cursor.execute("SELECT id FROM wallets WHERE is_default = 1 LIMIT 1")
            w = cursor.fetchone()
            if not w:
                cursor.execute("SELECT id FROM wallets ORDER BY created_at ASC LIMIT 1")
                w = cursor.fetchone()
            if not w:
                raise ValueError("No wallet available. Please generate a master wallet first.")
            wallet_id = w["id"]

        now_dt = datetime.now(timezone.utc)
        expire_mins = duration_minutes if (is_temporary and duration_minutes > 0) else settings.INVOICE_EXPIRE_MINUTES
        expires_dt = now_dt + timedelta(minutes=expire_mins)
        now_str = now_dt.isoformat()
        expires_str = expires_dt.isoformat()

        pay_address = ""
        qr_data = ""
        gas_fee_est = ""
        required_confs = 1
        amount_usd = round(amount, 2)
        crypto_amount = amount

        # If merchant selected a specific address from the wallet
        if address_id:
            cursor.execute("SELECT * FROM addresses WHERE id = ? AND wallet_id = ?", (address_id, wallet_id))
            addr_row = cursor.fetchone()
            if addr_row:
                network_id = addr_row["network_id"]
                net_info = NETWORKS.get(network_id, {})
                currency = currency or net_info.get("default_symbol", "")
                pay_address = addr_row["address"]
                qr_data = pay_address
                qr_img = qrcode.make(qr_data)
                qr_img.save(str(QR_CACHE_DIR / f"{payment_id if 'payment_id' in locals() else 'qr'}.png"))
                gas_fee_est = net_info.get("gas_fee_est", "")
                required_confs = net_info.get("confirmations_required", 1)

        is_blind = 1 if not network_id or not currency else 0
        payment_id = "PAY-" + uuid.uuid4().hex[:8].upper()

        if not is_blind:
            network_id = network_id.lower()
            if network_id not in NETWORKS:
                raise ValueError(f"Unsupported network: {network_id}")

            net_info = NETWORKS[network_id]
            gas_fee_est = net_info.get("gas_fee_est", "")
            required_confs = net_info.get("confirmations_required", 1)

            if not pay_address:
                # Get address for network
                cursor.execute(
                    "SELECT id, address FROM addresses WHERE wallet_id = ? AND network_id = ? AND status = 'ACTIVE' ORDER BY address_index DESC LIMIT 1",
                    (wallet_id, network_id)
                )
                addr_row = cursor.fetchone()
                if not addr_row:
                    new_addr = DBRepo.create_new_address(wallet_id, network_id, label=f"Receive {currency}")
                    address_id = new_addr["id"]
                    pay_address = new_addr["address"]
                else:
                    address_id = addr_row["id"]
                    pay_address = addr_row["address"]

            qr_data = pay_address
            # Pre-render QR
            qr_img = qrcode.make(qr_data)
            qr_img.save(str(QR_CACHE_DIR / f"{payment_id}.png"))

            # Calculate crypto amount from USD if amount entered
            if amount > 0:
                rate = PriceService.get_price(currency.upper())
                if currency.upper() in ["USDT", "USDC", "DAI", "BUSD"]:
                    crypto_amount = round(amount, 2)
                    amount_usd = round(amount, 2)
                else:
                    dec = 8 if rate >= 1000 else (6 if rate >= 10 else (4 if rate >= 1 else 2))
                    crypto_amount = round(amount / rate, dec) if rate > 0 else amount
                    amount_usd = round(amount, 2)

        public_url = DBRepo.get_setting("public_base_url", settings.PUBLIC_BASE_URL).rstrip("/")
        bot_user = DBRepo.get_setting("telegram_bot_username", settings.TELEGRAM_BOT_USERNAME).lstrip("@")

        web_link = f"{public_url}/pay/{payment_id}"
        telegram_link = f"https://t.me/{bot_user}?start={payment_id}"

        cursor.execute("""
            INSERT INTO payments (
                id, wallet_id, address_id, network_id, currency, token_symbol,
                contract_address, amount, amount_usd, status, pay_address, tx_hash,
                confirmations, required_confirmations, gas_fee_est, description,
                customer_ref, qr_data, web_link, telegram_link, is_blind,
                is_temporary, created_at, expires_at, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'PENDING', ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """, (
            payment_id, wallet_id, address_id, network_id or "", (currency.upper() if currency else ""),
            (currency.upper() if currency else ""), crypto_amount, amount_usd, pay_address or "",
            required_confs, gas_fee_est or "", description or "", customer_ref or "", qr_data or "",
            web_link, telegram_link, is_blind, 1 if is_temporary else 0, now_str, expires_str
        ))
        conn.commit()
        conn.close()

        DBRepo.add_payment_log(
            payment_id,
            f"Universal payment invoice created for {crypto_amount} {currency or 'USD'} (~${amount_usd} USD).",
            "CREATED"
        )

        return PaymentService.get_payment(payment_id)

    @staticmethod
    def select_network_for_blind_payment(payment_id: str, currency: str, network_id: str) -> Dict[str, Any]:
        """Called by the client (web checkout or telegram bot) to choose their preferred currency & network."""
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payments WHERE id = ?", (payment_id,))
        pay = cursor.fetchone()
        if not pay:
            conn.close()
            raise ValueError("Payment invoice not found")

        network_id = network_id.lower()
        if network_id not in NETWORKS:
            conn.close()
            raise ValueError(f"Unsupported network: {network_id}")

        net_info = NETWORKS[network_id]
        gas_fee_est = net_info.get("gas_fee_est", "")
        required_confs = net_info.get("confirmations_required", 1)

        # Get or derive address for this network in the payment's wallet
        wallet_id = pay["wallet_id"]
        cursor.execute(
            "SELECT id, address FROM addresses WHERE wallet_id = ? AND network_id = ? AND status = 'ACTIVE' ORDER BY address_index DESC LIMIT 1",
            (wallet_id, network_id)
        )
        addr_row = cursor.fetchone()
        if not addr_row:
            new_addr = DBRepo.create_new_address(wallet_id, network_id, label=f"Invoice {payment_id} {currency}")
            address_id = new_addr["id"]
            pay_address = new_addr["address"]
        else:
            address_id = addr_row["id"]
            pay_address = addr_row["address"]

        qr_data = pay_address
        qr_img = qrcode.make(qr_data)
        qr_img.save(str(QR_CACHE_DIR / f"{payment_id}.png"))

        # Calculate crypto amount if payment amount was entered in USD
        usd_val = pay["amount_usd"] if (pay["amount_usd"] and pay["amount_usd"] > 0) else pay["amount"]
        rate = PriceService.get_price(currency.upper())

        if usd_val > 0:
            if currency.upper() in ["USDT", "USDC", "DAI", "BUSD"]:
                crypto_amount = round(usd_val, 2)
                amount_usd = round(usd_val, 2)
            else:
                # E.g. LTC: $1.00 / $60.56 = 0.016513 LTC (not 1 LTC!)
                # BTC: $1.00 / $82500 = 0.00001212 BTC
                dec = 8 if rate >= 1000 else (6 if rate >= 10 else (4 if rate >= 1 else 2))
                crypto_amount = round(usd_val / rate, dec) if rate > 0 else usd_val
                amount_usd = round(usd_val, 2)
        else:
            crypto_amount = 0.0
            amount_usd = 0.0

        cursor.execute("""
            UPDATE payments SET
                network_id = ?, currency = ?, token_symbol = ?, address_id = ?,
                amount = ?, amount_usd = ?, pay_address = ?, qr_data = ?, gas_fee_est = ?, required_confirmations = ?
            WHERE id = ?
        """, (
            network_id, currency.upper(), currency.upper(), address_id,
            crypto_amount, amount_usd, pay_address, qr_data, gas_fee_est, required_confs, payment_id
        ))
        conn.commit()
        conn.close()

        net_name = net_info.get("name", network_id)
        DBRepo.add_payment_log(
            payment_id,
            f"Client selected {currency.upper()} on {net_name}. Expected: {crypto_amount} {currency.upper()} (~${amount_usd} USD). Address: {pay_address}",
            "NETWORK_SELECTED"
        )

        return PaymentService.get_payment(payment_id)

    @staticmethod
    def get_payment(payment_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payments WHERE id = ?", (payment_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        data = dict(row)

        now_dt = datetime.now(timezone.utc)
        if data.get("network_id"):
            net_info = NETWORKS.get(data["network_id"], {})
            data["network_name"] = net_info.get("name", data["network_id"])
            data["network_icon"] = net_info.get("icon", "")
            data["confirmation_time"] = net_info.get("confirmation_time", "Instant")
            data["explorer_addr"] = net_info.get("explorer_addr", "").format(address=data["pay_address"]) if data.get("pay_address") else ""
            data["explorer_tx"] = net_info.get("explorer_tx", "").format(tx=data["tx_hash"]) if data.get("tx_hash") else None
        else:
            data["network_name"] = "Selectable by Client"
            data["network_icon"] = "crypto"
            data["confirmation_time"] = "Varies by network"
            data["explorer_addr"] = ""
            data["explorer_tx"] = None

        # Check expiration & remaining time
        if data.get("expires_at"):
            try:
                exp_dt = datetime.fromisoformat(data["expires_at"])
                remaining = int((exp_dt - now_dt).total_seconds())
                data["remaining_seconds"] = max(0, remaining)
                if remaining <= 0 and data["status"] == "PENDING":
                    PaymentService.update_payment_status(payment_id, "EXPIRED")
                    data["status"] = "EXPIRED"
            except Exception:
                data["remaining_seconds"] = 0

        # Dynamically format links using configured public base URL / domain
        public_url = DBRepo.get_setting("public_base_url", settings.PUBLIC_BASE_URL).rstrip("/")
        bot_user = DBRepo.get_setting("telegram_bot_username", settings.TELEGRAM_BOT_USERNAME).lstrip("@")
        data["web_link"] = f"{public_url}/pay/{payment_id}"
        data["telegram_link"] = f"https://t.me/{bot_user}?start={payment_id}"

        # Attach real-time blockchain logs & events
        data["logs"] = DBRepo.get_payment_logs(payment_id)

        return data

    @staticmethod
    def list_payments(status: str = None, network_id: str = None, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()
        query = "SELECT * FROM payments WHERE 1=1"
        params = []
        if status and status.upper() != "ALL":
            query += " AND status = ?"
            params.append(status.upper())
        if network_id and network_id.lower() != "all":
            query += " AND network_id = ?"
            params.append(network_id.lower())

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, tuple(params))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        public_url = DBRepo.get_setting("public_base_url", settings.PUBLIC_BASE_URL).rstrip("/")
        bot_user = DBRepo.get_setting("telegram_bot_username", settings.TELEGRAM_BOT_USERNAME).lstrip("@")

        now_dt = datetime.now(timezone.utc)
        for r in rows:
            if r.get("network_id"):
                net_info = NETWORKS.get(r["network_id"], {})
                r["network_name"] = net_info.get("name", r["network_id"])
                r["network_icon"] = net_info.get("icon", "")
            else:
                r["network_name"] = "Client Choice"
                r["network_icon"] = "crypto"

            r["web_link"] = f"{public_url}/pay/{r['id']}"
            r["telegram_link"] = f"https://t.me/{bot_user}?start={r['id']}"

            if r.get("expires_at"):
                try:
                    exp_dt = datetime.fromisoformat(r["expires_at"])
                    r["remaining_seconds"] = max(0, int((exp_dt - now_dt).total_seconds()))
                except Exception:
                    r["remaining_seconds"] = 0

        return rows

    @staticmethod
    def get_stats() -> Dict[str, Any]:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total, SUM(amount_usd) as total_vol FROM payments WHERE status = 'PAID'")
        paid_res = cursor.fetchone()
        total_paid_count = paid_res["total"] or 0
        total_paid_vol = paid_res["total_vol"] or 0.0

        cursor.execute("SELECT COUNT(*) as pending_count FROM payments WHERE status IN ('PENDING', 'CONFIRMING')")
        pending_count = cursor.fetchone()["pending_count"] or 0

        cursor.execute("SELECT SUM(balance_usd) as total_treasury FROM addresses")
        treasury_res = cursor.fetchone()
        total_treasury = treasury_res["total_treasury"] or 0.0

        display_curr = DBRepo.get_setting("treasury_currency", "USD").upper()
        curr_symbols = {
            "USD": "$", "BTC": "₿", "ETH": "Ξ", "EUR": "€",
            "USDT": "₮", "LTC": "Ł", "SOL": "SOL", "BNB": "BNB", "TRX": "TRX"
        }
        sym = curr_symbols.get(display_curr, display_curr)

        rate = PriceService.get_price(display_curr)
        if display_curr in ["USD", "USDT", "USDC", "DAI"]:
            converted = round(total_treasury, 2)
        elif display_curr == "EUR":
            eur_rate = PriceService.get_price("EUR") or 1.08
            converted = round(total_treasury / eur_rate, 2)
        else:
            dec = 8 if rate >= 1000 else (6 if rate >= 10 else (4 if rate >= 1 else 2))
            converted = round(total_treasury / rate, dec) if rate > 0 else 0.0

        cursor.execute("SELECT COUNT(*) as wallets_count FROM wallets")
        wallets_count = cursor.fetchone()["wallets_count"] or 0

        cursor.execute("SELECT COUNT(*) as addrs_count FROM addresses")
        addresses_count = cursor.fetchone()["addrs_count"] or 0

        cursor.execute("SELECT * FROM payments ORDER BY created_at DESC LIMIT 5")
        recent = [dict(r) for r in cursor.fetchall()]
        for r in recent:
            if r.get("network_id"):
                net_info = NETWORKS.get(r["network_id"], {})
                r["network_name"] = net_info.get("name", r["network_id"])
                r["network_icon"] = net_info.get("icon", "")
            else:
                r["network_name"] = "Client Choice"
                r["network_icon"] = "crypto"

        conn.close()
        return {
            "total_treasury_usd": round(total_treasury, 2),
            "total_treasury_converted": converted,
            "display_currency": display_curr,
            "display_symbol": sym,
            "exchange_rate": rate,
            "total_paid_count": total_paid_count,
            "total_paid_volume_usd": round(total_paid_vol, 2),
            "pending_invoices_count": pending_count,
            "wallets_count": wallets_count,
            "addresses_count": addresses_count,
            "recent_payments": recent
        }

    @staticmethod
    def update_payment_status(
        payment_id: str,
        status: str,
        tx_hash: str = None,
        confirmations: int = 1
    ) -> Optional[Dict[str, Any]]:
        conn = get_db()
        cursor = conn.cursor()

        now_str = datetime.now(timezone.utc).isoformat()
        paid_at = now_str if status == "PAID" else None

        if tx_hash:
            cursor.execute(
                "UPDATE payments SET status = ?, tx_hash = ?, confirmations = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?",
                (status, tx_hash, confirmations, paid_at, payment_id)
            )
        else:
            cursor.execute(
                "UPDATE payments SET status = ?, confirmations = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?",
                (status, confirmations, paid_at, payment_id)
            )

        if status == "PAID":
            cursor.execute(
                "SELECT wallet_id, address_id, pay_address, network_id, amount, amount_usd, customer_ref FROM payments WHERE id = ?",
                (payment_id,)
            )
            prow = cursor.fetchone()
            if prow and prow["customer_ref"] != "OUTGOING":
                w_id = prow["wallet_id"]
                a_id = prow["address_id"]
                p_addr = prow["pay_address"]
                amt = float(prow["amount"] or 0.0)
                amt_usd = float(prow["amount_usd"] or 0.0)

                cursor.execute(
                    "SELECT id, balance, balance_usd FROM addresses WHERE id = ? OR address = ?",
                    (a_id, p_addr)
                )
                addr_rec = cursor.fetchone()
                if addr_rec:
                    new_bal = round(max((addr_rec["balance"] or 0.0), amt), 8)
                    new_bal_usd = round(max((addr_rec["balance_usd"] or 0.0), amt_usd), 2)
                    cursor.execute(
                        "UPDATE addresses SET balance = ?, balance_usd = ? WHERE id = ?",
                        (new_bal, new_bal_usd, addr_rec["id"])
                    )

                if w_id:
                    cursor.execute("SELECT SUM(balance_usd) as total FROM addresses WHERE wallet_id = ?", (w_id,))
                    tot_row = cursor.fetchone()
                    tot_val = round((tot_row["total"] or 0.0) if tot_row else 0.0, 2)
                    cursor.execute("UPDATE wallets SET total_balance_usd = ? WHERE id = ?", (tot_val, w_id))

        conn.commit()
        conn.close()

        # Update Telegram bot messages associated with this payment
        from app.telegram_bot.bot import TelegramBotManager
        try:
            TelegramBotManager.notify_status_update(payment_id, status, tx_hash)
        except Exception:
            pass

        return PaymentService.get_payment(payment_id)

    @staticmethod
    def simulate_payment_step(payment_id: str) -> Dict[str, Any]:
        curr = PaymentService.get_payment(payment_id)
        if not curr:
            raise ValueError("Payment not found")

        tx_dummy = "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:32]
        if curr.get("network_id") == "bitcoin":
            tx_dummy = uuid.uuid4().hex + uuid.uuid4().hex

        required = curr.get("required_confirmations") or 1

        if curr["status"] == "PENDING":
            return PaymentService.update_payment_status(payment_id, "CONFIRMING", tx_hash=tx_dummy, confirmations=1)
        elif curr["status"] == "CONFIRMING":
            return PaymentService.update_payment_status(payment_id, "PAID", tx_hash=curr["tx_hash"] or tx_dummy, confirmations=required)
        else:
            return PaymentService.update_payment_status(payment_id, "PENDING", tx_hash=None, confirmations=0)

    @staticmethod
    def get_qr_base64(payment_id: str) -> str:
        filepath = QR_CACHE_DIR / f"{payment_id}.png"
        if not filepath.exists():
            pay = PaymentService.get_payment(payment_id)
            if not pay or not pay.get("qr_data"):
                return ""
            img = qrcode.make(pay["qr_data"])
            img.save(str(filepath))

        with open(filepath, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"

    @staticmethod
    def set_telegram_user(payment_id: str, user_id: str, chat_id: str):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE payments SET telegram_user_id = ?, telegram_chat_id = ? WHERE id = ?",
            (user_id, chat_id, payment_id)
        )
        conn.commit()
        conn.close()
