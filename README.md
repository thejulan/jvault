<div align="center">

<img src="dashboard/assets/logo.png" alt="JVault Logo" width="160" height="160" />

# JVault — Sovereign Multi-Chain Crypto Treasury & Gateway

**Self-Hosted • 100% Non-Custodial • Zero Intermediaries • Real-Time On-Chain Mempool Settlement**

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Framework](https://img.shields.io/badge/framework-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![Telegram](https://img.shields.io/badge/telegram-Telethon%20MTProto-2CA5E0.svg)](https://docs.telethon.dev/)
[![Encryption](https://img.shields.io/badge/security-AES--256--GCM-success.svg)](#security--architecture)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub Repository](https://img.shields.io/badge/GitHub-thejulan%2Fjvault-181717?logo=github)](https://github.com/thejulan/jvault)

</div>

---

## 📖 Overview

**JVault** is a modern, high-performance, self-hosted cryptocurrency payment gateway and multi-chain treasury manager. Built from the ground up to eliminate centralized third-party custodians (like Binance, Stripe, or BitPay), JVault gives you 100% sovereignty over your private keys, receiving addresses, and transaction settlements.

All master HD seeds and mnemonics are stored locally in an encrypted SQLite database using **AES-256-GCM** with **PBKDF2 HMAC-SHA256** key derivation. With an elegant single-page application (SPA) dashboard inspired by physical EMV credit cards, real-time on-chain mempool tracking, and automated Telegram bot checkout synchronization, JVault provides an enterprise-grade payment infrastructure for merchants, developers, and autonomous systems.

---

## ✨ Key Features

### 💳 Physical Credit-Card Interface & Address Derivation
- **Sleek EMV Card Design**: Wallets and derived addresses are displayed as physical-styled credit cards featuring metallic EMV smart chips, contactless NFC waves, segmented address formatting (`0x892A •••• •••• B3C9`), and native network styling.
- **Dedicated Addresses Management**: Manage all derived network addresses from a dedicated subpage (`#addresses?walletId=...`) with balance overview, copy buttons, and QR code inspection.
- **On-Chain Balances Refresher**: 1-click batch balance query across live blockchain RPCs and explorers (Bitcoin mempool, EVM RPCs, TronGrid, Solana, TON).
- **Temporary & Disposable Addresses**: Derivate addresses with custom expiry (`Permanent`, `15 Minutes`, `30 Minutes`, `45 Minutes`, `1 Hour`) with real-time countdown clocks.

### ⚡ Fast Universal Receive (Blind Checkout)
- **Universal Payment Invoices (`PAY-XXXX`)**: Generate universal invoices where payers select their preferred coin and network upon opening the payment link.
- **Gas Fee Estimation & Confirmations**: Displays real-time estimated network gas fees (e.g. `13.4 TRX`, `3 Gwei`, `14 sats/vB`) and block confirmation progress (`x / required`).
- **One-Click Amount Copying**: Eliminates costly underpayments or overpayments by allowing payers to copy the exact cryptocurrency amount with a single click.

### 🤖 Telethon Telegram Bot MTProto Auto-Sync
- **Persistent Session Architecture**: Uses a persistent SQLite session (`api/data/telethon_bot.session`) to maintain MTProto credentials across restarts without triggering Telegram `ImportBotAuthorizationRequest` rate limits.
- **Deep-Link Checkout (`https://t.me/YourBot?start=PAY-XXXX`)**: Customers can pay directly inside Telegram with inline keyboard network pickers and instant QR code image delivery.
- **Live Message Editing**: The bot automatically edits the customer's Telegram message in real time as payments transition from `PENDING` ➔ `DETECTED (Mempool)` ➔ `CONFIRMING (x/req)` ➔ `PAID ✅`.
- **Automatic Profile & Name Synchronization**: Automatically configures bot name (`{BotName} - Powered By JVault`), about text, description, and avatar logo on startup without duplication.

### 🛡️ Privacy & Security Features
- **Secured Multi-Hop Privacy Routing**: Optional 1 to 4 hop stealth routing that derives intermediate addresses from the master HD seed to obscure on-chain transaction clustering.
- **Encrypted Local Backups (`.vaultix`)**: Export entire treasury (wallets, derived keys, payments, settings) into an encrypted single-file container protected by a 6-character alphanumeric PIN.
- **Self-Destruct Danger Zone**: Irreversible 10-second countdown data wipe with a mandatory 3-second abort long-press mechanism.
- **Automatic Dark/Light Mode Theme Inversion**: Dynamic theme switching that cleanly swaps between dark and inverted white vector logo emblems.

---

## 🌐 Supported Blockchains & Tokens

| Blockchain / Network | Standards | Address Format | Derivation Standard |
| :--- | :--- | :--- | :--- |
| **Bitcoin (BTC)** | Native SegWit | `bc1q...` | BIP84 / BIP44 |
| **Ethereum (ETH)** | ERC-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **BNB Smart Chain (BSC)** | BEP-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **Polygon (POL/MATIC)** | ERC-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **Arbitrum One** | ERC-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **Optimism (OP)** | ERC-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **Base** | ERC-20 / Native | `0x...` | BIP44 (`m/44'/60'/0'/0/0`) |
| **TRON (TRX)** | TRC-20 / Native | `T...` | BIP44 (`m/44'/195'/0'/0/0`) |
| **Solana (SOL)** | SPL Tokens / Native | Base58 | BIP44 (`m/44'/501'/0'/0'`) |
| **The Open Network (TON)** | Jettons / Native | `UQ...` | BIP44 (`m/44'/607'/0'`) |
| **Litecoin (LTC)** | Native SegWit | `ltc1q...` | BIP84 / BIP44 |
| **Dogecoin (DOGE)** | Legacy P2PKH | `D...` | BIP44 (`m/44'/3'/0'/0/0`) |

*Full native support for **USDT**, **USDC**, and **DAI** across TRC-20, ERC-20, BEP-20, Polygon, Arbitrum, Solana SPL, and TON Jettons.*

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.10 or higher
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/thejulan/jvault.git
cd jvault
```

### 2. Set Up Virtual Environment & Dependencies
```bash
# Create and activate virtual environment
python -m venv venv

# On Linux/macOS:
source venv/bin/activate

# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### 3. Initialize Configuration
Copy the sample configuration file to `config.ini`:
```bash
# Linux/macOS:
cp config.example.ini config.ini

# Windows (PowerShell):
Copy-Item config.example.ini config.ini
```

### 4. Create an Administrator Account
Create your admin user securely via the CLI:
```bash
python run.py --create admin --username "admin" --password "YourStrongPassword123!"
```

### 5. Launch the Server
```bash
python run.py
```

The gateway is now running!
- **Dashboard Web UI**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Customer Checkout Sample**: [http://127.0.0.1:8000/pay](http://127.0.0.1:8000/pay)
- **Interactive OpenAPI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## ⚙️ Configuration (`config.ini`)

```ini
[server]
host = 127.0.0.1
port = 8000
secret_key = your-random-32-byte-secret-key
public_base_url = http://127.0.0.1:8000

[database]
db_path = api/data/jvault.db

[telegram]
api_id = 0
api_hash = 
bot_token = 
bot_username = JVaultPayBot

[gateway]
default_invoice_expire_minutes = 60
validator_interval_seconds = 5
simulation_mode = false
```

---

## 🤖 Telegram Bot Configuration

1. Log in to the JVault dashboard and navigate to **Settings** ➔ **Telegram Bot Setup**.
2. Provide your credentials:
   - **API ID** & **API Hash**: Generated from [my.telegram.org](https://my.telegram.org) under *API development tools*.
   - **Bot Token**: Created via [@BotFather](https://t.me/BotFather).
   - **Bot Username**: Your bot handle without `@` (e.g. `JVaultPayBot`).
3. Click **Save Settings** & **Start Bot**.
4. JVault will connect via Telethon MTProto and automatically update the bot profile name to `{BotName} - Powered By JVault`, configure its about description, and upload the JVault emblem avatar.

---

## 📁 Repository Structure

```text
jvault/
├── config.example.ini             # Template configuration file for deployment
├── requirements.txt               # Top-level Python dependency specification
├── run.py                         # Unified server launcher & admin CLI utility
├── README.md                      # Complete documentation & architecture guide
├── LICENSE                        # MIT License
├── api/
│   ├── app/
│   │   ├── config.py              # Configuration manager & path resolutions
│   │   ├── database.py            # SQLite schema, migrations, and repository models
│   │   ├── main.py                # FastAPI ASGI application, CORS, static mounts
│   │   ├── crypto/
│   │   │   ├── generator.py       # BIP39 / BIP44 / BIP84 multi-chain key derivation
│   │   │   ├── networks.py        # Gas fee parameters & confirmation thresholds
│   │   │   └── security.py        # AES-256-GCM encryption & PBKDF2 hashing
│   │   ├── payments/
│   │   │   ├── service.py         # Universal blind invoice lifecycle manager
│   │   │   ├── balance_checker.py # Real on-chain balance fetcher across RPCs
│   │   │   └── validator.py       # Background payment confirmation engine
│   │   ├── telegram_bot/
│   │   │   └── bot.py             # Telethon MTProto client with event handlers
│   │   └── routes/
│   │       ├── auth.py            # Authentication & session token management
│   │       ├── wallets.py         # Master wallets & address derivation endpoints
│   │       ├── payments.py        # Invoice creation, checkout, & QR codes
│   │       ├── telegram.py        # Telegram bot status and toggle controls
│   │       └── settings.py        # Encrypted backup export, restore, & danger zone
│   └── data/                      # Local data directory (ignored by git)
│       ├── .gitkeep
│       └── qr_codes/              # Pre-rendered checkout QR code images
└── dashboard/
    ├── index.html                 # Single Page Application (SPA) dashboard
    ├── pay.html                   # Customer checkout portal
    ├── assets/                    # Project logos, inverted dark mode emblems, SVGs
    ├── css/style.css              # Custom styling, animations, credit card themes
    └── js/
        ├── api.js                 # AJAX client wrapper
        ├── app.js                 # Router, state manager, and stats coordinator
        ├── auth.js                # Login, session verification, and logout
        ├── fast_receive.js        # Universal blind payment invoice generator
        ├── modals.js              # PIN prompts, delete confirmation, and modals
        ├── payments.js            # Invoices list, filter tabs, and audit log drawer
        ├── settings.js            # Settings manager, backup/restore, danger zone
        ├── theme.js               # Dark/Light mode manager & logo swap engine
        ├── toast.js               # Positioned toast notification stack
        └── wallets.js             # Credit card wallet renderer & address derivation
```

---

## 🔒 Security Best Practices

- **Keep Your Database Private**: Never commit `api/data/*.db` or `api/data/*.session` to version control. The included `.gitignore` protects these paths by default.
- **Reverse Proxy & SSL**: When deploying to production, run JVault behind Nginx, Caddy, or Cloudflare with SSL/TLS termination (`https://`).
- **Regular Encrypted Backups**: Periodically download a `.vaultix` backup from the Settings tab and store it on an air-gapped drive or encrypted storage.

---

## 📄 License

This project is open-source software licensed under the **[MIT License](LICENSE)**.

---

<div align="center">

**Built with pride by [Julan](https://github.com/thejulan)** • **[JVault GitHub Repository](https://github.com/thejulan/jvault)**

</div>
