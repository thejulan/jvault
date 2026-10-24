import os
import io
import asyncio
import logging
from datetime import datetime, timezone
from telethon import TelegramClient, events, Button
from telethon.errors import FloodWaitError
from app.config import settings, QR_CACHE_DIR
from app.database import get_db, DBRepo
from app.payments.service import PaymentService
from app.crypto.networks import NETWORKS, CURRENCY_NETWORK_MATRIX

logger = logging.getLogger("jvault.telegram")

class TelegramBotManager:
    client: TelegramClient = None
    is_running: bool = False
    _runner_task: asyncio.Task = None
    _retry_task: asyncio.Task = None
    cooldown_until: float = 0.0
    cooldown_message: str = ""

    @classmethod
    def get_status(cls) -> dict:
        api_id = DBRepo.get_setting("telegram_api_id", str(settings.TELEGRAM_API_ID or ""))
        bot_token = DBRepo.get_setting("telegram_bot_token", settings.TELEGRAM_BOT_TOKEN)
        bot_user = DBRepo.get_setting("telegram_bot_username", settings.TELEGRAM_BOT_USERNAME)

        now = datetime.now(timezone.utc).timestamp()
        cooldown_rem = max(0, int(cls.cooldown_until - now)) if cls.cooldown_until > now else 0

        is_configured = bool(api_id and api_id != "0" and bot_token)
        return {
            "configured": is_configured,
            "running": cls.is_running,
            "bot_username": bot_user,
            "api_id": api_id if api_id != "0" else "",
            "has_token": bool(bot_token),
            "cooldown_seconds": cooldown_rem,
            "cooldown_message": cls.cooldown_message if cooldown_rem > 0 else ""
        }

    @classmethod
    async def start(cls):
        """Starts Telethon bot instance and sets up the background receiver task."""
        if cls.is_running:
            return

        now = datetime.now(timezone.utc).timestamp()
        if cls.cooldown_until > now:
            remaining = int(cls.cooldown_until - now)
            logger.warning(f"Telegram MTProto cooldown active: {remaining}s remaining before retry.")
            return

        api_id_str = DBRepo.get_setting("telegram_api_id", str(settings.TELEGRAM_API_ID or ""))
        api_hash = DBRepo.get_setting("telegram_api_hash", settings.TELEGRAM_API_HASH)
        bot_token = DBRepo.get_setting("telegram_bot_token", settings.TELEGRAM_BOT_TOKEN)

        if not api_id_str or api_id_str == "0" or not api_hash or not bot_token:
            if bot_token:
                asyncio.create_task(cls.sync_bot_profile(bot_token))
            logger.info("Telegram bot not fully configured. Set credentials in Settings to activate.")
            return

        try:
            api_id = int(api_id_str)
            # Persistent SQLite session file: session key is saved to disk so repeated authorizations are not sent
            session_file = str(settings.DATA_DIR / "telethon_bot")
            cls.client = TelegramClient(session_file, api_id, api_hash)
            await cls.client.connect()

            if not await cls.client.is_user_authorized():
                logger.info("Telethon session not authorized yet. Signing in with bot token...")
                try:
                    await cls.client.sign_in(bot_token=bot_token)
                except FloodWaitError as fe:
                    cls.cooldown_until = datetime.now(timezone.utc).timestamp() + fe.seconds
                    cls.cooldown_message = f"Telegram rate limit: wait {fe.seconds}s (~{round(fe.seconds / 60, 1)} min) required before re-authorizing."
                    logger.warning(f"Telegram login cooldown: {cls.cooldown_message}. Retry scheduled.")
                    if cls._retry_task and not cls._retry_task.done():
                        cls._retry_task.cancel()
                    cls._retry_task = asyncio.create_task(cls._delayed_retry(fe.seconds + 2))
                    cls.is_running = False
                    return

            # Clear cooldown on successful authorization
            cls.cooldown_until = 0.0
            cls.cooldown_message = ""

            cls._register_handlers()
            cls.is_running = True

            # Telethon needs run_until_disconnected in an asyncio background task to process events
            cls._runner_task = asyncio.create_task(cls.client.run_until_disconnected())

            me = await cls.client.get_me()
            username = me.username or settings.TELEGRAM_BOT_USERNAME
            logger.info(f"Telegram Bot @{username} successfully started with Telethon!")
            DBRepo.set_setting("telegram_bot_username", username)

            # Sync bot profile data on program start
            asyncio.create_task(cls.sync_bot_profile(bot_token, me))
        except FloodWaitError as fe:
            cls.cooldown_until = datetime.now(timezone.utc).timestamp() + fe.seconds
            cls.cooldown_message = f"Telegram rate limit: wait {fe.seconds}s (~{round(fe.seconds / 60, 1)} min) required."
            logger.warning(f"Telegram FloodWaitError: {cls.cooldown_message}")
            if cls._retry_task and not cls._retry_task.done():
                cls._retry_task.cancel()
            cls._retry_task = asyncio.create_task(cls._delayed_retry(fe.seconds + 2))
            cls.is_running = False
        except Exception as e:
            logger.error(f"Failed to start : {e}")
            cls.is_running = False

    @classmethod
    async def _delayed_retry(cls, seconds: int):
        try:
            await asyncio.sleep(seconds)
            logger.info("Telegram FloodWait cooldown expired. Automatically attempting to start bot...")
            await cls.start()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error during delayed bot start: {e}")

    @classmethod
    async def sync_bot_profile(cls, bot_token: str, me=None):
        """
        Synchronizes bot data when program starts:
        1. BOT NAME + " - Powered By JVault"
        2. Description and GitHub URL under it (https://github.com/thejulan/jvault)
        3. Bot profile photo set to the project logo (dashboard/assets/logo.png)
        """
        if not bot_token:
            return

        import httpx
        from app.config import BASE_DIR
        logo_path = BASE_DIR.parent / "dashboard" / "assets" / "logo.png"

        # 1. Determine bot name logic: OLD_BOT_NAME + " - Powered By JVault"
        # If the bot name already has " - Powered By JVault", pass (do not modify name)
        old_bot_name = ""
        if me and hasattr(me, "first_name") and me.first_name:
            old_bot_name = me.first_name.strip()

        if not old_bot_name:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as quick_http:
                    res = await quick_http.get(f"https://api.telegram.org/bot{bot_token}/getMyName")
                    if res.status_code == 200:
                        old_bot_name = res.json().get("result", {}).get("name", "").strip()
            except Exception:
                pass

        if not old_bot_name:
            old_bot_name = "Julan"

        suffix = " - Powered By JVault"
        if "- Powered By JVault" in old_bot_name:
            # Already has " - Powered By JVault", pass
            update_name = False
            target_name = old_bot_name
            logger.info(f"Bot name already contains '{suffix}' ('{old_bot_name}'). Passing name update.")
        else:
            update_name = True
            # Max Telegram bot name length is 64 chars
            max_base = 64 - len(suffix)
            base_name = old_bot_name[:max_base].strip() if len(old_bot_name) > max_base else old_bot_name
            target_name = f"{base_name}{suffix}"
            logger.info(f"Changing bot name from '{old_bot_name}' to '{target_name}'")

        description_text = (
            "JVault is a secure, non-custodial multi-chain cryptocurrency payment gateway and universal self-hosted treasury.\n\n"
            "https://github.com/thejulan/jvault"
        )
        short_desc = "Powered by JVault\nUniversal Multi-Chain Crypto Gateway.\nhttps://github.com/thejulan/jvault"

        # 2. Update via Telethon MTProto if client connected
        if cls.client and cls.is_running:
            # First, update description and about text
            try:
                from telethon.tl.functions.bots import SetBotInfoRequest
                await cls.client(SetBotInfoRequest(
                    lang_code="",
                    about=short_desc,
                    description=description_text
                ))
                logger.info("Bot description and about synchronized via Telethon MTProto")
            except Exception as e:
                logger.warning(f"Telethon SetBotInfoRequest (description) note: {e}")

            # Second, update name if needed
            if update_name:
                try:
                    from telethon.tl.functions.bots import SetBotInfoRequest
                    await cls.client(SetBotInfoRequest(
                        lang_code="",
                        name=target_name
                    ))
                    logger.info(f"Bot name updated to '{target_name}' via Telethon MTProto")
                except Exception as e:
                    logger.warning(f"Telethon SetBotInfoRequest (name) note: {e}")

            if logo_path.exists():
                try:
                    from telethon.tl.functions.photos import UploadProfilePhotoRequest
                    uploaded_file = await cls.client.upload_file(str(logo_path))
                    await cls.client(UploadProfilePhotoRequest(file=uploaded_file))
                    logger.info("Bot profile photo uploaded via Telethon MTProto successfully")
                except Exception as e:
                    logger.debug(f"Telethon UploadProfilePhotoRequest note: {e}")

        # 3. Update via Telegram Bot API HTTP as well
        try:
            async with httpx.AsyncClient(timeout=10.0) as http:
                # Update Bot Name only if it needs update
                if update_name:
                    try:
                        await http.post(
                            f"https://api.telegram.org/bot{bot_token}/setMyName",
                            json={"name": target_name}
                        )
                    except Exception:
                        pass

                # Update Description & Short Description
                try:
                    await http.post(
                        f"https://api.telegram.org/bot{bot_token}/setMyDescription",
                        json={"description": description_text}
                    )
                    await http.post(
                        f"https://api.telegram.org/bot{bot_token}/setMyShortDescription",
                        json={"short_description": short_desc}
                    )
                except Exception:
                    pass

                # Update Profile Photo
                if logo_path.exists():
                    try:
                        with open(logo_path, "rb") as f:
                            file_bytes = f.read()
                        await http.post(
                            f"https://api.telegram.org/bot{bot_token}/setMyProfilePhoto",
                            data={"photo": '{"type":"static","photo":"attach://bot_avatar"}'},
                            files={"bot_avatar": ("logo.png", file_bytes, "image/png")}
                        )
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"HTTP Bot API sync note: {e}")

    @classmethod
    async def stop(cls):
        """Stops the Telethon client and cancels runner and retry tasks."""
        if cls._retry_task and not cls._retry_task.done():
            cls._retry_task.cancel()
            cls._retry_task = None

        if cls.client:
            try:
                if cls._runner_task and not cls._runner_task.done():
                    cls._runner_task.cancel()
                    cls._runner_task = None
                if cls.client.is_connected():
                    await cls.client.disconnect()
            except Exception:
                pass
            cls.is_running = False
            cls.client = None
            logger.info("Telegram Bot stopped")

    @classmethod
    def _register_handlers(cls):
        @cls.client.on(events.NewMessage(pattern=r'^/start(?:\s+(.+))?'))
        async def handle_start(event):
            param = event.pattern_match.group(1)
            if not param:
                welcome_text = (
                    "👋 **Welcome to JVault Crypto Gateway**\n\n"
                    "I am the automated payment validator & invoice bot for JVault.\n\n"
                    "⚡ **Powered by [JVault](https://github.com/thejulan/jvault)**"
                )
                await event.respond(welcome_text)
                return

            pay_id = param.strip()
            pay = PaymentService.get_payment(pay_id)
            if not pay:
                await event.respond(f"❌ **Invoice `{pay_id}` not found or has expired.**")
                return

            # Record telegram user_id and chat_id so they receive push status notifications
            sender_id = str(event.sender_id or event.chat_id)
            PaymentService.set_telegram_user(pay_id, user_id=sender_id, chat_id=str(event.chat_id))

            # Check if invoice is blind (client needs to select token and network)
            if not pay.get("network_id") or not pay.get("pay_address"):
                await cls._send_token_selection(event.chat_id, pay)
            else:
                await cls._send_payment_invoice(event.chat_id, pay)

        @cls.client.on(events.CallbackQuery(pattern=r'^token:([^:]+):(.+)'))
        async def handle_token_select(event):
            currency = event.data_match.group(1).decode('utf-8')
            pay_id = event.data_match.group(2).decode('utf-8')
            pay = PaymentService.get_payment(pay_id)
            if not pay:
                await event.answer("Invoice expired or not found", alert=True)
                return

            # Show available networks for this token
            networks = CURRENCY_NETWORK_MATRIX.get(currency, [])
            if not networks:
                await event.answer("No networks found for this token", alert=True)
                return

            text = (
                f"💳 **Invoice `{pay_id}`**\n"
                f"Selected: **{currency}**\n\n"
                f"Choose the blockchain network standard to transfer funds:"
            )

            buttons = []
            for net in networks:
                btn_text = f"{net['network_name']} (Fee: {net['gas_fee_est']})"
                buttons.append([Button.inline(btn_text, data=f"net:{net['network_id']}:{currency}:{pay_id}")])

            buttons.append([Button.inline("« Back to Tokens", data=f"back_tokens:{pay_id}")])
            await event.edit(text, buttons=buttons)

        @cls.client.on(events.CallbackQuery(pattern=r'^back_tokens:(.+)'))
        async def handle_back_tokens(event):
            pay_id = event.data_match.group(1).decode('utf-8')
            pay = PaymentService.get_payment(pay_id)
            if not pay:
                await event.answer("Invoice expired", alert=True)
                return
            await cls._edit_token_selection(event, pay)

        @cls.client.on(events.CallbackQuery(pattern=r'^net:([^:]+):([^:]+):(.+)'))
        async def handle_net_select(event):
            net_id = event.data_match.group(1).decode('utf-8')
            currency = event.data_match.group(2).decode('utf-8')
            pay_id = event.data_match.group(3).decode('utf-8')

            try:
                updated_pay = PaymentService.select_network_for_blind_payment(pay_id, currency, net_id)
                await event.delete()
                await cls._send_payment_invoice(event.chat_id, updated_pay)
            except Exception as e:
                await event.answer(f"Error: {e}", alert=True)

        @cls.client.on(events.CallbackQuery(pattern=r'^check:(.+)'))
        async def handle_check_callback(event):
            pay_id = event.data_match.group(1).decode('utf-8')
            pay = PaymentService.get_payment(pay_id)
            if not pay:
                await event.answer("Invoice not found.", alert=True)
                return

            caption, buttons = cls._format_invoice_message(pay)
            try:
                await event.edit(caption, buttons=buttons)
                await event.answer(f"Status: {pay['status']}", alert=False)
            except Exception:
                await event.answer(f"Current Status: {pay['status']}", alert=False)

    @classmethod
    async def _send_token_selection(cls, chat_id: int, pay: dict):
        desc = pay.get("description") or pay.get("label") or ""
        desc_line = f"📝 **Description:** {desc}\n" if desc else ""
        text = (
            f"💳 **JVault Payment Invoice `{pay['id']}`**\n"
            f"───────────────────────────\n"
            f"💰 **Amount:** `{pay['amount'] or 'Open'}` USD\n"
            f"{desc_line}\n"
            f"👉 **Please choose which cryptocurrency you want to pay with:**\n\n"
            f"⚡ **Powered by [JVault](https://github.com/thejulan/jvault)**"
        )
        buttons = [
            [Button.inline("💵 USDT", data=f"token:USDT:{pay['id']}"), Button.inline("₿ Bitcoin (BTC)", data=f"token:BTC:{pay['id']}")],
            [Button.inline("⟠ Ethereum (ETH)", data=f"token:ETH:{pay['id']}"), Button.inline("☀️ Solana (SOL)", data=f"token:SOL:{pay['id']}")],
            [Button.inline("Ł Litecoin (LTC)", data=f"token:LTC:{pay['id']}"), Button.inline("🔴 TRON (TRX)", data=f"token:TRX:{pay['id']}")],
            [Button.inline("💎 TON", data=f"token:TON:{pay['id']}"), Button.inline("🟡 BNB (BSC)", data=f"token:BNB:{pay['id']}")],
            [Button.inline("🐕 Dogecoin (DOGE)", data=f"token:DOGE:{pay['id']}"), Button.inline("🪙 USDC", data=f"token:USDC:{pay['id']}")]
        ]
        await cls.client.send_message(chat_id, text, buttons=buttons)

    @classmethod
    async def _edit_token_selection(cls, event, pay: dict):
        desc = pay.get("description") or pay.get("label") or ""
        desc_line = f"📝 **Description:** {desc}\n" if desc else ""
        text = (
            f"💳 **JVault Payment Invoice `{pay['id']}`**\n"
            f"───────────────────────────\n"
            f"💰 **Amount:** `{pay.get('amount_usd') or pay['amount'] or 'Open'}` USD\n"
            f"{desc_line}\n"
            f"👉 **Please choose which cryptocurrency you want to pay with:**\n\n"
            f"⚡ **Powered by [JVault](https://github.com/thejulan/jvault)**"
        )
        buttons = [
            [Button.inline("💵 USDT", data=f"token:USDT:{pay['id']}"), Button.inline("₿ Bitcoin (BTC)", data=f"token:BTC:{pay['id']}")],
            [Button.inline("⟠ Ethereum (ETH)", data=f"token:ETH:{pay['id']}"), Button.inline("☀️ Solana (SOL)", data=f"token:SOL:{pay['id']}")],
            [Button.inline("Ł Litecoin (LTC)", data=f"token:LTC:{pay['id']}"), Button.inline("🔴 TRON (TRX)", data=f"token:TRX:{pay['id']}")],
            [Button.inline("💎 TON", data=f"token:TON:{pay['id']}"), Button.inline("🟡 BNB (BSC)", data=f"token:BNB:{pay['id']}")],
            [Button.inline("🐕 Dogecoin (DOGE)", data=f"token:DOGE:{pay['id']}"), Button.inline("🪙 USDC", data=f"token:USDC:{pay['id']}")]
        ]
        await event.edit(text, buttons=buttons)

    @classmethod
    def _format_invoice_message(cls, pay: dict) -> tuple[str, list]:
        status = pay["status"]
        req_confs = pay.get("required_confirmations") or 1
        current_confs = pay.get("confirmations") or 0
        is_outgoing = pay.get("customer_ref") == "OUTGOING"

        if status in ("PAID", "COMPLETED"):
            status_badge = "🟢 **CONFIRMED & SETTLED ✅**"
        elif status == "CONFIRMING":
            status_badge = f"🟠 **CONFIRMING ({current_confs}/{req_confs})**"
        elif status == "EXPIRED":
            status_badge = "🔴 **EXPIRED**"
        else:
            status_badge = "🟡 **PENDING (Broadcasting / Awaiting)**"

        amt_display = f"{pay['amount']} {pay.get('currency', 'USD')}" if pay["amount"] > 0 else f"Open Amount ({pay.get('currency', 'USD')})"
        usd_display = f"(~${pay['amount_usd']} USD)" if pay.get("amount_usd", 0) > 0 else ""

        # Remaining time for temporary address
        rem_sec = pay.get("remaining_seconds", 0)
        timer_text = ""
        if rem_sec > 0:
            m = rem_sec // 60
            s = rem_sec % 60
            timer_text = f"\n⏳ **Address Expires In:** `{m}m {s}s`"

        header_title = "📤 **JVault Outgoing Transfer**" if is_outgoing else "💳 **JVault Crypto Payment Invoice**"
        addr_label = "📬 **Recipient Destination Address:**" if is_outgoing else "📬 **Deposit Address:**"
        footer_note = "💡 *Funds were dispatched to the destination address above.*" if is_outgoing else "💡 *Tap the address above to copy. Send exact funds on the specified network.*"

        desc = pay.get("description") or pay.get("label") or ""

        lines = [
            header_title,
            "───────────────────────────",
            f"🏷️ **Tracking ID:** `{pay['id']}`",
        ]
        if desc:
            lines.append(f"📝 **Description:** {desc}")

        lines.extend([
            f"💰 **Amount:** `{amt_display}` {usd_display}",
            f"🌐 **Network:** **{pay.get('network_name', pay.get('network_id', 'N/A'))}**",
            f"⛽ **Gas Fee Est:** `{pay.get('gas_fee_est', 'Standard')}`",
            f"🔒 **Confirmations Required:** `{req_confs}`",
            addr_label,
            f"`{pay['pay_address']}`",
            timer_text,
            "",
            f"⚡ **Status:** {status_badge}",
        ])

        if pay.get("expires_at"):
            lines.append(f"⏰ **Expires:** `{str(pay['expires_at'])[:19].replace('T', ' ')} UTC`")

        if pay.get("tx_hash"):
            lines.append(f"🔗 **TxID:** `{pay['tx_hash']}`")

        lines.extend([
            "───────────────────────────",
            footer_note,
            "⚡ **Powered by [JVault](https://github.com/thejulan/jvault)**"
        ])

        caption = "\n".join([l for l in lines if l != ""])

        buttons = [
            [Button.inline("🔄 Refresh Status", data=f"check:{pay['id']}")]
        ]
        if pay.get("explorer_tx"):
            buttons.append([Button.url("🔍 View on Blockchain Explorer", pay["explorer_tx"])])

        return caption, buttons

    @classmethod
    def _format_status_notification_text(cls, pay: dict, status: str) -> str:
        amt = f"{pay.get('amount', 0)} {pay.get('currency', 'USD')}"
        usd = f"(~${pay.get('amount_usd', 0)} USD)" if pay.get('amount_usd') else ""
        pay_id = pay.get("id")
        tx = pay.get("tx_hash") or ""
        tx_line = f"🔗 **TxID:** `{tx}`\n" if tx else ""
        is_outgoing = pay.get("customer_ref") == "OUTGOING"
        desc = pay.get("description") or pay.get("label") or ""
        desc_line = f"📝 **Description:** {desc}\n" if desc else ""
        powered_by = "\n⚡ **Powered by [JVault](https://github.com/thejulan/jvault)**"

        if status in ("PAID", "COMPLETED"):
            if is_outgoing:
                return (
                    f"🎉 **Outgoing Transfer Confirmed & Settled!** ✅\n"
                    f"───────────────────────────\n"
                    f"🏷️ **Tracking ID:** `{pay_id}`\n"
                    f"{desc_line}"
                    f"💰 **Amount Settled:** `{amt}` {usd}\n"
                    f"🌐 **Network:** **{pay.get('network_name', pay.get('network_id', 'Crypto'))}**\n"
                    f"📬 **Recipient:** `{pay.get('pay_address')}`\n"
                    f"{tx_line}\n"
                    f"✨ *Transaction has received full on-chain confirmations and is complete.*"
                    f"{powered_by}"
                )
            else:
                return (
                    f"🎉 **Payment Received & Confirmed!** ✅\n"
                    f"───────────────────────────\n"
                    f"🏷️ **Invoice ID:** `{pay_id}`\n"
                    f"{desc_line}"
                    f"💰 **Amount Settled:** `{amt}` {usd}\n"
                    f"🌐 **Network:** **{pay.get('network_name', pay.get('network_id', 'Crypto'))}**\n"
                    f"{tx_line}\n"
                    f"✨ *Your payment has been finalized and verified on the blockchain.*"
                    f"{powered_by}"
                )
        elif status == "CONFIRMING":
            confs = pay.get('confirmations', 1)
            req = pay.get('required_confirmations', 2)
            lbl = "Outgoing Transfer" if is_outgoing else "Incoming Payment"
            return (
                f"⏳ **Transaction Detected on Blockchain!** ⚡\n"
                f"───────────────────────────\n"
                f"🏷️ **ID:** `{pay_id}` ({lbl})\n"
                f"{desc_line}"
                f"💰 **Amount:** `{amt}`\n"
                f"🌐 **Network:** **{pay.get('network_name', pay.get('network_id', 'Crypto'))}**\n"
                f"🔄 **Confirmations:** `{confs}/{req}`\n"
                f"{tx_line}\n"
                f"🔍 *Blocks are currently confirming. Status will update to SETTLED once confirmed.*"
                f"{powered_by}"
            )
        elif status == "EXPIRED":
            return (
                f"⚠️ **Payment Invoice Expired** 🔴\n"
                f"───────────────────────────\n"
                f"🏷️ **Invoice ID:** `{pay_id}`\n"
                f"{desc_line}"
                f"💰 **Amount:** `{amt}`\n\n"
                f"If you have already broadcast a transaction, please contact support with your TxHash."
                f"{powered_by}"
            )
        else:
            return (
                f"🔔 **Payment Status Update**\n"
                f"───────────────────────────\n"
                f"🏷️ **ID:** `{pay_id}`\n"
                f"{desc_line}"
                f"⚡ **Status:** **{status}**\n"
                f"💰 **Amount:** `{amt}`\n"
                f"{tx_line}"
                f"{powered_by}"
            )

    @classmethod
    async def _send_payment_invoice(cls, chat_id: int, pay: dict):
        caption, buttons = cls._format_invoice_message(pay)
        qr_file = QR_CACHE_DIR / f"{pay['id']}.png"

        if not qr_file.exists() and pay.get("qr_data"):
            import qrcode
            qrcode.make(pay["qr_data"]).save(str(qr_file))

        if qr_file.exists():
            msg = await cls.client.send_file(
                chat_id,
                file=str(qr_file),
                caption=caption,
                buttons=buttons
            )
        else:
            msg = await cls.client.send_message(
                chat_id,
                message=caption,
                buttons=buttons
            )

        # Record for auto-sync
        conn = get_db()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO telegram_messages (payment_id, chat_id, message_id, last_status, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (pay["id"], str(chat_id), msg.id, pay["status"], now_str))
        conn.commit()
        conn.close()

    @classmethod
    def notify_status_update(cls, payment_id: str, new_status: str, tx_hash: str = None):
        """Asynchronously updates active Telegram messages and sends push status alerts."""
        if not cls.client or not cls.is_running:
            return

        asyncio.create_task(cls._async_sync_messages(payment_id))

    @classmethod
    async def _async_sync_messages(cls, payment_id: str):
        pay = PaymentService.get_payment(payment_id)
        if not pay:
            return

        status = pay.get("status")
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM telegram_messages WHERE payment_id = ?", (payment_id,))
        rows = [dict(r) for r in cursor.fetchall()]

        caption, buttons = cls._format_invoice_message(pay)

        # 1. Update in-place all invoice card messages
        notified_chats = set()
        for r in rows:
            try:
                chat_id = int(r["chat_id"]) if str(r["chat_id"]).lstrip('-').isdigit() else r["chat_id"]
                msg_id = r["message_id"]
                await cls.client.edit_message(chat_id, msg_id, text=caption, buttons=buttons)

                # If status changed from last notification, record this chat
                if r.get("last_status") != status:
                    notified_chats.add(chat_id)

                now_str = datetime.now(timezone.utc).isoformat()
                cursor.execute(
                    "UPDATE telegram_messages SET last_status = ?, updated_at = ? WHERE id = ?",
                    (status, now_str, r["id"])
                )
                conn.commit()
            except Exception as e:
                logger.debug(f"Could not edit telegram message {r.get('id')}: {e}")

        # Check if payment has telegram_chat_id recorded on the payment itself
        p_chat = pay.get("telegram_chat_id")
        if p_chat:
            c_int = int(p_chat) if str(p_chat).lstrip('-').isdigit() else p_chat
            if not rows or any(r.get("last_status") != status for r in rows):
                notified_chats.add(c_int)

        conn.close()

        # 2. Send proactive push notification message for status change
        if notified_chats and status in ("CONFIRMING", "PAID", "COMPLETED", "EXPIRED"):
            alert_text = cls._format_status_notification_text(pay, status)
            for c_id in notified_chats:
                try:
                    await cls.client.send_message(c_id, alert_text)
                    logger.info(f"Sent Telegram push status update ({status}) to chat {c_id} for {payment_id}")
                except Exception as e:
                    logger.warning(f"Failed to send Telegram status alert to {c_id}: {e}")
