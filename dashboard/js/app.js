// Master Application Coordinator with Hash Routing
const App = {
    currentTab: 'overview',
    notifications: (() => {
        try {
            const raw = localStorage.getItem('jvault_notifications');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        const now = Date.now();
        return [
            {
                id: 'notif_init_1',
                title: 'Keystore Initialized',
                desc: 'JVault Local Keystore initialized securely with hardware-grade AES-256 encryption.',
                type: 'success',
                timestamp: now - 60000,
                unread: true
            },
            {
                id: 'notif_init_2',
                title: 'Multi-Chain Networks Active',
                desc: '10 multi-chain networks active with real on-chain RPC validation (BTC, ETH, SOL, TRON, TON, LTC, etc.).',
                type: 'info',
                timestamp: now - (3 * 3600000 + 15 * 60000), // 3h 15m ago
                unread: false
            }
        ];
    })(),
    stats: {},

    autoRefreshInterval: null,
    _routeRequestId: 0,
    _isNavigating: false,
    _routingInitialized: false,

    init() {
        window.App = this;
        Theme.init();
        UI.init();
        Wallets.init();
        Payments.init();
        FastReceive.init();
        if (window.PriceTicker) PriceTicker.init();
        Auth.init();
        this.initPwa();

        this.renderNotifications();
        this.startAutoRefresh();

        // Initialize Router based on current URL
        this.initRouting();

        // Prevent negative numbers on all number inputs globally
        document.addEventListener('keydown', (e) => {
            if (e.target && e.target.type === 'number') {
                if (e.key === '-' || e.key === 'Subtract') {
                    e.preventDefault();
                }
            }
        }, true);

        document.addEventListener('input', (e) => {
            if (e.target && e.target.type === 'number') {
                if (e.target.value !== '' && parseFloat(e.target.value) < 0) {
                    e.target.value = Math.abs(parseFloat(e.target.value)) || '';
                }
            }
        }, true);
    },

    startAutoRefresh() {
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
        // Refresh every 6 seconds without page reloads to catch status changes
        this.autoRefreshInterval = setInterval(async () => {
            if (!API.getToken()) return;
            try {
                // Background refresh depending on active tab
                if (this.currentTab === 'overview') {
                    await this.loadStats();
                } else if (this.currentTab === 'wallets') {
                    await Wallets.loadWallets();
                } else if (this.currentTab === 'addresses' && Wallets.currentWalletId) {
                    await Wallets.loadAddressesData(true);
                }

                // Always check payments status in background so notifications trigger on all tabs
                if (window.Payments) {
                    await Payments.loadPayments(false, true);
                }
            } catch (e) {
                // Ignore background polling errors
            }
        }, 6000);
    },

    getRouteFromUrl() {
        // Priority 1: URL Hash (#wallets, #payments, #settings, #addresses?walletId=...)
        const hash = window.location.hash ? window.location.hash.replace(/^#\/?/, '').trim() : '';
        if (hash) {
            return hash;
        }

        // Priority 2: Pathname (if served as /wallets instead of /#wallets)
        const path = window.location.pathname.replace(/^\/+/, '').split('/')[0].trim();
        const validPrimaryTabs = ['overview', 'wallets', 'payments', 'settings', 'addresses'];
        if (path && validPrimaryTabs.includes(path)) {
            return path;
        }

        // Priority 3: Last active tab stored in localStorage (if valid)
        const savedTab = localStorage.getItem('jvault_active_tab');
        if (savedTab && validPrimaryTabs.includes(savedTab)) {
            if (savedTab === 'addresses') {
                const wid = localStorage.getItem('jvault_active_wallet');
                return wid ? `addresses?walletId=${encodeURIComponent(wid)}` : 'wallets';
            }
            return savedTab;
        }

        // Fallback: Default to overview
        return 'overview';
    },

    initRouting() {
        if (!this._routingInitialized) {
            this._routingInitialized = true;

            // Handle browser Back / Forward buttons and manual hash edits
            window.addEventListener('hashchange', () => {
                if (this._isNavigating) {
                    this._isNavigating = false;
                    return;
                }
                const route = this.getRouteFromUrl();
                this.navigateTo(route, { updateHistory: false });
            });

            window.addEventListener('popstate', () => {
                const route = this.getRouteFromUrl();
                this.navigateTo(route, { updateHistory: false });
            });
        }

        // Trigger initial route loading if authenticated
        if (API.getToken()) {
            const initialRoute = this.getRouteFromUrl();
            this.navigateTo(initialRoute, { updateHistory: false, forceReload: true });
        }
    },

    switchTab(tabName) {
        return this.navigateTo(tabName, { updateHistory: true });
    },

    async navigateTo(routeString, options = {}) {
        if (!API.getToken()) {
            return;
        }

        const { updateHistory = true, forceReload = false } = options;

        // Parse route and query params
        const raw = (routeString || 'overview').replace(/^#\/?/, '').trim();
        const [tabPart, queryPart] = raw.split('?');
        const validTabs = ['overview', 'wallets', 'payments', 'settings', 'addresses'];

        // Graceful fallback for invalid tab names
        const tabName = validTabs.includes(tabPart) ? tabPart : 'overview';
        const params = new URLSearchParams(queryPart || '');

        let targetHash = `#${tabName}`;
        if (tabName === 'addresses' && params.get('walletId')) {
            targetHash = `#addresses?walletId=${encodeURIComponent(params.get('walletId'))}`;
        }

        // Prevent redundant requests if already on tab with same params
        if (!forceReload && this.currentTab === tabName && window.location.hash === targetHash) {
            return;
        }

        this.currentTab = tabName;
        localStorage.setItem('jvault_active_tab', tabName);

        // Synchronize URL hash without triggering duplicate hashchange
        if (window.location.hash !== targetHash) {
            this._isNavigating = true;
            if (updateHistory) {
                window.location.hash = targetHash;
            } else {
                window.history.replaceState(null, '', targetHash);
            }
        }

        // Update Page Title
        const titleMap = {
            overview: 'Overview',
            wallets: 'Wallets',
            payments: 'Payments & Sent',
            settings: 'System Settings',
            addresses: 'Dedicated Addresses'
        };
        document.title = `${titleMap[tabName] || 'Overview'} - JVault Gateway`;

        // Update Navigation Menu Active State
        document.querySelectorAll('.app-nav-tab').forEach(tab => {
            const tabAttr = tab.getAttribute('data-tab');
            const isMatch = tabAttr === tabName || (tabName === 'addresses' && tabAttr === 'wallets');
            if (isMatch) {
                tab.className = 'app-nav-tab nav-tab-active flex items-center gap-2 py-3 px-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 transition-colors';
            } else {
                tab.className = 'app-nav-tab flex items-center gap-2 py-3 px-3 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors';
            }
        });

        // Toggle Section Visibility
        ['overview', 'wallets', 'addresses', 'payments', 'settings'].forEach(t => {
            const view = document.getElementById(`tab-${t}`);
            if (view) {
                if (t === tabName) {
                    view.classList.remove('hidden');
                } else {
                    view.classList.add('hidden');
                }
            }
        });

        // Track request ID for stale response avoidance
        const requestId = ++this._routeRequestId;

        // Render loading state if container is empty
        this.renderTabLoadingState(tabName);

        try {
            if (tabName === 'overview') {
                await this.loadStats();
                if (!Wallets.walletsList || Wallets.walletsList.length === 0) {
                    await Wallets.loadWallets();
                }
            } else if (tabName === 'wallets') {
                await Wallets.loadWallets(true);
            } else if (tabName === 'payments') {
                Payments.shouldAnimateRows = true;
                await Payments.loadPayments();
            } else if (tabName === 'settings') {
                await Settings.loadSettings();
            } else if (tabName === 'addresses') {
                let wid = params.get('walletId') || localStorage.getItem('jvault_active_wallet');
                if (!wid) {
                    if (Wallets.walletsList && Wallets.walletsList.length > 0) {
                        wid = Wallets.walletsList[0].id;
                    } else {
                        const list = await API.get('/api/wallets');
                        Wallets.walletsList = Array.isArray(list) ? list : [];
                        if (Wallets.walletsList.length > 0) {
                            wid = Wallets.walletsList[0].id;
                        }
                    }
                }

                if (wid) {
                    Wallets.currentWalletId = wid;
                    localStorage.setItem('jvault_active_wallet', wid);
                    const addrHash = `#addresses?walletId=${wid}`;
                    if (window.location.hash !== addrHash) {
                        this._isNavigating = true;
                        window.history.replaceState(null, '', addrHash);
                    }
                    await Wallets.loadAddressesData();
                } else {
                    // No wallet exists, fallback to wallets tab
                    this.navigateTo('wallets', { updateHistory: false });
                    return;
                }
            }

            // Stale response guard: discard if user moved away while request was pending
            if (this._routeRequestId !== requestId) {
                return;
            }

            // Post-render component initializations
            this.initTabComponents(tabName);

        } catch (err) {
            if (this._routeRequestId !== requestId) return;
            console.error(`Error loading data for tab ${tabName}:`, err);
            this.renderTabErrorState(tabName, err);
        }
    },

    renderTabLoadingState(tabName) {
        if (tabName === 'wallets') {
            const container = document.getElementById('wallets-grid');
            if (container && (!Wallets.walletsList || Wallets.walletsList.length === 0)) {
                container.innerHTML = `
                    <div class="col-span-full p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 animate-pulse">
                        <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-2xl">
                            <i class="ph ph-spinner animate-spin"></i>
                        </div>
                        <h4 class="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">Loading Wallets...</h4>
                        <p class="text-xs text-zinc-400">Fetching on-chain keystore and balances...</p>
                    </div>
                `;
            }
        } else if (tabName === 'payments') {
            const tbody = document.getElementById('payments-table-body');
            if (tbody && (!Payments.rawPayments || Payments.rawPayments.length === 0)) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="p-12 text-center">
                            <div class="inline-flex items-center gap-2 text-indigo-500">
                                <i class="ph ph-spinner animate-spin text-xl"></i>
                                <span class="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Loading transactions...</span>
                            </div>
                        </td>
                    </tr>
                `;
            }
        } else if (tabName === 'addresses') {
            const listEl = document.getElementById('addresses-cards-grid');
            if (listEl && (!Wallets.currentAddresses || Wallets.currentAddresses.length === 0)) {
                listEl.innerHTML = `
                    <div class="col-span-full p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40">
                        <div class="inline-flex items-center gap-2 text-indigo-500">
                            <i class="ph ph-spinner animate-spin text-xl"></i>
                            <span class="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Loading dedicated addresses...</span>
                        </div>
                    </div>
                `;
            }
        } else if (tabName === 'overview') {
            const recentContainer = document.getElementById('overview-recent-payments');
            if (recentContainer && (!this.stats || Object.keys(this.stats).length === 0)) {
                recentContainer.innerHTML = `
                    <div class="p-8 text-center text-zinc-400 flex items-center justify-center gap-2">
                        <i class="ph ph-spinner animate-spin text-lg text-indigo-500"></i>
                        <span class="text-xs font-medium">Loading treasury statistics...</span>
                    </div>
                `;
            }
        }
    },

    renderTabErrorState(tabName, err) {
        let container = null;
        if (tabName === 'wallets') container = document.getElementById('wallets-grid');
        else if (tabName === 'payments') container = document.getElementById('payments-table-body');
        else if (tabName === 'addresses') container = document.getElementById('addresses-cards-grid');
        else if (tabName === 'overview') container = document.getElementById('overview-recent-payments');

        if (!container) return;

        const isTable = container.tagName.toLowerCase() === 'tbody';
        const html = `
            <div class="p-8 text-center rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 my-4">
                <div class="w-10 h-10 mx-auto mb-2.5 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center text-xl">
                    <i class="ph ph-warning-circle"></i>
                </div>
                <h4 class="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Failed to Load ${tabName.charAt(0).toUpperCase() + tabName.slice(1)}</h4>
                <p class="text-[11px] text-zinc-500 max-w-sm mx-auto mb-3">${err.message || 'Network error or server unavailable'}</p>
                <button onclick="App.navigateTo('${tabName}', { forceReload: true })" class="px-3.5 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shadow-sm">
                    <i class="ph ph-arrow-clockwise"></i>
                    <span>Retry</span>
                </button>
            </div>
        `;

        if (isTable) {
            container.innerHTML = `<tr><td colspan="8" class="p-4">${html}</td></tr>`;
        } else {
            container.innerHTML = html;
        }
    },

    initTabComponents(tabName) {
        if (tabName === 'wallets' || tabName === 'overview' || tabName === 'addresses') {
            Wallets.updateEyeIcons();
        }
        if (tabName === 'settings' && window.Settings) {
            Settings.updateUrlPreview();
            Settings.updateTelegramStatusUI();
        }
        if (tabName === 'payments' && window.Payments) {
            Payments.shouldAnimateRows = true;
            Payments.applyFiltersAndRender();
        }
    },

    async loadAllData() {
        await Promise.allSettled([
            this.loadStats(),
            Wallets.loadWallets(),
            Payments.loadPayments(),
            Settings.loadSettings()
        ]);
    },

    async loadStats() {
        try {
            const res = await API.get('/api/stats');
            this.stats = res;
            this.renderStats();
        } catch (e) {
            console.error('Failed to load stats', e);
            throw e;
        }
    },

    renderStats() {
        if (!this.stats) return;

        const totalEl = document.getElementById('stat-total-treasury');
        const subEl = document.getElementById('stat-treasury-sub');
        if (totalEl) {
            if (Wallets.balancesHidden) {
                totalEl.textContent = '••••••••';
                if (subEl) subEl.classList.add('hidden');
            } else {
                const curr = (this.stats.display_currency || 'USD').toUpperCase();
                const sym = this.stats.display_symbol || '$';
                const conv = this.stats.total_treasury_converted !== undefined ? this.stats.total_treasury_converted : (this.stats.total_treasury_usd || 0);

                if (curr === 'USD') {
                    totalEl.textContent = Wallets.formatBalance(this.stats.total_treasury_usd || 0);
                    if (subEl) subEl.classList.add('hidden');
                } else if (['BTC', 'ETH', 'LTC', 'SOL', 'DOGE', 'BNB', 'TRX', 'TON'].includes(curr)) {
                    totalEl.textContent = `${conv} ${curr}`;
                    if (subEl) {
                        subEl.textContent = `≈ $${(this.stats.total_treasury_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
                        subEl.classList.remove('hidden');
                    }
                } else {
                    totalEl.textContent = `${sym}${conv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
                    if (subEl) {
                        subEl.textContent = `≈ $${(this.stats.total_treasury_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
                        subEl.classList.remove('hidden');
                    }
                }
            }
        }

        const volEl = document.getElementById('stat-total-vol');
        if (volEl) {
            volEl.textContent = Wallets.formatBalance(this.stats.total_paid_volume_usd || 0);
        }

        const pendingEl = document.getElementById('stat-pending-count');
        if (pendingEl) {
            pendingEl.textContent = this.stats.pending_invoices_count || 0;
        }

        const walletsCountEl = document.getElementById('stat-wallets-count');
        if (walletsCountEl) {
            walletsCountEl.textContent = this.stats.wallets_count !== undefined ? this.stats.wallets_count : 0;
        }

        const derivedEl = document.getElementById('stat-networks-derived');
        if (derivedEl) {
            const addrsCount = this.stats.addresses_count !== undefined ? this.stats.addresses_count : 0;
            derivedEl.textContent = `${addrsCount} Networks Derived`;
        }

        // Render recent payments on overview
        const recentContainer = document.getElementById('overview-recent-payments');
        if (recentContainer) {
            const items = this.stats.recent_payments || [];
            if (items.length === 0) {
                recentContainer.innerHTML = `<div class="p-6 text-center text-xs text-zinc-400">No payment activity yet. Click Fast Receive in the navbar to create a payment link.</div>`;
            } else {
                recentContainer.innerHTML = items.map(p => {
                    const reqConfs = p.required_confirmations || 1;
                    return `
                        <div class="py-3 px-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl transition-colors">
                            <div class="flex items-center gap-3">
                                ${CryptoIcons.get(p.currency || 'usdt', 28)}
                                <div>
                                    <div class="font-bold text-xs text-zinc-900 dark:text-zinc-100">${p.id} &bull; ${p.currency ? (p.amount > 0 ? `${p.amount} ${p.currency}` : `Open (${p.currency})`) : 'Blind Universal'}</div>
                                    <div class="text-[11px] text-zinc-400">${p.network_name} ${p.gas_fee_est ? `&bull; ${p.gas_fee_est}` : ''}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${p.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500' : p.status === 'CONFIRMING' ? 'bg-amber-500/10 text-amber-500' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}">${p.status} ${p.status === 'CONFIRMING' ? `(${p.confirmations || 0}/${reqConfs})` : ''}</span>
                                <button onclick="Payments.openDetailModal('${p.id}')" class="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                                    <i class="ph ph-arrow-up-right text-sm"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    },

    addNotification(payload, desc = '', type = 'info', playSound = true) {
        let notif;
        if (typeof payload === 'object' && payload !== null) {
            notif = {
                id: payload.id || ('notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                title: payload.title || 'Notification',
                desc: payload.desc || payload.message || payload.text || '',
                type: (payload.type === 'error' ? 'danger' : payload.type) || 'info',
                timestamp: payload.timestamp || Date.now(),
                unread: payload.unread !== false
            };
        } else {
            const hasDesc = Boolean(desc);
            notif = {
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title: hasDesc ? String(payload) : (type === 'success' ? 'Success' : (type === 'danger' || type === 'error' ? 'Alert' : (type === 'warning' ? 'Warning' : 'Information'))),
                desc: hasDesc ? desc : String(payload),
                type: (type === 'error' ? 'danger' : type) || 'info',
                timestamp: Date.now(),
                unread: true
            };
        }

        // Add to array
        this.notifications.unshift(notif);

        // Keep unread items at the top, then sort by timestamp descending
        this.sortNotifications();

        // Limit to 50 items
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }

        // Persist to localStorage
        this.saveNotifications();

        // Play audio sound
        if (playSound !== false) {
            this.playNotificationSound();
        }

        // Show toast in top right
        if (window.Toast) {
            Toast.show(notif.desc, notif.type, 4500, notif.title);
        }

        // Render UI
        this.renderNotifications();
    },

    sortNotifications() {
        this.notifications.sort((a, b) => {
            const unreadDiff = (b.unread ? 1 : 0) - (a.unread ? 1 : 0);
            if (unreadDiff !== 0) return unreadDiff;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
    },

    saveNotifications() {
        try {
            localStorage.setItem('jvault_notifications', JSON.stringify(this.notifications));
        } catch (e) {
            console.warn('Failed to save notifications', e);
        }
    },

    playNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            // Subtle 2-note ascending high-tech chime
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.08);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.35);
        } catch (err) {
            // Browser autoplay restrictions before user gesture - ignore
        }
    },

    formatNotificationDate(timestamp) {
        if (!timestamp) return '1m ago';
        const now = Date.now();
        const diffMs = Math.max(0, now - Number(timestamp));
        const mins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMs / 3600000);
        const days = Math.floor(diffMs / 86400000);

        if (mins < 1) {
            return '1m ago';
        }
        if (mins < 60) {
            return `${mins}m ago`;
        }
        if (hours < 24) {
            const remMins = mins % 60;
            return remMins > 0 ? `${hours}h ${remMins}m ago` : `${hours}h ago`;
        }
        if (days < 7) {
            return `${days} ${days === 1 ? 'day' : 'days'} ago`;
        }
        const d = new Date(timestamp);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    markAllNotificationsRead() {
        this.notifications.forEach(n => { n.unread = false; });
        this.sortNotifications();
        this.saveNotifications();
        this.renderNotifications();
        if (window.Toast) Toast.info('All notifications marked as read', 2500);
    },

    markNotificationRead(id) {
        const notif = this.notifications.find(n => n.id === id);
        if (notif && notif.unread) {
            notif.unread = false;
            this.sortNotifications();
            this.saveNotifications();
            this.renderNotifications();
        }
    },

    renderNotifications() {
        this.sortNotifications();
        const unreadCount = this.notifications.filter(n => n.unread).length;
        const badge = document.getElementById('notif-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.classList.remove('hidden');
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            } else {
                badge.classList.add('hidden');
            }
        }

        const pill = document.getElementById('notif-unread-count-pill');
        if (pill) {
            if (unreadCount > 0) {
                pill.classList.remove('hidden');
                pill.textContent = `${unreadCount} unread`;
            } else {
                pill.classList.add('hidden');
            }
        }

        const listEl = document.getElementById('notif-list');
        if (!listEl) return;

        if (this.notifications.length === 0) {
            listEl.innerHTML = `
                <div class="p-8 text-center text-zinc-400">
                    <i class="ph ph-bell-slash text-2xl mb-1.5 opacity-60"></i>
                    <p class="text-xs font-medium">No notifications yet</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.notifications.map(n => {
            const formattedDate = this.formatNotificationDate(n.timestamp);

            let typeIcon = '<i class="ph-bold ph-info text-sky-500 text-sm"></i>';
            let typeBg = 'bg-sky-500/10 border border-sky-500/20';
            let badgeText = 'INFO';
            let badgeStyle = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20';

            if (n.type === 'success') {
                typeIcon = '<i class="ph-bold ph-check-circle text-emerald-500 text-sm"></i>';
                typeBg = 'bg-emerald-500/10 border border-emerald-500/20';
                badgeText = 'SUCCESS';
                badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
            } else if (n.type === 'warning') {
                typeIcon = '<i class="ph-bold ph-warning text-amber-500 text-sm"></i>';
                typeBg = 'bg-amber-500/10 border border-amber-500/20';
                badgeText = 'WARNING';
                badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
            } else if (n.type === 'danger' || n.type === 'error') {
                typeIcon = '<i class="ph-bold ph-warning-circle text-rose-500 text-sm"></i>';
                typeBg = 'bg-rose-500/10 border border-rose-500/20';
                badgeText = 'DANGER';
                badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
            }

            return `
                <div onclick="App.markNotificationRead('${n.id}')" class="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-xs flex items-start gap-3 transition-colors cursor-pointer group ${n.unread ? 'bg-indigo-50/40 dark:bg-indigo-950/25 border-l-2 border-indigo-500' : 'opacity-85'}">
                    <div class="w-8 h-8 rounded-xl ${typeBg} flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        ${typeIcon}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1.5 mb-1">
                            <span class="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">${n.title}</span>
                            <span class="text-[10px] font-mono text-zinc-400 shrink-0">${formattedDate}</span>
                        </div>
                        <p class="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed break-words">${n.desc}</p>
                        <div class="flex items-center gap-2 mt-1.5">
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${badgeStyle}">
                                ${badgeText}
                            </span>
                            ${n.unread ? `
                                <span class="text-[10px] text-indigo-500 font-semibold flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                    Unread
                                </span>
                            ` : `
                                <span class="text-[10px] text-zinc-400">Read</span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    deferredPrompt: null,

    initPwa() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(reg => {
                        console.log('JVault PWA ServiceWorker active:', reg.scope);
                    })
                    .catch(err => {
                        console.warn('JVault ServiceWorker registration failed:', err);
                    });
            });
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const btn = document.getElementById('btn-install-pwa');
            if (btn) {
                btn.classList.remove('hidden');
                btn.classList.add('inline-flex');
            }
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            const btn = document.getElementById('btn-install-pwa');
            if (btn) btn.classList.add('hidden');
            Toast.success('JVault App installed successfully!');
        });
    },

    async promptPwaInstall() {
        if (!this.deferredPrompt) {
            Toast.info('To install JVault, open your browser menu (⋮ or ⋯) and click "Install app" or "Add to Home screen"');
            return;
        }
        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                Toast.success('Installing JVault App...');
            }
        } catch (e) {
            console.error('Install prompt error:', e);
        }
        this.deferredPrompt = null;
        const btn = document.getElementById('btn-install-pwa');
        if (btn) btn.classList.add('hidden');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
