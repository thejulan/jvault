from typing import Dict, List, Any

# Supported network profiles with real on-chain parameters
NETWORKS: Dict[str, Dict[str, Any]] = {
    "bitcoin": {
        "id": "bitcoin",
        "name": "Bitcoin",
        "short_name": "BTC",
        "icon": "btc",
        "type": "utxo",
        "bip": "bip84",  # Native SegWit (bc1q)
        "coin_type": 0,
        "default_symbol": "BTC",
        "decimals": 8,
        "confirmations_required": 2,
        "gas_fee_est": "14 sats/vB (~$1.45)",
        "confirmation_time": "10-20 min",
        "explorer_tx": "https://mempool.space/tx/{tx}",
        "explorer_addr": "https://mempool.space/address/{address}",
        "rpc_url": "https://mempool.space/api",
        "tokens": []
    },
    "ethereum": {
        "id": "ethereum",
        "name": "Ethereum",
        "short_name": "ETH",
        "icon": "eth",
        "type": "evm",
        "bip": "bip44",
        "coin_type": 60,
        "chain_id": 1,
        "default_symbol": "ETH",
        "decimals": 18,
        "confirmations_required": 12,
        "gas_fee_est": "18 Gwei (~$2.80 - $4.10)",
        "confirmation_time": "2-4 min",
        "explorer_tx": "https://etherscan.io/tx/{tx}",
        "explorer_addr": "https://etherscan.io/address/{address}",
        "rpc_url": "https://cloudflare-eth.com",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD", "decimals": 6, "contract": "0xdAC17F958D2ee523a2206206994597C13D831ec7"},
            {"symbol": "USDC", "name": "USD Coin", "decimals": 6, "contract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
            {"symbol": "DAI", "name": "Dai Stablecoin", "decimals": 18, "contract": "0x6B175474E89094C44Da98b954EedeAC495271d0F"},
            {"symbol": "WBTC", "name": "Wrapped BTC", "decimals": 8, "contract": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"}
        ]
    },
    "bsc": {
        "id": "bsc",
        "name": "BNB Smart Chain",
        "short_name": "BSC",
        "icon": "bnb",
        "type": "evm",
        "bip": "bip44",
        "coin_type": 60,
        "chain_id": 56,
        "default_symbol": "BNB",
        "decimals": 18,
        "confirmations_required": 15,
        "gas_fee_est": "3 Gwei (~$0.08)",
        "confirmation_time": "30-45 sec",
        "explorer_tx": "https://bscscan.com/tx/{tx}",
        "explorer_addr": "https://bscscan.com/address/{address}",
        "rpc_url": "https://binance.llamarpc.com",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (BEP20)", "decimals": 18, "contract": "0x55d398326f99059fF775485246999027B3197955"},
            {"symbol": "USDC", "name": "USD Coin (BEP20)", "decimals": 18, "contract": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"},
            {"symbol": "BUSD", "name": "Binance USD", "decimals": 18, "contract": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"}
        ]
    },
    "tron": {
        "id": "tron",
        "name": "TRON Network",
        "short_name": "TRX",
        "icon": "trx",
        "type": "tron",
        "bip": "bip44",
        "coin_type": 195,
        "default_symbol": "TRX",
        "decimals": 6,
        "confirmations_required": 19,
        "gas_fee_est": "13.4 TRX (~$1.60)",
        "confirmation_time": "1 min",
        "explorer_tx": "https://tronscan.org/#/transaction/{tx}",
        "explorer_addr": "https://tronscan.org/#/address/{address}",
        "rpc_url": "https://api.trongrid.io",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (TRC20)", "decimals": 6, "contract": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"},
            {"symbol": "USDC", "name": "USD Coin (TRC20)", "decimals": 6, "contract": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"}
        ]
    },
    "solana": {
        "id": "solana",
        "name": "Solana",
        "short_name": "SOL",
        "icon": "sol",
        "type": "solana",
        "bip": "bip44",
        "coin_type": 501,
        "default_symbol": "SOL",
        "decimals": 9,
        "confirmations_required": 31,
        "gas_fee_est": "0.00005 SOL (<$0.01)",
        "confirmation_time": "5-15 sec",
        "explorer_tx": "https://solscan.io/tx/{tx}",
        "explorer_addr": "https://solscan.io/account/{address}",
        "rpc_url": "https://api.mainnet-beta.solana.com",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (SPL)", "decimals": 6, "contract": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"},
            {"symbol": "USDC", "name": "USD Coin (SPL)", "decimals": 6, "contract": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}
        ]
    },
    "polygon": {
        "id": "polygon",
        "name": "Polygon PoS",
        "short_name": "MATIC",
        "icon": "matic",
        "type": "evm",
        "bip": "bip44",
        "coin_type": 60,
        "chain_id": 137,
        "default_symbol": "POL",
        "decimals": 18,
        "confirmations_required": 64,
        "gas_fee_est": "35 Gwei (~$0.03)",
        "confirmation_time": "1-2 min",
        "explorer_tx": "https://polygonscan.com/tx/{tx}",
        "explorer_addr": "https://polygonscan.com/address/{address}",
        "rpc_url": "https://polygon-rpc.com",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (Polygon)", "decimals": 6, "contract": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"},
            {"symbol": "USDC", "name": "USD Coin (Polygon)", "decimals": 6, "contract": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"}
        ]
    },
    "arbitrum": {
        "id": "arbitrum",
        "name": "Arbitrum One",
        "short_name": "ARB",
        "icon": "arb",
        "type": "evm",
        "bip": "bip44",
        "coin_type": 60,
        "chain_id": 42161,
        "default_symbol": "ETH",
        "decimals": 18,
        "confirmations_required": 20,
        "gas_fee_est": "0.1 Gwei (~$0.12)",
        "confirmation_time": "10-20 sec",
        "explorer_tx": "https://arbiscan.io/tx/{tx}",
        "explorer_addr": "https://arbiscan.io/address/{address}",
        "rpc_url": "https://arb1.arbitrum.io/rpc",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (Arbitrum)", "decimals": 6, "contract": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"},
            {"symbol": "USDC", "name": "USD Coin (Arbitrum)", "decimals": 6, "contract": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"}
        ]
    },
    "ton": {
        "id": "ton",
        "name": "The Open Network",
        "short_name": "TON",
        "icon": "ton",
        "type": "ton",
        "bip": "bip44",
        "coin_type": 607,
        "default_symbol": "TON",
        "decimals": 9,
        "confirmations_required": 1,
        "gas_fee_est": "0.01 TON (~$0.05)",
        "confirmation_time": "20-30 sec",
        "explorer_tx": "https://tonviewer.com/transaction/{tx}",
        "explorer_addr": "https://tonviewer.com/{address}",
        "rpc_url": "https://toncenter.com/api/v2/jsonRPC",
        "tokens": [
            {"symbol": "USDT", "name": "Tether USD (TON Jetton)", "decimals": 6, "contract": "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"}
        ]
    },
    "dogecoin": {
        "id": "dogecoin",
        "name": "Dogecoin",
        "short_name": "DOGE",
        "icon": "doge",
        "type": "utxo",
        "bip": "bip44",
        "coin_type": 3,
        "default_symbol": "DOGE",
        "decimals": 8,
        "confirmations_required": 6,
        "gas_fee_est": "0.01 DOGE (<$0.01)",
        "confirmation_time": "5-10 min",
        "explorer_tx": "https://dogechain.info/tx/{tx}",
        "explorer_addr": "https://dogechain.info/address/{address}",
        "rpc_url": "https://dogechain.info/api/v1",
        "tokens": []
    },
    "litecoin": {
        "id": "litecoin",
        "name": "Litecoin",
        "short_name": "LTC",
        "icon": "ltc",
        "type": "utxo",
        "bip": "bip84",
        "coin_type": 2,
        "default_symbol": "LTC",
        "decimals": 8,
        "confirmations_required": 2,
        "gas_fee_est": "2 litoshis/vB (<$0.01)",
        "confirmation_time": "2-5 min",
        "explorer_tx": "https://litecoinspace.org/tx/{tx}",
        "explorer_addr": "https://litecoinspace.org/address/{address}",
        "rpc_url": "https://litecoinspace.org/api",
        "tokens": []
    }
}

# Cross-network currencies matrix with real gas fee and confirmations
CURRENCY_NETWORK_MATRIX = {
    "USDT": [
        {"network_id": "tron", "network_name": "TRON (TRC20)", "standard": "TRC20", "icon": "trx", "gas_fee_est": "13.4 TRX (~$1.60)", "confirmations_required": 19, "speed": "1 min"},
        {"network_id": "bsc", "network_name": "BNB Smart Chain (BEP20)", "standard": "BEP20", "icon": "bnb", "gas_fee_est": "3 Gwei (~$0.08)", "confirmations_required": 15, "speed": "Instant (30s)"},
        {"network_id": "polygon", "network_name": "Polygon PoS", "standard": "ERC20", "icon": "matic", "gas_fee_est": "35 Gwei (~$0.03)", "confirmations_required": 64, "speed": "Instant (1m)"},
        {"network_id": "solana", "network_name": "Solana (SPL)", "standard": "SPL", "icon": "sol", "gas_fee_est": "0.00005 SOL (<$0.01)", "confirmations_required": 31, "speed": "10 sec"},
        {"network_id": "arbitrum", "network_name": "Arbitrum One", "standard": "ERC20", "icon": "arb", "gas_fee_est": "0.1 Gwei (~$0.12)", "confirmations_required": 20, "speed": "15 sec"},
        {"network_id": "ton", "network_name": "TON (Jetton)", "standard": "Jetton", "icon": "ton", "gas_fee_est": "0.01 TON (~$0.05)", "confirmations_required": 1, "speed": "20 sec"},
        {"network_id": "ethereum", "network_name": "Ethereum (ERC20)", "standard": "ERC20", "icon": "eth", "gas_fee_est": "18 Gwei (~$3.50)", "confirmations_required": 12, "speed": "2-3 min"}
    ],
    "USDC": [
        {"network_id": "polygon", "network_name": "Polygon PoS", "standard": "ERC20", "icon": "matic", "gas_fee_est": "35 Gwei (~$0.03)", "confirmations_required": 64, "speed": "Instant"},
        {"network_id": "solana", "network_name": "Solana (SPL)", "standard": "SPL", "icon": "sol", "gas_fee_est": "0.00005 SOL (<$0.01)", "confirmations_required": 31, "speed": "10 sec"},
        {"network_id": "arbitrum", "network_name": "Arbitrum One", "standard": "ERC20", "icon": "arb", "gas_fee_est": "0.1 Gwei (~$0.12)", "confirmations_required": 20, "speed": "15 sec"},
        {"network_id": "bsc", "network_name": "BNB Chain (BEP20)", "standard": "BEP20", "icon": "bnb", "gas_fee_est": "3 Gwei (~$0.08)", "confirmations_required": 15, "speed": "30 sec"},
        {"network_id": "ethereum", "network_name": "Ethereum (ERC20)", "standard": "ERC20", "icon": "eth", "gas_fee_est": "18 Gwei (~$3.50)", "confirmations_required": 12, "speed": "2-3 min"}
    ],
    "BTC": [
        {"network_id": "bitcoin", "network_name": "Bitcoin Native SegWit", "standard": "Native SegWit", "icon": "btc", "gas_fee_est": "14 sats/vB (~$1.45)", "confirmations_required": 2, "speed": "10-20 min"}
    ],
    "ETH": [
        {"network_id": "ethereum", "network_name": "Ethereum Mainnet", "standard": "Native", "icon": "eth", "gas_fee_est": "18 Gwei (~$2.80)", "confirmations_required": 12, "speed": "2 min"},
        {"network_id": "arbitrum", "network_name": "Arbitrum One (L2)", "standard": "L2 Native", "icon": "arb", "gas_fee_est": "0.1 Gwei (~$0.12)", "confirmations_required": 20, "speed": "15 sec"}
    ],
    "SOL": [
        {"network_id": "solana", "network_name": "Solana Mainnet", "standard": "Native", "icon": "sol", "gas_fee_est": "0.00005 SOL (<$0.01)", "confirmations_required": 31, "speed": "5 sec"}
    ],
    "TRX": [
        {"network_id": "tron", "network_name": "TRON Mainnet", "standard": "Native", "icon": "trx", "gas_fee_est": "1.5 TRX (~$0.18)", "confirmations_required": 19, "speed": "1 min"}
    ],
    "BNB": [
        {"network_id": "bsc", "network_name": "BNB Smart Chain", "standard": "BEP20", "icon": "bnb", "gas_fee_est": "3 Gwei (~$0.08)", "confirmations_required": 15, "speed": "30 sec"}
    ],
    "TON": [
        {"network_id": "ton", "network_name": "The Open Network", "standard": "Native", "icon": "ton", "gas_fee_est": "0.01 TON (~$0.05)", "confirmations_required": 1, "speed": "20 sec"}
    ],
    "LTC": [
        {"network_id": "litecoin", "network_name": "Litecoin Native SegWit", "standard": "Native", "icon": "ltc", "gas_fee_est": "2 litoshis/vB (<$0.01)", "confirmations_required": 2, "speed": "2-5 min"}
    ],
    "DOGE": [
        {"network_id": "dogecoin", "network_name": "Dogecoin Mainnet", "standard": "Native", "icon": "doge", "gas_fee_est": "0.01 DOGE (<$0.01)", "confirmations_required": 6, "speed": "5-10 min"}
    ]
}

import re

def validate_crypto_address(network_id: str, address: str) -> tuple[bool, str]:
    """Validates destination address format according to network rules."""
    addr = (address or "").strip()
    if not addr:
        return False, "Destination address cannot be empty."

    net = NETWORKS.get(network_id)
    if not net:
        return False, f"Unsupported network: {network_id}"

    net_type = net.get("type")

    # EVM Networks (Ethereum, BSC, Polygon, Arbitrum, Avalanche)
    if net_type == "evm":
        if not re.match(r"^0x[a-fA-F0-9]{40}$", addr):
            return False, f"Invalid {net['name']} address: must start with '0x' followed by 40 hex characters."
        return True, "Valid EVM address"

    # Bitcoin
    if network_id == "bitcoin":
        # Native SegWit (bc1q, bc1p), Legacy (1), P2SH (3)
        if re.match(r"^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59}|1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34})$", addr):
            return True, "Valid Bitcoin address"
        return False, "Invalid Bitcoin address: must be SegWit (bc1...), Legacy (starts with 1) or P2SH (starts with 3)."

    # Litecoin
    if network_id == "litecoin":
        # Native SegWit (ltc1), Legacy (L), P2SH (M or 3)
        if re.match(r"^(ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59}|[LM3][1-9A-HJ-NP-Za-km-z]{26,34})$", addr):
            return True, "Valid Litecoin address"
        return False, "Invalid Litecoin address: must start with 'ltc1', 'L', or 'M'."

    # TRON
    if network_id == "tron":
        if re.match(r"^T[1-9A-HJ-NP-Za-km-z]{33}$", addr):
            return True, "Valid TRON address"
        return False, "Invalid TRON address: must start with 'T' and be 34 characters (Base58)."

    # Solana
    if network_id == "solana":
        if re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", addr):
            return True, "Valid Solana address"
        return False, "Invalid Solana address: must be 32-44 base58 characters."

    # TON
    if network_id == "ton":
        if re.match(r"^(EQ|UQ|kQ|0Q)[a-zA-Z0-9_-]{46}$", addr) or re.match(r"^(-1|0):[a-fA-F0-9]{64}$", addr):
            return True, "Valid TON address"
        if len(addr) == 48 and re.match(r"^[a-zA-Z0-9_\-\+/=]{48}$", addr):
            return True, "Valid TON address"
        return False, "Invalid TON address: must be standard 48-character user-friendly address."

    # Dogecoin
    if network_id == "dogecoin":
        if re.match(r"^[D9A][1-9A-HJ-NP-Za-km-z]{33}$", addr):
            return True, "Valid Dogecoin address"
        return False, "Invalid Dogecoin address: must start with 'D', '9', or 'A' (34 characters)."

    # Fallback
    if len(addr) < 15:
        return False, "Address is too short to be valid."
    return True, "Valid address"
