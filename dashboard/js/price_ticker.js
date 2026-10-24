// Live Real-Time Cryptocurrency Prices & Currency Converter Widget
const PriceTicker = {
    prices: {
        'BTC': 82500,
        'ETH': 2450,
        'SOL': 105,
        'BNB': 740,
        'TRX': 0.33,
        'LTC': 60.5,
        'TON': 5.25,
        'DOGE': 0.08,
        'MATIC': 0.38,
        'POL': 0.38,
        'USDT': 1.0,
        'USDC': 1.0,
        'EUR': 1.08
    },
    changes24h: {
        'BTC': '+3.42%',
        'ETH': '+2.15%',
        'SOL': '+5.80%',
        'BNB': '+1.10%',
        'TRX': '+0.45%',
        'LTC': '+1.85%',
        'TON': '+3.90%',
        'DOGE': '-0.75%',
        'MATIC': '+1.20%',
        'POL': '+1.20%',
        'USDT': '0.00%',
        'USDC': '0.00%'
    },
    activeTab: 'ticker', // 'ticker' | 'calculator'
    calcAmount: 1,
    calcFrom: 'BTC',
    calcTo: 'USD',
    pollTimer: null,
    isOpen: false,

    async init() {
        await this.fetchPrices();
        this.renderTicker();
        this.renderCalculator();

        // Poll every 10 seconds for real-time market updates
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.fetchPrices(), 10000);
    },

    async fetchPrices() {
        try {
            const data = await API.get('/api/prices').catch(() => null);
            if (data && typeof data === 'object') {
                Object.assign(this.prices, data);
                this.updateTickerDisplay();
                this.calculateConversion();
                const timeEl = document.getElementById('ticker-last-updated');
                if (timeEl) {
                    timeEl.textContent = new Date().toLocaleTimeString();
                }
            }
        } catch (e) {
            // Keep existing cached prices on network glitch
        }
    },

    toggleModal() {
        const modal = document.getElementById('floating-price-modal');
        if (!modal) return;
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            modal.classList.remove('hidden');
            this.fetchPrices();
        } else {
            modal.classList.add('hidden');
        }
    },

    closeModal() {
        this.isOpen = false;
        const modal = document.getElementById('floating-price-modal');
        if (modal) modal.classList.add('hidden');
    },

    switchSubTab(tab) {
        this.activeTab = tab;
        const tickerTabBtn = document.getElementById('ticker-tab-btn');
        const calcTabBtn = document.getElementById('calc-tab-btn');
        const tickerPane = document.getElementById('ticker-pane-container');
        const calcPane = document.getElementById('calc-pane-container');

        if (tab === 'ticker') {
            tickerTabBtn?.classList.add('bg-indigo-600', 'text-white');
            tickerTabBtn?.classList.remove('text-zinc-400');
            calcTabBtn?.classList.remove('bg-indigo-600', 'text-white');
            calcTabBtn?.classList.add('text-zinc-400');
            tickerPane?.classList.remove('hidden');
            calcPane?.classList.add('hidden');
        } else {
            calcTabBtn?.classList.add('bg-indigo-600', 'text-white');
            calcTabBtn?.classList.remove('text-zinc-400');
            tickerTabBtn?.classList.remove('bg-indigo-600', 'text-white');
            tickerTabBtn?.classList.add('text-zinc-400');
            calcPane?.classList.remove('hidden');
            tickerPane?.classList.add('hidden');
            this.calculateConversion();
        }
    },

    renderTicker() {
        const list = document.getElementById('ticker-crypto-list');
        if (!list) return;

        const cryptos = [
            { sym: 'BTC', name: 'Bitcoin', icon: 'btc' },
            { sym: 'ETH', name: 'Ethereum', icon: 'eth' },
            { sym: 'SOL', name: 'Solana', icon: 'sol' },
            { sym: 'BNB', name: 'BNB Chain', icon: 'bnb' },
            { sym: 'LTC', name: 'Litecoin', icon: 'ltc' },
            { sym: 'TRX', name: 'TRON', icon: 'trx' },
            { sym: 'TON', name: 'TON Network', icon: 'ton' },
            { sym: 'DOGE', name: 'Dogecoin', icon: 'doge' },
            { sym: 'USDT', name: 'Tether USD', icon: 'usdt' },
            { sym: 'USDC', name: 'USD Coin', icon: 'usdc' }
        ];

        list.innerHTML = cryptos.map(c => {
            const price = this.prices[c.sym] || 1;
            const change = this.changes24h[c.sym] || '+0.00%';
            const isPositive = !change.startsWith('-');
            const formattedPrice = price >= 1 ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${price.toFixed(4)}`;

            return `
                <div class="p-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between hover:border-indigo-500/40 transition-all group">
                    <div class="flex items-center gap-2.5">
                        <div class="shrink-0">${CryptoIcons.get(c.icon, 24)}</div>
                        <div>
                            <div class="flex items-center gap-1.5">
                                <span class="font-bold text-xs text-zinc-900 dark:text-zinc-100">${c.sym}</span>
                                <span class="text-[10px] text-zinc-400">${c.name}</span>
                            </div>
                            <span class="text-[10px] font-mono font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}">${change} (24h)</span>
                        </div>
                    </div>
                    <div class="text-right flex items-center gap-2">
                        <div>
                            <span class="font-mono font-extrabold text-xs text-zinc-900 dark:text-zinc-100 block">${formattedPrice}</span>
                            <span class="text-[9px] text-zinc-400">USD Rate</span>
                        </div>
                        <button onclick="PriceTicker.openCalculatorFor('${c.sym}')" class="p-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-indigo-500 transition-all" data-tooltip="Convert ${c.sym}">
                            <i class="ph ph-calculator text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    updateTickerDisplay() {
        this.renderTicker();
    },

    openCalculatorFor(symbol) {
        this.calcFrom = symbol;
        this.calcTo = 'USD';
        this.calcAmount = 1;
        this.switchSubTab('calculator');
        const fromEl = document.getElementById('calc-from-select');
        const toEl = document.getElementById('calc-to-select');
        const amtEl = document.getElementById('calc-amount-input');
        if (fromEl) fromEl.value = symbol;
        if (toEl) toEl.value = 'USD';
        if (amtEl) amtEl.value = '1';
        this.calculateConversion();
    },

    renderCalculator() {
        const fromEl = document.getElementById('calc-from-select');
        const toEl = document.getElementById('calc-to-select');
        if (!fromEl || !toEl) return;

        const options = ['BTC', 'ETH', 'SOL', 'BNB', 'LTC', 'TRX', 'TON', 'DOGE', 'USDT', 'USDC', 'USD', 'EUR'];

        fromEl.innerHTML = options.map(o => `<option value="${o}" ${o === this.calcFrom ? 'selected' : ''}>${o}</option>`).join('');
        toEl.innerHTML = options.map(o => `<option value="${o}" ${o === this.calcTo ? 'selected' : ''}>${o}</option>`).join('');
        fromEl.value = this.calcFrom || 'BTC';
        toEl.value = this.calcTo || 'USD';
        this.calculateConversion();
    },

    swapCurrencies() {
        const fromEl = document.getElementById('calc-from-select');
        const toEl = document.getElementById('calc-to-select');
        if (!fromEl || !toEl) return;
        const temp = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = temp;
        this.calcFrom = fromEl.value;
        this.calcTo = toEl.value;
        this.calculateConversion();
    },

    calculateConversion() {
        const amtInput = document.getElementById('calc-amount-input');
        const fromEl = document.getElementById('calc-from-select');
        const toEl = document.getElementById('calc-to-select');
        const resEl = document.getElementById('calc-result-display');
        const formulaEl = document.getElementById('calc-rate-formula');

        if (!amtInput || !fromEl || !toEl || !resEl) return;

        const amt = parseFloat(amtInput.value) || 0;
        const from = fromEl.value;
        const to = toEl.value;
        this.calcFrom = from;
        this.calcTo = to;
        this.calcAmount = amt;

        const getUsdPrice = (sym) => {
            if (sym === 'USD') return 1.0;
            if (sym === 'EUR') return 1.08;
            return this.prices[sym] || 1.0;
        };

        const fromPriceUsd = getUsdPrice(from);
        const toPriceUsd = getUsdPrice(to);

        // Value in USD = amt * fromPriceUsd
        // Value in Target = Value in USD / toPriceUsd
        const converted = toPriceUsd > 0 ? (amt * fromPriceUsd) / toPriceUsd : 0;
        const rate = toPriceUsd > 0 ? fromPriceUsd / toPriceUsd : 0;

        let formattedOutput = '';
        if (['USD', 'EUR', 'USDT', 'USDC'].includes(to)) {
            formattedOutput = `$${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            formattedOutput = `${parseFloat(converted.toFixed(8))} ${to}`;
        }

        resEl.textContent = formattedOutput;
        if (formulaEl) {
            formulaEl.textContent = `1 ${from} = ${parseFloat(rate.toFixed(8))} ${to}`;
        }
    }
};

window.PriceTicker = PriceTicker;
