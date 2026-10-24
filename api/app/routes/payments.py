from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel
from typing import Optional, List
from app.payments.service import PaymentService
from app.routes.auth import get_current_user
from app.config import QR_CACHE_DIR
import os

router = APIRouter(prefix="/api", tags=["payments"])

class CreatePaymentRequest(BaseModel):
    currency: Optional[str] = None
    network_id: Optional[str] = None
    amount: Optional[float] = 0.0
    description: Optional[str] = ""
    customer_ref: Optional[str] = ""
    wallet_id: Optional[str] = None
    address_id: Optional[str] = None
    is_temporary: Optional[bool] = False
    duration_minutes: Optional[int] = 30

class SelectNetworkRequest(BaseModel):
    currency: str
    network_id: str

@router.get("/payments/currencies")
def get_payment_currencies():
    """Returns currency to network matrix for the checkout UI."""
    return PaymentService.get_currency_options()

@router.post("/payments/create")
def create_payment(req: CreatePaymentRequest):
    """Creates a payment invoice (universal blind link or pre-assigned)."""
    try:
        payment = PaymentService.create_payment(
            currency=req.currency,
            network_id=req.network_id,
            amount=req.amount or 0.0,
            description=req.description or "",
            customer_ref=req.customer_ref or "",
            wallet_id=req.wallet_id,
            address_id=req.address_id,
            is_temporary=bool(req.is_temporary),
            duration_minutes=int(req.duration_minutes or 30)
        )
        return payment
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/payments/{payment_id}/select-network")
def select_payment_network(payment_id: str, req: SelectNetworkRequest):
    """Allows customer on checkout page or Telegram to pick their preferred currency & network."""
    try:
        updated = PaymentService.select_network_for_blind_payment(
            payment_id=payment_id,
            currency=req.currency,
            network_id=req.network_id
        )
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/payments")
def list_payments(
    status: Optional[str] = "ALL",
    network_id: Optional[str] = "ALL",
    limit: int = 50,
    offset: int = 0
):
    """Lists payments with filtering."""
    return PaymentService.list_payments(status, network_id, limit, offset)

@router.get("/payments/{payment_id}")
async def get_payment(payment_id: str):
    """Returns real-time status of payment with instant on-chain check."""
    from app.payments.validator import PaymentValidator
    pay = await PaymentValidator.verify_single_payment(payment_id)
    if not pay:
        pay = PaymentService.get_payment(payment_id)
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    try:
        pay["qr_base64"] = PaymentService.get_qr_base64(payment_id)
    except Exception:
        pay["qr_base64"] = None
    return pay

@router.get("/payments/{payment_id}/qr.png")
def get_payment_qr(payment_id: str):
    """Returns raw PNG image of QR code."""
    file_path = QR_CACHE_DIR / f"{payment_id}.png"
    if not file_path.exists():
        pay = PaymentService.get_payment(payment_id)
        if not pay:
            raise HTTPException(status_code=404, detail="Payment not found")
        PaymentService.get_qr_base64(payment_id)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="QR code not available for this invoice yet")

    with open(file_path, "rb") as f:
        content = f.read()
    return Response(content=content, media_type="image/png")

@router.post("/payments/{payment_id}/simulate")
def simulate_payment(payment_id: str):
    """Simulates incoming transaction progression: PENDING -> CONFIRMING -> PAID."""
    try:
        updated = PaymentService.simulate_payment_step(payment_id)
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/stats")
def get_stats():
    """Returns metrics for dashboard."""
    return PaymentService.get_stats()

@router.get("/withdrawals")
def get_withdrawals(wallet_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Returns all outgoing sent transactions / withdrawals."""
    from app.database import DBRepo
    from app.crypto.networks import NETWORKS
    items = DBRepo.list_withdrawals(wallet_id)
    for it in items:
        net = NETWORKS.get(it.get("network_id", ""), {})
        it["network_name"] = net.get("name", it.get("network_id", "").capitalize())
        it["icon"] = net.get("icon", "wallet")
        tpl = net.get("explorer_tx", "")
        tx = it.get("final_tx_hash") or ""
        it["explorer_tx"] = tpl.replace("{tx}", tx) if (tpl and tx) else ""
    return items

@router.get("/withdrawals/{withdrawal_id}")
def get_withdrawal_detail(withdrawal_id: str, user: dict = Depends(get_current_user)):
    """Returns details and hop chain for a specific withdrawal."""
    from app.database import DBRepo
    from app.crypto.networks import NETWORKS
    item = DBRepo.get_withdrawal(withdrawal_id)
    if not item:
        raise HTTPException(status_code=404, detail="Withdrawal record not found")
    net = NETWORKS.get(item.get("network_id", ""), {})
    item["network_name"] = net.get("name", item.get("network_id", "").capitalize())
    item["icon"] = net.get("icon", "wallet")
    tpl = net.get("explorer_tx", "")
    tx = item.get("final_tx_hash") or ""
    item["explorer_tx"] = tpl.replace("{tx}", tx) if (tpl and tx) else ""
    for hop in item.get("hops", []):
        hop_tx = hop.get("tx_hash") or ""
        hop["explorer_tx"] = tpl.replace("{tx}", hop_tx) if (tpl and hop_tx) else ""
    return item
