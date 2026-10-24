// Universal Fast Receive (Blind Payment) Controller
const FastReceive = {
    targetWalletId: null,

    init() {
        // Prepare dropdowns when modal opens
    },

    async openModal(walletId = null, preselectedAddressId = null) {
        this.targetWalletId = walletId;

        document.getElementById('fast-receive-step-create').classList.remove('hidden');
        document.getElementById('fast-receive-step-result').classList.add('hidden');
        const fCreate = document.getElementById('fast-receive-footer-create');
        if (fCreate) fCreate.classList.remove('hidden');
        const fResult = document.getElementById('fast-receive-footer-result');
        if (fResult) fResult.classList.add('hidden');
        document.getElementById('fast-amount-input').value = '';
        document.getElementById('fast-desc-input').value = '';

        // If wallets not yet loaded, load them
        if (!Wallets.walletsList || Wallets.walletsList.length === 0) {
            try {
                await Wallets.loadWallets();
            } catch (e) {
                console.error("Could not load wallets for fast receive selector", e);
            }
        }

        // Initialize custom dropdown for destination wallet
        const walletOptions = (Wallets.walletsList || []).map(w => ({
            value: w.id,
            label: `${w.name} (${w.addresses_count || 10} Chains)`,
            iconHtml: `<i class="ph ph-wallet text-base text-indigo-500"></i>`,
            subtext: `Total: $${(w.total_balance_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }));

        let defaultWalletVal = walletId;
        if (!defaultWalletVal && Wallets.walletsList && Wallets.walletsList.length > 0) {
            const defW = Wallets.walletsList.find(w => w.is_default) || Wallets.walletsList[0];
            defaultWalletVal = defW.id;
        }

        CustomDropdown.create('fast-wallet-select-container', walletOptions.length > 0 ? walletOptions : [
            { value: '', label: 'Default Balance Vault', iconHtml: '<i class="ph ph-wallet text-base text-indigo-500"></i>' }
        ], defaultWalletVal || '', (val) => {
            this.targetWalletId = val;
            this.loadWalletAddresses(val);
        });

        // Load addresses for default wallet
        if (defaultWalletVal) {
            this.loadWalletAddresses(defaultWalletVal, preselectedAddressId);
        } else {
            CustomDropdown.create('fast-address-select-container', [
                { value: '', label: 'Universal Auto-Detect (All Supported Chains)', iconHtml: '<i class="ph ph-sparkle text-base text-amber-500"></i>' }
            ], '');
        }

        // Initialize custom dropdown for address lifespan / disposal time
        CustomDropdown.create('fast-lifespan-container', [
            { value: '0', label: 'Permanent Static Address (No Auto-delete)', iconHtml: '<i class="ph ph-infinity text-base text-emerald-500"></i>' },
            { value: '15', label: '15 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '30', label: '30 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '45', label: '45 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '60', label: '1 Hour (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '1440', label: '24 Hours (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' }
        ], '0');

        UI.openModal('modal-fast-receive');
    },

    async loadWalletAddresses(walletId, selectAddressId = '') {
        if (!walletId) return;
        try {
            const addrs = await API.get(`/api/wallets/${walletId}/addresses`);
            const addrOptions = [
                {
                    value: '',
                    label: 'Universal Auto-Detect (All Supported Chains)',
                    iconHtml: '<i class="ph ph-sparkle text-base text-amber-500"></i>',
                    subtext: 'Auto-allocates or binds address on token selection'
                }
            ];

            (addrs || []).forEach(a => {
                const shortAddr = a.address.length > 14 ? `${a.address.slice(0, 7)}...${a.address.slice(-5)}` : a.address;
                addrOptions.push({
                    value: a.id,
                    label: `[${a.short_name || a.network_id.toUpperCase()}] ${shortAddr} (${a.label || 'Default'})`,
                    icon: a.icon || a.network_id,
                    subtext: `Bal: ${a.balance || 0} ${a.short_name}`
                });
            });

            CustomDropdown.create('fast-address-select-container', addrOptions, selectAddressId || '');
        } catch (e) {
            console.error('Failed to load wallet addresses for fast receive', e);
        }
    },

    openCreateAddressModal() {
        const walletId = CustomDropdown.getValue('fast-wallet-select-container') || this.targetWalletId;
        Wallets.openGenerateAddressModal(walletId, (newAddr) => {
            if (newAddr && newAddr.id) {
                this.loadWalletAddresses(walletId, newAddr.id);
            }
        });
    },

    async submitPayment() {
        const selectedWalletId = CustomDropdown.getValue('fast-wallet-select-container') || this.targetWalletId;
        const selectedAddressId = CustomDropdown.getValue('fast-address-select-container') || null;
        const amountVal = parseFloat(document.getElementById('fast-amount-input').value) || 0.0;
        const desc = document.getElementById('fast-desc-input').value.trim();
        const durationMin = parseInt(CustomDropdown.getValue('fast-lifespan-container') || '0', 10);
        const btn = document.getElementById('btn-generate-fast-receive');

        try {
            btn.disabled = true;
            btn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> Generating Links...`;

            // Create universal blind payment with optional address binding
            const payment = await API.post('/api/payments/create', {
                amount: amountVal,
                description: desc || 'Crypto Invoice',
                wallet_id: selectedWalletId,
                address_id: selectedAddressId,
                is_temporary: durationMin > 0,
                duration_minutes: durationMin
            });

            this.showPaymentResult(payment);

            if (window.App) {
                App.addNotification({
                    title: 'Invoice Generated',
                    desc: `Universal payment link ${payment.id} created successfully for ${payment.amount ? (payment.amount + ' ' + (payment.currency || 'USD')) : 'Open Amount'}.`,
                    type: 'success'
                });
                App.loadAllData();
            } else {
                Toast.success(`Payment link generated: ${payment.id}`);
            }
        } catch (err) {
            Toast.error(err.message || 'Failed to create payment link');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="ph ph-lightning text-lg"></i> <span>Generate Payment Link</span>`;
        }
    },

    showPaymentResult(pay) {
        document.getElementById('fast-receive-step-create').classList.add('hidden');
        const resultContainer = document.getElementById('fast-receive-step-result');
        resultContainer.classList.remove('hidden');
        const fCreate = document.getElementById('fast-receive-footer-create');
        if (fCreate) fCreate.classList.add('hidden');
        const fResult = document.getElementById('fast-receive-footer-result');
        if (fResult) fResult.classList.remove('hidden');

        document.getElementById('res-pay-id').textContent = pay.id;
        document.getElementById('res-pay-amount').textContent = pay.amount > 0 ? `$${pay.amount} USD` : `Open Amount (Client Sets)`;

        // Only show payment links (Web & Telegram) as requested
        const webInput = document.getElementById('res-pay-web-link');
        const tgInput = document.getElementById('res-pay-tg-link');
        const formattedWeb = window.Settings ? Settings.formatLink(pay.web_link) : pay.web_link;
        webInput.value = formattedWeb;
        tgInput.value = pay.telegram_link;

        document.getElementById('btn-open-web-link').href = formattedWeb;
        document.getElementById('btn-open-tg-link').href = pay.telegram_link;
    },

    copyField(elementId, label) {
        const el = document.getElementById(elementId);
        const text = el.value !== undefined ? el.value : el.textContent;
        navigator.clipboard.writeText(text);
        Toast.success(`${label} copied to clipboard!`);
    }
};

window.FastReceive = FastReceive;
