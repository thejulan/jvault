// Settings Controller
const Settings = {
    settingsData: {},
    telegramStatus: {},

    async loadSettings() {
        try {
            const [s, tg] = await Promise.all([
                API.get('/api/settings'),
                API.get('/api/telegram/status')
            ]);
            this.settingsData = s;
            this.telegramStatus = tg;
            this.renderForm();
        } catch (e) {
            console.error('Failed to load settings', e);
            throw e;
        }
    },

    renderForm() {
        const savedDomain = localStorage.getItem('jvault_public_domain');
        document.getElementById('set-public-url').value = this.settingsData.public_base_url || savedDomain || window.location.origin;
        this.updateUrlPreview();
        document.getElementById('set-simulation-mode').checked = this.settingsData.simulation_mode === 'true';

        // Balance Base / Display Currency Dropdown
        const curr = (this.settingsData.treasury_currency || 'USD').toUpperCase();
        CustomDropdown.create('set-currency-select-container', [
            { value: 'USD', label: '$ US Dollar (USD)', iconHtml: '<span class="font-bold text-emerald-500 font-mono">$</span>', subtext: 'Base Fiat standard' },
            { value: 'BTC', label: '₿ Bitcoin (BTC)', icon: 'btc', subtext: 'Live rate via Binance' },
            { value: 'ETH', label: 'Ξ Ethereum (ETH)', icon: 'eth', subtext: 'Live rate via Binance' },
            { value: 'EUR', label: '€ Euro (EUR)', iconHtml: '<span class="font-bold text-sky-500 font-mono">€</span>', subtext: 'European Fiat rate' },
            { value: 'USDT', label: '₮ Tether USD (USDT)', icon: 'usdt', subtext: 'Stablecoin 1:1' },
            { value: 'LTC', label: 'Ł Litecoin (LTC)', icon: 'ltc', subtext: 'Live rate via Binance' },
            { value: 'SOL', label: '◎ Solana (SOL)', icon: 'sol', subtext: 'Live rate via Binance' },
            { value: 'DOGE', label: 'Ð Dogecoin (DOGE)', icon: 'doge', subtext: 'Live rate via Binance' }
        ], curr);

        // Telegram Bot UI
        document.getElementById('tg-api-id').value = this.settingsData.telegram_api_id || '';
        document.getElementById('tg-api-hash').value = this.settingsData.telegram_api_hash || '';
        const botTokenInput = document.getElementById('tg-bot-token');
        if (botTokenInput) {
            botTokenInput.value = this.settingsData.telegram_bot_token || '';
            botTokenInput.placeholder = 'e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
        }
        document.getElementById('tg-bot-username').value = this.settingsData.telegram_bot_username || 'JVaultPayBot';

        this.updateTelegramStatusUI();
    },

    updateTelegramStatusUI() {
        const badge = document.getElementById('tg-status-badge');
        const toggleBtn = document.getElementById('tg-toggle-btn');
        if (!badge) return;

        if (this.telegramStatus.cooldown_seconds && this.telegramStatus.cooldown_seconds > 0) {
            const mins = Math.ceil(this.telegramStatus.cooldown_seconds / 60);
            badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5';
            badge.innerHTML = `<i class="ph ph-hourglass-high animate-pulse"></i> RATE LIMITED (${mins}m cooldown)`;
            if (toggleBtn) {
                toggleBtn.textContent = `Cooldown (${mins}m)`;
                toggleBtn.disabled = true;
                toggleBtn.className = 'px-4 py-2 rounded-xl bg-zinc-700 text-zinc-400 text-xs font-semibold cursor-not-allowed';
            }
            return;
        }

        if (toggleBtn) toggleBtn.disabled = false;

        if (this.telegramStatus.running) {
            badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1.5';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> ONLINE (@${this.telegramStatus.bot_username})`;
            if (toggleBtn) {
                toggleBtn.textContent = 'Stop Bot';
                toggleBtn.className = 'px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold';
            }
        } else if (this.telegramStatus.configured) {
            badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5';
            badge.innerHTML = `<i class="ph ph-pause-circle"></i> STANDBY (Stopped)`;
            if (toggleBtn) {
                toggleBtn.textContent = 'Start Bot';
                toggleBtn.className = 'px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold';
            }
        } else {
            badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 flex items-center gap-1.5';
            badge.innerHTML = `<i class="ph ph-warning-circle"></i> NOT CONFIGURED`;
            if (toggleBtn) {
                toggleBtn.textContent = 'Configure & Start';
                toggleBtn.className = 'px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold';
            }
        }
    },

    getPublicBaseUrl() {
        return this.settingsData.public_base_url || localStorage.getItem('jvault_public_domain') || window.location.origin;
    },

    formatLink(link) {
        if (!link) return '';
        const base = this.getPublicBaseUrl().replace(/\/+$/, '');
        if (!base) return link;

        // If configured base is not 127/localhost, replace local prefixes
        if (!base.includes('127.0.0.1') && !base.includes('localhost')) {
            return link
                .replace(/^http:\/\/127\.0\.0\.1:\d+/, base)
                .replace(/^http:\/\/localhost:\d+/, base)
                .replace(/^https:\/\/127\.0\.0\.1:\d+/, base)
                .replace(/^https:\/\/localhost:\d+/, base);
        }
        return link;
    },

    useCurrentHost() {
        const input = document.getElementById('set-public-url');
        if (input) {
            input.value = window.location.origin;
            this.updateUrlPreview();
            Toast.info(`Public URL set to ${window.location.origin}`);
        }
    },

    resetToLocalhost() {
        const input = document.getElementById('set-public-url');
        if (input) {
            input.value = 'http://127.0.0.1:8000';
            this.updateUrlPreview();
            Toast.info('Public URL set to http://127.0.0.1:8000');
        }
    },

    updateUrlPreview() {
        const input = document.getElementById('set-public-url');
        const preview = document.getElementById('settings-url-preview');
        if (!input || !preview) return;
        let val = input.value.trim().replace(/\/+$/, '');
        if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
            val = (val.includes('127.0.0.1') || val.includes('localhost')) ? `http://${val}` : `https://${val}`;
        }
        preview.textContent = `${val || 'https://payments.example.com'}/pay/PAY-A1B2C3D4`;
    },

    async saveGeneralSettings() {
        let public_base_url = document.getElementById('set-public-url').value.trim().replace(/\/+$/, '');
        if (public_base_url && !public_base_url.startsWith('http://') && !public_base_url.startsWith('https://')) {
            public_base_url = (public_base_url.includes('127.0.0.1') || public_base_url.includes('localhost')) ? `http://${public_base_url}` : `https://${public_base_url}`;
            document.getElementById('set-public-url').value = public_base_url;
        }

        const simulation_mode = document.getElementById('set-simulation-mode').checked ? 'true' : 'false';
        const treasury_currency = CustomDropdown.getValue('set-currency-select-container') || 'USD';

        try {
            const res = await API.post('/api/settings', {
                public_base_url,
                simulation_mode,
                treasury_currency
            });
            this.settingsData.public_base_url = public_base_url;
            localStorage.setItem('jvault_public_domain', public_base_url);
            this.updateUrlPreview();
            Toast.success('General settings and public domain saved!');
            if (window.App) {
                App.loadStats();
            }
        } catch (e) {
            Toast.error('Failed to save settings');
        }
    },

    async saveTelegramConfig() {
        const api_id = document.getElementById('tg-api-id').value.trim();
        const api_hash = document.getElementById('tg-api-hash').value.trim();
        const bot_token = document.getElementById('tg-bot-token').value.trim();
        const bot_username = document.getElementById('tg-bot-username').value.trim();

        if (!api_id || !api_hash) {
            Toast.warning('Please enter Telegram API ID and API Hash');
            return;
        }

        const badge = document.getElementById('tg-status-badge');
        if (badge) {
            badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5';
            badge.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Starting the bot ... ...`;
        }

        try {
            const status = await API.post('/api/telegram/configure', {
                api_id,
                api_hash,
                bot_token: bot_token || this.settingsData.telegram_bot_token || '',
                bot_username
            });
            this.telegramStatus = status;
            this.updateTelegramStatusUI();
            Toast.success('Telegram Bot settings saved!');
        } catch (e) {
            Toast.error('Failed to configure Telegram bot');
            this.updateTelegramStatusUI();
        }
    },

    async toggleTelegramBot() {
        const badge = document.getElementById('tg-status-badge');
        const toggleBtn = document.getElementById('tg-toggle-btn');

        if (!this.telegramStatus.running) {
            if (badge) {
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5';
                badge.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Starting the bot ... ...`;
            }
            if (toggleBtn) {
                toggleBtn.disabled = true;
                toggleBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Starting...`;
            }
        }

        try {
            const status = await API.post('/api/telegram/toggle');
            this.telegramStatus = status;
            this.updateTelegramStatusUI();
            Toast.info(status.running ? 'Telegram Bot started' : 'Telegram Bot stopped');
        } catch (e) {
            Toast.error('Failed to toggle Telegram bot');
            this.updateTelegramStatusUI();
        } finally {
            if (toggleBtn) toggleBtn.disabled = false;
        }
    },

    // ==================== HOW TO GET TELEGRAM CREDENTIALS ====================
    openHowToGetModal(topic = 'api_id') {
        const isBot = (topic === 'bot_token');
        this.switchHowToGetTab(isBot ? 'bot_token' : 'api_credentials');
        UI.openModal('modal-how-to-get-telegram');
    },

    switchHowToGetTab(tab) {
        const btnApi = document.getElementById('how-tab-api');
        const btnBot = document.getElementById('how-tab-bot');
        const contentApi = document.getElementById('how-content-api');
        const contentBot = document.getElementById('how-content-bot');
        const titleEl = document.getElementById('how-to-get-title');

        if (tab === 'bot_token') {
            if (btnBot) {
                btnBot.className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow-sm transition-all cursor-pointer';
            }
            if (btnApi) {
                btnApi.className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all cursor-pointer';
            }
            if (contentBot) contentBot.classList.remove('hidden');
            if (contentApi) contentApi.classList.add('hidden');
            if (titleEl) titleEl.textContent = 'How to get Telegram Bot Token';
        } else {
            if (btnApi) {
                btnApi.className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow-sm transition-all cursor-pointer';
            }
            if (btnBot) {
                btnBot.className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all cursor-pointer';
            }
            if (contentApi) contentApi.classList.remove('hidden');
            if (contentBot) contentBot.classList.add('hidden');
            if (titleEl) titleEl.textContent = 'How to get Telegram API ID & Hash';
        }
    },

    // ==================== ENCRYPTED BACKUP & RESTORE (.jvault) ====================
    currentRestoreFile: null,
    currentRestoreFileBase64: null,

    openBackupModal() {
        UI.clearOtpInputs('backup-otp-container');
        UI.setupOtpInputs('backup-otp-container', (pin) => this.onBackupPinChanged(pin));
        const hint = document.getElementById('backup-pin-hint');
        if (hint) {
            hint.textContent = 'Must be exactly 6 letters & numbers.';
            hint.className = 'text-[11px] text-zinc-400 mt-1';
        }
        UI.openModal('modal-backup-jvault');
        const inputs = Array.from(document.querySelectorAll('#backup-otp-container input'));
        setTimeout(() => inputs[0] && inputs[0].focus(), 150);
    },

    onBackupPinChanged(val) {
        const pin = typeof val === 'string' ? val : UI.getOtpValue('backup-otp-container');
        const len = pin.length;
        const hint = document.getElementById('backup-pin-hint');
        if (hint) {
            if (len === 6) {
                hint.textContent = '✓ Valid 6-character PIN ready';
                hint.className = 'text-[11px] text-emerald-500 font-semibold mt-1';
            } else {
                hint.textContent = `Enter ${6 - len} more character${6 - len === 1 ? '' : 's'} (letters and digits).`;
                hint.className = 'text-[11px] text-zinc-400 mt-1';
            }
        }
    },

    async executeBackup() {
        const pin = UI.getOtpValue('backup-otp-container');
        if (pin.length !== 6) {
            Toast.warning('PIN must be exactly 6 characters (letters and digits)');
            const inputs = Array.from(document.querySelectorAll('#backup-otp-container input'));
            if (inputs[0]) inputs[0].focus();
            return;
        }

        const btn = document.getElementById('btn-execute-backup');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Encrypting...`;
        }

        try {
            const res = await API.post('/api/settings/backup', { pin });
            if (!res.file_data_base64) {
                throw new Error('Failed to generate backup payload');
            }

            // Convert base64 to binary blob
            const binaryStr = atob(res.file_data_base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `jvault-backup-${new Date().toISOString().slice(0, 10)}.jvault`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            UI.closeModal('modal-backup-jvault');
            Toast.success('✓ Encrypted .jvault backup downloaded successfully!');
        } catch (err) {
            Toast.error(err.message || 'Backup failed');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="ph-bold ph-download-simple"></i> <span>Download .jvault</span>`;
            }
        }
    },

    openRestoreModal() {
        this.currentRestoreFile = null;
        this.currentRestoreFileBase64 = null;

        const fileInput = document.getElementById('restore-file-input');
        if (fileInput) fileInput.value = '';

        const dropEmpty = document.getElementById('restore-drop-empty');
        const dropSelected = document.getElementById('restore-drop-selected');
        if (dropEmpty) dropEmpty.classList.remove('hidden');
        if (dropSelected) dropSelected.classList.add('hidden');

        const pinSection = document.getElementById('restore-pin-section');
        if (pinSection) pinSection.classList.add('hidden');

        UI.clearOtpInputs('restore-otp-container');
        UI.setupOtpInputs('restore-otp-container', (pin) => this.onRestorePinChanged(pin));

        const proceedBtn = document.getElementById('btn-proceed-restore');
        if (proceedBtn) proceedBtn.disabled = true;

        UI.openModal('modal-restore-jvault');
    },

    onRestoreDragOver(e) {
        if (e && e.preventDefault) e.preventDefault();
        const zone = document.getElementById('restore-drop-zone');
        if (zone) zone.classList.add('border-indigo-500', 'bg-indigo-50/20');
    },

    onRestoreDragLeave(e) {
        if (e && e.preventDefault) e.preventDefault();
        const zone = document.getElementById('restore-drop-zone');
        if (zone) zone.classList.remove('border-indigo-500', 'bg-indigo-50/20');
    },

    onRestoreDrop(e) {
        if (e && e.preventDefault) e.preventDefault();
        this.onRestoreDragLeave(e);
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            this.onRestoreFileSelected(e.dataTransfer.files);
        }
    },

    onRestoreFileSelected(files) {
        if (!files || files.length === 0) return;
        const file = files[0];

        if (!file.name.toLowerCase().endsWith('.jvault')) {
            Toast.error('Invalid file type. Please upload a .jvault backup file.');
            return;
        }

        this.currentRestoreFile = file;

        // Display selected file card
        const dropEmpty = document.getElementById('restore-drop-empty');
        const dropSelected = document.getElementById('restore-drop-selected');
        if (dropEmpty) dropEmpty.classList.add('hidden');
        if (dropSelected) dropSelected.classList.remove('hidden');

        document.getElementById('restore-file-name').textContent = file.name;
        const sizeKb = (file.size / 1024).toFixed(1);
        document.getElementById('restore-file-size').textContent = `${sizeKb} KB`;

        // Read file as base64
        const reader = new FileReader();
        reader.onload = (evt) => {
            const raw = evt.target.result;
            const base64Str = raw.includes(',') ? raw.split(',')[1] : raw;
            this.currentRestoreFileBase64 = base64Str;

            // Show PIN section
            const pinSection = document.getElementById('restore-pin-section');
            if (pinSection) pinSection.classList.remove('hidden');

            UI.clearOtpInputs('restore-otp-container');
            UI.setupOtpInputs('restore-otp-container', (pin) => this.onRestorePinChanged(pin));
            const inputs = Array.from(document.querySelectorAll('#restore-otp-container input'));
            if (inputs[0]) {
                inputs[0].focus();
            }
            this.onRestorePinChanged('');
        };
        reader.readAsDataURL(file);
    },

    onRestorePinChanged(val) {
        const pin = typeof val === 'string' ? val : UI.getOtpValue('restore-otp-container');
        const len = pin.length;

        const proceedBtn = document.getElementById('btn-proceed-restore');
        if (proceedBtn) {
            proceedBtn.disabled = !(this.currentRestoreFileBase64 && len === 6);
        }
    },

    openRestoreConfirmModal() {
        const pin = UI.getOtpValue('restore-otp-container');
        if (pin.length !== 6 || !this.currentRestoreFileBase64) {
            Toast.warning('Please select a valid .jvault file and enter the 6-character PIN');
            return;
        }
        UI.closeModal('modal-restore-jvault');
        UI.openModal('modal-restore-confirm');
    },

    backupCurrentFirst() {
        UI.closeModal('modal-restore-confirm');
        this.openBackupModal();
    },

    async executeRestore() {
        const pin = UI.getOtpValue('restore-otp-container');

        if (!this.currentRestoreFileBase64 || pin.length !== 6) {
            Toast.error('Missing backup file or 6-character PIN');
            return;
        }

        const confirmBtn = document.getElementById('btn-confirm-overwrite-restore');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Restoring database...`;
        }

        try {
            await API.post('/api/settings/restore', {
                file_data_base64: this.currentRestoreFileBase64,
                pin: pin
            });

            UI.closeModal('modal-restore-confirm');
            Toast.success('✓ JVault restored successfully! Refreshing data...');

            // Reload all components
            await this.loadSettings();
            if (window.Wallets) await Wallets.loadWallets(true);
            if (window.Payments) await Payments.loadPayments();
            if (window.App) {
                await App.loadStats();
                App.switchTab('wallets');
            }
        } catch (err) {
            Toast.error(err.message || 'Restore failed. Incorrect PIN or invalid file.');
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<span>Overwrite & Restore Now</span>`;
            }
        }
    },

    async changeMasterPassword() {
        const cur = document.getElementById('pwd-current').value;
        const nxt = document.getElementById('pwd-new').value;
        const confirm = document.getElementById('pwd-confirm').value;

        if (!cur || !nxt) {
            Toast.warning('Please fill in password fields');
            return;
        }
        if (nxt !== confirm) {
            Toast.warning('New passwords do not match');
            return;
        }

        try {
            await API.post('/api/auth/change-password', {
                current_password: cur,
                new_password: nxt
            });
            Toast.success('Master password updated successfully');
            document.getElementById('pwd-current').value = '';
            document.getElementById('pwd-new').value = '';
            document.getElementById('pwd-confirm').value = '';
        } catch (err) {
            Toast.error(err.message || 'Failed to update password');
        }
    },

    // ==================== DANGER ZONE: SELF-DESTROY DATA ====================
    selfDestroySeconds: 10,
    selfDestroyTimer: null,
    cancelHoldStartTime: null,
    cancelHoldAnimFrame: null,

    openSelfDestroyModal() {
        this.selfDestroySeconds = 10;
        this.updateSelfDestroyUI(10);
        this.resetCancelHoldUI();

        const btnCancel = document.getElementById('btn-self-destroy-cancel');
        if (btnCancel) btnCancel.disabled = false;

        UI.openModal('modal-self-destroy');

        if (this.selfDestroyTimer) clearInterval(this.selfDestroyTimer);
        this.selfDestroyTimer = setInterval(() => {
            this.selfDestroySeconds--;
            if (this.selfDestroySeconds <= 0) {
                clearInterval(this.selfDestroyTimer);
                this.selfDestroyTimer = null;
                this.updateSelfDestroyUI(0);
                this.executeSelfDestroy();
            } else {
                this.updateSelfDestroyUI(this.selfDestroySeconds);
            }
        }, 1000);
    },

    updateSelfDestroyUI(seconds) {
        const timerText = document.getElementById('self-destroy-timer-text');
        if (timerText) timerText.textContent = `${seconds}s`;

        const circle = document.getElementById('self-destroy-circle');
        if (circle) {
            const total = 264;
            const offset = total * (1 - seconds / 10);
            circle.style.strokeDashoffset = `${offset}`;
        }
    },

    startCancelHold(e) {
        if (e && e.preventDefault) e.preventDefault();
        this.cancelHoldStartTime = Date.now();
        const bar = document.getElementById('cancel-hold-bar');
        const label = document.getElementById('cancel-hold-label');
        const hint = document.getElementById('cancel-hold-hint');

        const step = () => {
            if (!this.cancelHoldStartTime) return;
            const elapsed = Date.now() - this.cancelHoldStartTime;
            const progress = Math.min(100, (elapsed / 3000) * 100);

            if (bar) bar.style.width = `${progress}%`;
            if (label) {
                const remainingSec = Math.max(0, (3000 - elapsed) / 1000).toFixed(1);
                label.textContent = `Holding... ${remainingSec}s`;
            }
            if (hint) {
                hint.textContent = 'Keep holding to abort self-destruction...';
                hint.className = 'text-xs text-amber-500 dark:text-amber-400 mt-4 px-2 font-semibold leading-relaxed pb-2';
            }

            if (elapsed >= 3000) {
                this.abortSelfDestroy();
            } else {
                this.cancelHoldAnimFrame = requestAnimationFrame(step);
            }
        };

        this.cancelHoldAnimFrame = requestAnimationFrame(step);
    },

    stopCancelHold(e) {
        if (!this.cancelHoldStartTime) return;
        this.cancelHoldStartTime = null;
        if (this.cancelHoldAnimFrame) {
            cancelAnimationFrame(this.cancelHoldAnimFrame);
            this.cancelHoldAnimFrame = null;
        }
        this.resetCancelHoldUI();
    },

    resetCancelHoldUI() {
        const bar = document.getElementById('cancel-hold-bar');
        if (bar) bar.style.width = '0%';
        const label = document.getElementById('cancel-hold-label');
        if (label) label.textContent = 'Hold to Cancel (3s)';
        const hint = document.getElementById('cancel-hold-hint');
        if (hint) {
            hint.textContent = 'Press and hold button for 3 full seconds to abort sequence';
            hint.className = 'text-xs text-zinc-500 dark:text-zinc-400 mt-4 px-2 font-medium leading-relaxed pb-2';
        }
    },

    abortSelfDestroy() {
        if (this.selfDestroyTimer) {
            clearInterval(this.selfDestroyTimer);
            this.selfDestroyTimer = null;
        }
        this.cancelHoldStartTime = null;
        if (this.cancelHoldAnimFrame) {
            cancelAnimationFrame(this.cancelHoldAnimFrame);
            this.cancelHoldAnimFrame = null;
        }
        this.resetCancelHoldUI();
        UI.closeModal('modal-self-destroy');
        Toast.info('Self-destruction sequence aborted safely.', 4000, 'Sequence Cancelled');
    },

    async executeSelfDestroy() {
        const timerText = document.getElementById('self-destroy-timer-text');
        if (timerText) timerText.textContent = '0s';

        const label = document.getElementById('cancel-hold-label');
        if (label) label.textContent = 'PURGING DATA...';

        const hint = document.getElementById('cancel-hold-hint');
        if (hint) {
            hint.textContent = 'Wiping all wallets, addresses, payments, and notifications...';
            hint.className = 'text-xs text-rose-500 font-semibold mt-4 px-2 leading-relaxed pb-2';
        }

        const btnCancel = document.getElementById('btn-self-destroy-cancel');
        if (btnCancel) btnCancel.disabled = true;

        try {
            await API.post('/api/settings/self-destroy');
            Toast.error('All wallets, addresses, payments, and notifications have been permanently vanished.', 5000, 'Data Vanished');
        } catch (err) {
            console.error('Self destroy error:', err);
        } finally {
            // Purge all notifications in memory and UI
            if (window.App) {
                App.notifications = [];
                if (typeof App.renderNotifications === 'function') {
                    App.renderNotifications();
                }
            }
            if (window.Wallets) {
                Wallets.walletsList = [];
                Wallets.addressesList = [];
                Wallets.currentWalletId = null;
                if (typeof Wallets.renderWallets === 'function') {
                    Wallets.renderWallets();
                }
            }
            if (window.Payments) {
                Payments.transactionsList = [];
                Payments.rawPayments = [];
                Payments.rawWithdrawals = [];
                if (typeof Payments.applyFiltersAndRender === 'function') {
                    Payments.applyFiltersAndRender();
                }
            }
            // Permanently clear local and session storage
            localStorage.clear();
            sessionStorage.clear();
            setTimeout(() => {
                window.location.href = '/';
                window.location.reload();
            }, 1000);
        }
    }
};

window.Settings = Settings;
