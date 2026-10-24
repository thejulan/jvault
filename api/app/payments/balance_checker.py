import time
import httpx
import logging
from typing import Dict, Any, Tuple
from app.crypto.networks import NETWORKS

logger = logging.getLogger("jvault.balance")

# Price estimates (fallback when network is unreachable)
ESTIMATED_PRICES_USD = {
    "BTC": 82500.0,
    "ETH": 2450.0,
    "BNB": 740.0,
    "SOL": 105.0,
    "TRX": 0.33,
    "MATIC": 0.38,
    "POL": 0.38,
    "TON": 5.25,
    "LTC": 60.5,
    "DOGE": 0.08,
    "USDT": 1.0,
    "USDC": 1.0,
    "DAI": 1.0,
    "BUSD": 1.0,
    "EUR": 1.08
}

class PriceService:
    _cached_prices: Dict[str, float] = ESTIMATED_PRICES_USD.copy()
    _last_fetched: float = 0.0

    @classmethod
    def get_price(cls, symbol: str) -> float:
        sym = symbol.upper()
        if sym in ["USDT", "USDC", "DAI", "BUSD"]:
            return 1.0
        # Refresh cache if older than 120 seconds
        if time.time() - cls._last_fetched > 120.0:
            cls.refresh_prices_sync()
        return cls._cached_prices.get(sym, ESTIMATED_PRICES_USD.get(sym, 1.0))

    @classmethod
    def get_all_prices(cls) -> Dict[str, float]:
        if time.time() - cls._last_fetched > 120.0:
            cls.refresh_prices_sync()
        return cls._cached_prices.copy()

    @classmethod
    def refresh_prices_sync(cls):
        try:
            with httpx.Client(timeout=3.0) as client:
                for sym in ["BTC", "ETH", "LTC", "SOL", "TRX", "DOGE", "BNB"]:
                    try:
                        res = client.get(f"https://api.binance.com/api/v3/ticker/price?symbol={sym}USDT")
                        if res.status_code == 200:
                            cls._cached_prices[sym] = float(res.json()["price"])
                    except Exception:
                        pass
                cls._last_fetched = time.time()
        except Exception:
            pass

class BalanceChecker:
    @staticmethod
    async def fetch_address_balance(network_id: str, address: str) -> Tuple[float, float]:
        """Queries public on-chain RPC/Explorer for real balance. Returns (balance, balance_usd)."""
        net_info = NETWORKS.get(network_id)
        if not net_info:
            return 0.0, 0.0

        symbol = net_info["default_symbol"]
        rate = PriceService.get_price(symbol)
        balance = 0.0

        async with httpx.AsyncClient(timeout=2.0) as client:
            try:
                # 1. Bitcoin
                if network_id == "bitcoin":
                    res = await client.get(f"https://mempool.space/api/address/{address}")
                    if res.status_code == 200:
                        data = res.json()
                        chain_stats = data.get("chain_stats", {})
                        funded = chain_stats.get("funded_txo_sum", 0)
                        spent = chain_stats.get("spent_txo_sum", 0)
                        balance = max(0.0, (funded - spent) / 100_000_000.0)

                # 2. EVM Chains (Ethereum, BSC, Polygon, Arbitrum)
                elif net_info["type"] == "evm":
                    rpc_url = net_info.get("rpc_url")
                    if rpc_url:
                        payload = {
                            "jsonrpc": "2.0",
                            "method": "eth_getBalance",
                            "params": [address, "latest"],
                            "id": 1
                        }
                        res = await client.post(rpc_url, json=payload)
                        if res.status_code == 200:
                            data = res.json()
                            hex_val = data.get("result", "0x0")
                            wei = int(hex_val, 16)
                            balance = wei / (10 ** net_info["decimals"])

                # 3. Solana
                elif network_id == "solana":
                    res = await client.post(
                        net_info["rpc_url"],
                        json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]}
                    )
                    if res.status_code == 200:
                        data = res.json()
                        lamports = data.get("result", {}).get("value", 0)
                        balance = lamports / 1_000_000_000.0

                # 4. TRON
                elif network_id == "tron":
                    res = await client.get(f"https://api.trongrid.io/v1/accounts/{address}")
                    if res.status_code == 200:
                        data = res.json()
                        accounts = data.get("data", [])
                        if accounts:
                            sun = accounts[0].get("balance", 0)
                            balance = sun / 1_000_000.0

                # 5. TON
                elif network_id == "ton":
                    res = await client.get(f"https://toncenter.com/api/v2/getAddressBalance?address={address}")
                    if res.status_code == 200:
                        data = res.json()
                        nanotons = int(data.get("result", 0))
                        balance = nanotons / 1_000_000_000.0

                # 6. Dogecoin
                elif network_id == "dogecoin":
                    res = await client.get(f"https://dogechain.info/api/v1/address/balance/{address}")
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("success") == 1:
                            balance = float(data.get("balance", 0.0))

                # 7. Litecoin
                elif network_id == "litecoin":
                    res = await client.get(f"https://litecoinspace.org/api/address/{address}", headers={"User-Agent": "Mozilla/5.0"})
                    if res.status_code == 200:
                        data = res.json()
                        chain = data.get("chain_stats", {})
                        funded = chain.get("funded_txo_sum", 0)
                        spent = chain.get("spent_txo_sum", 0)
                        balance = max(0.0, (funded - spent) / 100_000_000.0)

            except Exception as e:
                logger.debug(f"Balance check error for {network_id} {address}: {e}")

        balance_usd = round(balance * rate, 2)
        return balance, balance_usd
