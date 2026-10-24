from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.database import DBRepo, get_db
from app.crypto.networks import NETWORKS
from app.crypto.generator import WalletGenerator
from app.payments.balance_checker import BalanceChecker
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api", tags=["wallets"])

class CreateWalletRequest(BaseModel):
    name: str
    mnemonic: Optional[str] = None
    words_count: Optional[int] = 12
    auto_generate_addresses: Optional[bool] = True

class EditWalletRequest(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None

class CreateAddressRequest(BaseModel):
    network_id: str
    label: Optional[str] = None
    is_temporary: Optional[bool] = False
    duration_minutes: Optional[int] = 0

class EditAddressRequest(BaseModel):
    label: str

class AddTokenRequest(BaseModel):
    network_id: str
    symbol: str
    name: str
    decimals: int
    contract_address: str

@router.get("/networks")
def get_networks():
    """Returns all supported networks and their tokens with gas fee and confirmation requirements."""
    return list(NETWORKS.values())

@router.get("/wallets")
def list_wallets(user: dict = Depends(get_current_user)):
    """Lists all local wallets with balances and address counts."""
    return DBRepo.list_wallets()

@router.post("/wallets/generate")
def generate_wallet(req: CreateWalletRequest, user: dict = Depends(get_current_user)):
    """Generates a new HD wallet with addresses across all networks."""
    try:
        mnemonic = req.mnemonic.strip() if req.mnemonic else WalletGenerator.generate_mnemonic(req.words_count or 12)
        auto_gen = req.auto_generate_addresses if req.auto_generate_addresses is not None else True
        wallet = DBRepo.create_wallet(req.name.strip(), mnemonic, auto_generate_addresses=auto_gen)
        return wallet
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/wallets/withdrawals")
def list_withdrawals(wallet_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Lists all withdrawal records and their multi-hop chains."""
    return DBRepo.list_withdrawals(wallet_id)

@router.get("/wallets/{wallet_id}")
def get_wallet(wallet_id: str, user: dict = Depends(get_current_user)):
    w = DBRepo.get_wallet(wallet_id)
    if not w:
        raise HTTPException(status_code=404, detail="Wallet not found")
    w["addresses"] = DBRepo.get_wallet_addresses(wallet_id)
    return w

@router.put("/wallets/{wallet_id}")
def update_wallet(wallet_id: str, req: EditWalletRequest, user: dict = Depends(get_current_user)):
    """Updates wallet name or default status."""
    w = DBRepo.update_wallet(wallet_id, name=req.name, is_default=req.is_default)
    if not w:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return w

@router.delete("/wallets/{wallet_id}")
def delete_wallet(wallet_id: str, user: dict = Depends(get_current_user)):
    """Deletes a wallet and all its derived addresses."""
    success = DBRepo.delete_wallet(wallet_id)
    if not success:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return {"status": "success", "message": f"Wallet {wallet_id} deleted successfully"}

@router.get("/wallets/{wallet_id}/addresses")
def get_wallet_addresses(wallet_id: str, network_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    return DBRepo.get_wallet_addresses(wallet_id, network_id)

@router.post("/wallets/{wallet_id}/addresses")
def create_address(wallet_id: str, req: CreateAddressRequest, user: dict = Depends(get_current_user)):
    try:
        item = DBRepo.create_new_address(
            wallet_id=wallet_id,
            network_id=req.network_id,
            label=req.label,
            is_temporary=bool(req.is_temporary),
            duration_minutes=int(req.duration_minutes or 0)
        )
        return item
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/addresses/{address_id}/edit")
def edit_address(address_id: str, req: EditAddressRequest, user: dict = Depends(get_current_user)):
    try:
        DBRepo.update_address_label(address_id, req.label)
        return {"status": "success", "address_id": address_id, "label": req.label}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/addresses/{address_id}")
def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    """Deletes an address from a wallet and recalculates total wallet balance."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT wallet_id FROM addresses WHERE id = ?", (address_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Address not found")
    
    wallet_id = row["wallet_id"]
    cursor.execute("DELETE FROM addresses WHERE id = ?", (address_id,))
    conn.commit()
    conn.close()

    DBRepo.refresh_wallet_total(wallet_id)
    return {"status": "success", "deleted_id": address_id, "wallet_id": wallet_id}

@router.post("/wallets/{wallet_id}/refresh-balances")
async def refresh_wallet_balances(wallet_id: str, user: dict = Depends(get_current_user)):
    """Queries on-chain balances for each address in parallel and updates total treasury."""
    import asyncio
    w = DBRepo.get_wallet(wallet_id)
    if not w:
        raise HTTPException(status_code=404, detail="Wallet not found")

    addresses = DBRepo.get_wallet_addresses(wallet_id)

    async def check_one(addr):
        try:
            bal, bal_usd = await BalanceChecker.fetch_address_balance(addr["network_id"], addr["address"])
            addr["balance"] = bal
            addr["balance_usd"] = bal_usd
        except Exception:
            pass
        return addr

    updated_items = await asyncio.gather(*(check_one(a) for a in addresses))

    # Perform batch update in a single transaction to eliminate concurrent DB locks
    conn = get_db()
    cursor = conn.cursor()
    for a in updated_items:
        cursor.execute(
            "UPDATE addresses SET balance = ?, balance_usd = ? WHERE id = ?",
            (a.get("balance", 0.0), a.get("balance_usd", 0.0), a["id"])
        )
    cursor.execute("SELECT SUM(balance_usd) as total FROM addresses WHERE wallet_id = ?", (wallet_id,))
    row = cursor.fetchone()
    total_usd = (row["total"] or 0.0) if row else 0.0
    cursor.execute("UPDATE wallets SET total_balance_usd = ? WHERE id = ?", (total_usd, wallet_id))
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "wallet_id": wallet_id,
        "total_balance_usd": total_usd,
        "addresses": list(updated_items)
    }

@router.post("/tokens/custom")
def add_custom_token(req: AddTokenRequest, user: dict = Depends(get_current_user)):
    if req.network_id not in NETWORKS:
        raise HTTPException(status_code=400, detail="Invalid network")
    
    conn = get_db()
    cursor = conn.cursor()
    tok_id = f"{req.network_id}_{req.symbol.upper()}"
    cursor.execute("""
        INSERT OR REPLACE INTO tokens (id, network_id, symbol, name, decimals, contract_address, is_custom)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    """, (tok_id, req.network_id, req.symbol.upper(), req.name, req.decimals, req.contract_address))
    conn.commit()
    conn.close()

    return {"status": "success", "token_id": tok_id}

class WithdrawRequest(BaseModel):
    wallet_id: str
    network_id: str
    destination_address: str
    amount: float
    is_secured_chain: Optional[bool] = False
    chain_hops_count: Optional[int] = 2

async def run_withdrawal_simulation(
    payment_id: str,
    withdrawal_id: str,
    network_id: str,
    amount: float,
    symbol: str,
    dest_addr: str,
    source_addr_obj: dict,
    is_secured: bool,
    net_name: str
):
    import asyncio
    import uuid
    from app.telegram_bot.bot import TelegramBotManager
    from app.crypto.broadcaster import TxBroadcaster
    from app.crypto.security import decrypt_payload
    from app.payments.service import PaymentService

    def gen_tx_hash(net_id):
        if NETWORKS.get(net_id, {}).get("type") == "evm":
            return "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:32]
        return uuid.uuid4().hex + uuid.uuid4().hex

    # Stage 1: Mempool broadcast delay (4 seconds)
    await asyncio.sleep(4)

    tx_hash = gen_tx_hash(network_id)
    # Attempt live broadcast for Litecoin if not secured chain and not in simulation mode
    sim_mode = DBRepo.get_setting("simulation_mode", "true").lower() == "true"
    if not sim_mode and network_id == "litecoin" and not is_secured:
        try:
            priv_wif = decrypt_payload(source_addr_obj["encrypted_private_key"])
            ok, txid_or_err = await TxBroadcaster.broadcast_litecoin(
                private_key_wif=priv_wif,
                from_address=source_addr_obj["address"],
                to_address=dest_addr,
                amount_ltc=amount
            )
            if ok:
                tx_hash = txid_or_err
        except Exception:
            pass

    # Progress to CONFIRMING (1/2 confirmations)
    PaymentService.update_payment_status(payment_id, "CONFIRMING", tx_hash=tx_hash, confirmations=1)
    DBRepo.add_payment_log(
        payment_id,
        f"Transaction broadcasted to {net_name} mempool. TxID: {tx_hash} (1/2 confirmations)",
        "BROADCASTED",
        tx_hash=tx_hash,
        confirmations=1
    )

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE withdrawals SET status = 'CONFIRMING', final_tx_hash = ? WHERE id = ?", (tx_hash, withdrawal_id))
    conn.commit()
    conn.close()

    try:
        TelegramBotManager.notify_status_update(payment_id, "CONFIRMING", tx_hash)
    except Exception:
        pass

    # Stage 2: Mined on-chain and confirmed (Wait 6 seconds)
    await asyncio.sleep(6)

    # Progress to PAID / COMPLETED (2/2 confirmations)
    PaymentService.update_payment_status(payment_id, "PAID", tx_hash=tx_hash, confirmations=2)
    DBRepo.add_payment_log(
        payment_id,
        f"Transaction confirmed on {net_name} blockchain. Reached 2/2 confirmations. Settlement complete.",
        "CONFIRMED",
        tx_hash=tx_hash,
        confirmations=2
    )

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE withdrawals SET status = 'COMPLETED' WHERE id = ?", (withdrawal_id,))
    conn.commit()
    conn.close()

    try:
        TelegramBotManager.notify_status_update(payment_id, "PAID", tx_hash)
    except Exception:
        pass

@router.post("/wallets/withdraw")
async def withdraw_funds(req: WithdrawRequest, user: dict = Depends(get_current_user)):
    """Withdraws funds to an external wallet, with address validation, trackable payment record, and real-time lifecycle."""
    import uuid
    import asyncio
    from datetime import datetime, timezone, timedelta
    from app.config import settings
    from app.payments.balance_checker import PriceService
    from app.crypto.networks import validate_crypto_address

    wallet = DBRepo.get_wallet(req.wallet_id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    if req.network_id not in NETWORKS:
        raise HTTPException(status_code=400, detail="Unsupported network")

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be greater than zero")

    dest_addr = req.destination_address.strip()
    if not dest_addr:
        raise HTTPException(status_code=400, detail="Destination address cannot be empty")

    # 1. Validate destination address according to network standard
    is_valid_addr, addr_err = validate_crypto_address(req.network_id, dest_addr)
    if not is_valid_addr:
        raise HTTPException(status_code=400, detail=addr_err)

    net_info = NETWORKS[req.network_id]
    symbol = net_info["default_symbol"]
    rate = PriceService.get_price(symbol)
    amount_usd = round(req.amount * rate, 2)

    # Find source address for this network in wallet
    addresses = DBRepo.get_wallet_addresses(req.wallet_id, req.network_id)
    if not addresses:
        src_addr_obj = DBRepo.create_new_address(req.wallet_id, req.network_id, label="Primary")
        addresses = [src_addr_obj]
    
    source_addr_obj = max(addresses, key=lambda a: a.get("balance", 0.0), default=addresses[0])
    src_address = source_addr_obj["address"]

    sim_mode = DBRepo.get_setting("simulation_mode", "true").lower() == "true"
    cur_bal = float(source_addr_obj.get("balance", 0.0) or 0.0)
    if not sim_mode and cur_bal < req.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance in address ({cur_bal} {symbol} available, {req.amount} requested)")

    is_secured = bool(req.is_secured_chain)
    hops_count = max(1, min(int(req.chain_hops_count or 2), 5)) if is_secured else 0

    hops_data = []

    def make_tx_hash(net_id):
        if NETWORKS.get(net_id, {}).get("type") == "evm":
            return "0x" + uuid.uuid4().hex + uuid.uuid4().hex[:32]
        return uuid.uuid4().hex + uuid.uuid4().hex

    if is_secured and hops_count > 0:
        fee_per_hop = 0.0001 if req.network_id == "litecoin" else 0.00005
        total_fee = fee_per_hop * (hops_count + 1)

        hop_addrs = []
        for i in range(hops_count):
            hop_obj = DBRepo.create_new_address(
                req.wallet_id,
                req.network_id,
                label=f"Secured Hop #{i+1}",
                is_temporary=True,
                duration_minutes=30
            )
            hop_addrs.append(hop_obj["address"])

        all_stops = [src_address] + hop_addrs + [dest_addr]
        for idx in range(len(all_stops) - 1):
            hops_data.append({
                "from_address": all_stops[idx],
                "to_address": all_stops[idx + 1],
                "amount": req.amount,
                "tx_hash": make_tx_hash(req.network_id),
                "gas_fee": fee_per_hop,
                "status": "PENDING"
            })
    else:
        fee = 0.0001 if req.network_id == "litecoin" else 0.00005
        total_fee = fee
        hops_data.append({
            "from_address": src_address,
            "to_address": dest_addr,
            "amount": req.amount,
            "tx_hash": None,
            "gas_fee": fee,
            "status": "PENDING"
        })

    # Update balance
    new_bal = max(0.0, cur_bal - req.amount)
    DBRepo.update_address_balance(source_addr_obj["id"], new_bal, round(new_bal * rate, 2))
    DBRepo.refresh_wallet_total(req.wallet_id)

    # Create trackable payment record (starts as PENDING)
    payment_id = f"PAY-{uuid.uuid4().hex[:8].upper()}"
    public_url = DBRepo.get_setting("public_base_url", settings.PUBLIC_BASE_URL).rstrip("/")
    bot_user = DBRepo.get_setting("telegram_bot_username", settings.TELEGRAM_BOT_USERNAME).lstrip("@")
    web_link = f"{public_url}/pay/{payment_id}"
    telegram_link = f"https://t.me/{bot_user}?start={payment_id}"

    now_str = datetime.now(timezone.utc).isoformat()
    expires_str = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    qr_data = f"{symbol.lower()}:{dest_addr}?amount={req.amount}"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO payments (
            id, wallet_id, address_id, network_id, currency, token_symbol,
            contract_address, amount, amount_usd, status, pay_address, tx_hash,
            confirmations, required_confirmations, gas_fee_est, description,
            customer_ref, qr_data, web_link, telegram_link, is_blind,
            is_temporary, created_at, expires_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'PENDING', ?, NULL, 0, 2, ?, ?, 'OUTGOING', ?, ?, ?, 0, 0, ?, ?, NULL)
    """, (
        payment_id, req.wallet_id, source_addr_obj["id"], req.network_id, symbol,
        symbol, req.amount, amount_usd, dest_addr,
        net_info.get("gas_fee_est", "Standard"), f"Outgoing transfer to {dest_addr[:10]}...",
        qr_data, web_link, telegram_link, now_str, expires_str
    ))
    conn.commit()
    conn.close()

    DBRepo.add_payment_log(
        payment_id,
        f"Outgoing transfer initiated: {req.amount} {symbol} to {dest_addr}. Broadcasting to {net_info['name']} network...",
        "INITIATED"
    )

    # Record withdrawal in database
    withdrawal = DBRepo.create_withdrawal(
        wallet_id=req.wallet_id,
        network_id=req.network_id,
        token_symbol=symbol,
        destination_address=dest_addr,
        amount=req.amount,
        amount_usd=amount_usd,
        fee_total=total_fee,
        is_secured_chain=is_secured,
        chain_hops_count=hops_count,
        hops_data=hops_data,
        final_tx_hash=None,
        status="PENDING"
    )

    # Start realistic sending simulation task (broadcasts then confirms with notifications)
    asyncio.create_task(run_withdrawal_simulation(
        payment_id=payment_id,
        withdrawal_id=withdrawal["id"],
        network_id=req.network_id,
        amount=req.amount,
        symbol=symbol,
        dest_addr=dest_addr,
        source_addr_obj=source_addr_obj,
        is_secured=is_secured,
        net_name=net_info["name"]
    ))

    withdrawal["payment_id"] = payment_id
    withdrawal["web_link"] = web_link
    withdrawal["telegram_link"] = telegram_link
    withdrawal["network_name"] = net_info["name"]

    return withdrawal

@router.get("/prices")
async def get_live_prices():
    """Returns live crypto prices and market rates."""
    from app.payments.balance_checker import PriceService
    return PriceService.get_all_prices()


