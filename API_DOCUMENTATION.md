# JVault API Documentation

Welcome to the **JVault REST API reference**. JVault is a self-hosted, non-custodial cryptocurrency wallet treasury and automated payment gateway.

- **Base URL:** `http://localhost:8000` (or your configured `public_base_url`)
- **Interactive Swagger UI:** [`/docs`](http://localhost:8000/docs)
- **ReDoc Interactive Specs:** [`/redoc`](http://localhost:8000/redoc)
- **OpenAPI Schema:** [`/openapi.json`](http://localhost:8000/openapi.json)

---

## Authentication

All protected endpoints require an HTTP Bearer JWT token in the `Authorization` header:

```http
Authorization: Bearer <your_jwt_access_token>
```

Tokens are obtained via the `/api/auth/login` endpoint using master administrator credentials.

---

## 1. Authentication Endpoints

### 1.1 Administrator Login
- **Endpoint:** `POST /api/auth/login`
- **Auth:** Public
- **Request Body:**
```json
{
  "username": "admin",
  "password": "VeryStrongPassword123!"
}
```
- **Response `200 OK`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer",
  "username": "admin"
}
```

### 1.2 Get Current User
- **Endpoint:** `GET /api/auth/me`
- **Auth:** Bearer Token
- **Response `200 OK`:**
```json
{
  "username": "admin",
  "role": "admin"
}
```

### 1.3 Change Master Password
- **Endpoint:** `POST /api/auth/change-password`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "current_password": "VeryStrongPassword123!",
  "new_password": "NewStrongPassword456!"
}
```

### 1.4 Check System Setup Status
- **Endpoint:** `GET /api/auth/status`
- **Auth:** Public
- **Response `200 OK`:**
```json
{
  "has_admin": true,
  "status": "ready"
}
```

---

## 2. Wallets & Keystores

### 2.1 List All Wallets
- **Endpoint:** `GET /api/wallets`
- **Auth:** Bearer Token
- **Response `200 OK`:**
```json
[
  {
    "id": "w_9a8b7c6d5e",
    "name": "Balance Vault #1",
    "is_default": 1,
    "total_balance_usd": 1250.40,
    "addresses_count": 10,
    "created_at": "2026-10-22T04:00:00Z"
  }
]
```

### 2.2 Generate / Import Master Wallet
- **Endpoint:** `POST /api/wallets`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "name": "OTC Clearing Vault",
  "words_count": 12,
  "mnemonic": "" 
}
```
> Leave `mnemonic` empty to generate a fresh cryptographic seed phrase.
- **Response `200 OK`:**
```json
{
  "id": "w_1234567890",
  "name": "OTC Clearing Vault",
  "mnemonic": "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "addresses": [
    {
      "network_id": "bitcoin",
      "address": "bc1q...",
      "derivation_path": "m/84'/0'/0'/0/0"
    }
  ]
}
```

### 2.3 List Addresses in a Wallet
- **Endpoint:** `GET /api/wallets/{wallet_id}/addresses`
- **Auth:** Bearer Token
- **Response `200 OK`:**
```json
[
  {
    "id": "addr_01",
    "wallet_id": "w_1234567890",
    "network_id": "litecoin",
    "network_name": "Litecoin",
    "short_name": "LTC",
    "address": "ltc1q...",
    "address_index": 0,
    "derivation_path": "m/84'/2'/0'/0/0",
    "label": "Receiving Address",
    "balance": 0.54,
    "balance_usd": 32.70,
    "is_temporary": 0,
    "remaining_seconds": 0,
    "explorer_url": "https://blockchair.com/litecoin/address/ltc1q..."
  }
]
```

### 2.4 Derive New Address (Static or Disposable)
- **Endpoint:** `POST /api/wallets/{wallet_id}/addresses`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "network_id": "litecoin",
  "label": "Invoice #1029",
  "is_temporary": true,
  "duration_minutes": 30
}
```
> Setting `is_temporary: true` will cause the address to auto-delete after `duration_minutes`.
- **Response `200 OK`:** Returns the newly derived address object.

### 2.5 Delete an Address
- **Endpoint:** `DELETE /api/addresses/{address_id}`
- **Auth:** Bearer Token
- **Response `200 OK`:**
```json
{
  "status": "success",
  "deleted_id": "addr_01",
  "wallet_id": "w_1234567890"
}
```

### 2.6 On-Chain Balance Sync
- **Endpoint:** `POST /api/wallets/{wallet_id}/refresh-balances`
- **Auth:** Bearer Token
- **Description:** Scans live blockchain nodes and mempools for all derived addresses and updates SQLite balances.
- **Response `200 OK`:** Returns updated addresses array and total USD treasury.

---

## 3. Payments & Invoices

### 3.1 Create Universal Payment Link (Fast Receive)
- **Endpoint:** `POST /api/payments/create`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "amount": 1.00,
  "description": "Order #4092",
  "wallet_id": "w_1234567890",
  "address_id": null,
  "is_temporary": false,
  "duration_minutes": 0
}
```
> If `amount` is specified, it represents the base value in USD. When the client selects a token (e.g. LTC or BTC), JVault automatically converts the USD value into the exact crypto amount using real-time market rates.
- **Response `200 OK`:**
```json
{
  "id": "PAY-A1B2C3D4",
  "amount": 1.00,
  "currency": "USD",
  "status": "PENDING",
  "web_link": "http://localhost:8000/pay/PAY-A1B2C3D4",
  "telegram_link": "https://t.me/JVaultPayBot?start=PAY-A1B2C3D4",
  "expires_at": "2026-10-22T05:30:00Z"
}
```

### 3.2 Select Payment Network & Convert Currency
- **Endpoint:** `POST /api/payments/{payment_id}/select-network`
- **Auth:** Public
- **Request Body:**
```json
{
  "currency": "LTC",
  "network_id": "litecoin"
}
```
- **Response `200 OK`:**
```json
{
  "id": "PAY-A1B2C3D4",
  "amount": 0.016513,
  "currency": "LTC",
  "amount_usd": 1.00,
  "pay_address": "ltc1q...",
  "qr_data": "litecoin:ltc1q...?amount=0.016513",
  "gas_fee_est": "<$0.01",
  "required_confirmations": 2,
  "status": "PENDING"
}
```

### 3.3 Get Payment Details
- **Endpoint:** `GET /api/payments/{payment_id}`
- **Auth:** Public
- **Response `200 OK`:** Full status, confirmations, explorer link, and remaining seconds.

### 3.4 Simulate Confirmation (Testing Mode)
- **Endpoint:** `POST /api/payments/{payment_id}/simulate-confirm`
- **Auth:** Bearer Token
- **Description:** Cycles payment status: `PENDING` -> `CONFIRMING` -> `PAID`.

---

## 4. Balance Stats & Settings

### 4.1 Get Balance Overview Stats
- **Endpoint:** `GET /api/stats`
- **Auth:** Bearer Token
- **Response `200 OK`:**
```json
{
  "total_treasury_usd": 1250.40,
  "total_treasury_converted": 0.01515,
  "display_currency": "BTC",
  "display_symbol": "₿",
  "exchange_rate": 82500.00,
  "total_paid_count": 14,
  "total_paid_volume_usd": 4820.00,
  "pending_invoices_count": 2,
  "wallets_count": 1
}
```

### 4.2 Update Settings
- **Endpoint:** `POST /api/settings`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "public_base_url": "https://jvault.example.com",
  "simulation_mode": "false",
  "treasury_currency": "BTC"
}
```

### 4.3 Configure Telegram Telethon Bot
- **Endpoint:** `POST /api/telegram/configure`
- **Auth:** Bearer Token
- **Request Body:**
```json
{
  "api_id": "1234567",
  "api_hash": "0123456789abcdef0123456789abcdef",
  "bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "bot_username": "JVaultPayBot"
}
```

---

## 5. Supported Blockchains & Derivation Standards

| Network | Native Asset | Address Derivation Standard | Derivation Path |
| :--- | :--- | :--- | :--- |
| **Bitcoin** | BTC | BIP84 (Native SegWit Bech32 `bc1q`) | `m/84'/0'/0'/0/i` |
| **Ethereum** | ETH / ERC20 | BIP44 (Hex `0x`) | `m/44'/60'/0'/0/i` |
| **TRON** | TRX / TRC20 | BIP44 (Base58 `T...`) | `m/44'/195'/0'/0/i` |
| **Litecoin** | LTC | BIP84 (Native SegWit `ltc1q`) | `m/84'/2'/0'/0/i` |
| **Solana** | SOL / SPL | BIP44 / Ed25519 (Base58) | `m/44'/501'/0'/0'` |
| **BNB Smart Chain** | BNB / BEP20 | BIP44 (Hex `0x`) | `m/44'/60'/0'/0/i` |
| **Polygon** | POL / MATIC | BIP44 (Hex `0x`) | `m/44'/60'/0'/0/i` |
| **Arbitrum One** | ETH (L2) | BIP44 (Hex `0x`) | `m/44'/60'/0'/0/i` |
| **TON** | TON | BIP44 (`EQ...`) | `m/44'/607'/0'/0/i` |
| **Dogecoin** | DOGE | BIP44 (Base58 `D...`) | `m/44'/3'/0'/0/i` |
