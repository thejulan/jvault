// Wallets & Dedicated Addresses Page Controller
const Wallets = {
    walletsList: [],
    currentWalletId: null,
    currentAddresses: [],
    balancesHidden: false,
    hiddenCards: JSON.parse(localStorage.getItem('jvault_hidden_wallet_cards') || '{}'),
    cardColors: JSON.parse(localStorage.getItem('jvault_wallet_colors') || '{}'),
    pinnedWallets: JSON.parse(localStorage.getItem('jvault_pinned_wallets') || '{}'),
    pinnedAddresses: JSON.parse(localStorage.getItem('jvault_pinned_addresses') || '{}'),
    addressActiveStates: JSON.parse(localStorage.getItem('jvault_address_active_states') || '{}'),
    addressFilterNetwork: 'ALL',
    addressFilterStatus: 'ALL',
    addressPage: 1,
    addressPerPage: 12,
    shouldAnimateAddresses: true,
    timerInterval: null,
    page: 1,
    perPage: 12,

    cardThemes: {
        'obsidian': {
            id: 'obsidian',
            name: 'Obsidian Onyx',
            bg: 'bg-gradient-to-br from-zinc-900 via-zinc-800 to-black',
            border: 'border-zinc-700/60',
            glowShadow: 'rgba(99, 102, 241, 0.4)',
            glowColor: 'rgba(99, 102, 241, 0.28)',
            accentText: 'text-indigo-400',
            ambientGlow: 'bg-indigo-500/15',
            swatchColor: '#3f3f46'
        },
        'emerald': {
            id: 'emerald',
            name: 'Cyber Emerald',
            bg: 'bg-gradient-to-br from-emerald-950 via-zinc-900 to-teal-950',
            border: 'border-emerald-600/50',
            glowShadow: 'rgba(16, 185, 129, 0.45)',
            glowColor: 'rgba(16, 185, 129, 0.3)',
            accentText: 'text-emerald-400',
            ambientGlow: 'bg-emerald-500/20',
            swatchColor: '#10b981'
        },
        'amethyst': {
            id: 'amethyst',
            name: 'Royal Amethyst',
            bg: 'bg-gradient-to-br from-purple-950 via-zinc-900 to-indigo-950',
            border: 'border-purple-600/50',
            glowShadow: 'rgba(168, 85, 247, 0.45)',
            glowColor: 'rgba(168, 85, 247, 0.3)',
            accentText: 'text-purple-400',
            ambientGlow: 'bg-purple-500/20',
            swatchColor: '#a855f7'
        },
        'amber': {
            id: 'amber',
            name: 'Solar Amber',
            bg: 'bg-gradient-to-br from-amber-950 via-zinc-900 to-stone-900',
            border: 'border-amber-600/50',
            glowShadow: 'rgba(245, 158, 11, 0.45)',
            glowColor: 'rgba(245, 158, 11, 0.3)',
            accentText: 'text-amber-400',
            ambientGlow: 'bg-amber-500/20',
            swatchColor: '#f59e0b'
        },
        'sapphire': {
            id: 'sapphire',
            name: 'Deep Sapphire',
            bg: 'bg-gradient-to-br from-blue-950 via-slate-900 to-cyan-950',
            border: 'border-blue-600/50',
            glowShadow: 'rgba(59, 130, 246, 0.45)',
            glowColor: 'rgba(59, 130, 246, 0.3)',
            accentText: 'text-sky-400',
            ambientGlow: 'bg-sky-500/20',
            swatchColor: '#3b82f6'
        },
        'ruby': {
            id: 'ruby',
            name: 'Crimson Ruby',
            bg: 'bg-gradient-to-br from-rose-950 via-zinc-900 to-red-950',
            border: 'border-rose-600/50',
            glowShadow: 'rgba(244, 63, 94, 0.45)',
            glowColor: 'rgba(244, 63, 94, 0.3)',
            accentText: 'text-rose-400',
            ambientGlow: 'bg-rose-500/20',
            swatchColor: '#f43f5e'
        }
    },

    init() {
        this.balancesHidden = localStorage.getItem('jvault_hide_balances') === 'true';
        this.updateEyeIcons();
        if (API.getToken()) {
            this.loadWallets().catch(() => {});
        }
    },

    toggleHideBalances() {
        this.balancesHidden = !this.balancesHidden;
        localStorage.setItem('jvault_hide_balances', this.balancesHidden ? 'true' : 'false');
        // Override all individual manual card toggles so they follow the global navbar setting
        this.hiddenCards = {};
        localStorage.removeItem('jvault_hidden_wallet_cards');
        this.updateEyeIcons();
        this.renderWallets();
        if (this.currentWalletId) {
            this.renderAddressesPage();
            const balEl = document.getElementById('addr-page-wallet-balance');
            const w = this.walletsList.find(x => x.id === this.currentWalletId);
            if (balEl && w) {
                balEl.textContent = this.formatBalance(w.total_balance_usd);
            }
        }
        if (window.App) {
            App.renderStats();
        }
        Toast.info(this.balancesHidden ? 'Balances hidden' : 'Balances revealed', 1500);
    },

    toggleCardBalance(walletId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        const currentlyHidden = this.hiddenCards[walletId] !== undefined ? this.hiddenCards[walletId] : this.balancesHidden;
        this.hiddenCards[walletId] = !currentlyHidden;
        localStorage.setItem('jvault_hidden_wallet_cards', JSON.stringify(this.hiddenCards));

        const balEl = document.getElementById(`card-balance-${walletId}`);
        const eyeEl = document.getElementById(`card-eye-icon-${walletId}`);
        const w = this.walletsList.find(x => x.id === walletId);
        if (balEl && w) {
            balEl.textContent = this.hiddenCards[walletId] ? '••••••••' : this.formatBalance(w.total_balance_usd, false);
        }
        if (eyeEl) {
            eyeEl.className = this.hiddenCards[walletId] ? 'ph ph-eye-closed text-xs' : 'ph ph-eye text-xs';
        }
    },

    handleCardMouseMove(el, e) {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const px = ((x / rect.width) * 100).toFixed(1);
        const py = ((y / rect.height) * 100).toFixed(1);
        el.style.setProperty('--mouse-x', `${px}%`);
        el.style.setProperty('--mouse-y', `${py}%`);
        
        // Gentle, non-annoying 3D tilt (-6deg to +6deg)
        const tiltX = (((y / rect.height) - 0.5) * -12).toFixed(2);
        const tiltY = (((x / rect.width) - 0.5) * 12).toFixed(2);
        el.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
    },

    handleCardMouseLeave(el, e) {
        el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        el.style.setProperty('--mouse-x', '50%');
        el.style.setProperty('--mouse-y', '50%');
    },

    togglePinWallet(walletId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        this.pinnedWallets[walletId] = !this.pinnedWallets[walletId];
        localStorage.setItem('jvault_pinned_wallets', JSON.stringify(this.pinnedWallets));
        Toast.info(this.pinnedWallets[walletId] ? 'Card pinned to top' : 'Card unpinned', 1400);
        this.renderWallets();
    },

    toggleColorDropdown(walletId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        const dd = document.getElementById(`color-dropdown-${walletId}`);
        const group = document.getElementById(`wallet-actions-${walletId}`);
        const isHidden = !dd || dd.classList.contains('hidden');

        // Close other color dropdowns and remove sticky palette-open
        document.querySelectorAll('[id^="color-dropdown-"]').forEach(d => {
            if (d.id !== `color-dropdown-${walletId}`) d.classList.add('hidden');
        });
        document.querySelectorAll('.wallet-actions-group').forEach(g => {
            if (g.id !== `wallet-actions-${walletId}`) g.classList.remove('palette-open');
        });

        if (isHidden && dd && group) {
            dd.classList.remove('hidden');
            group.classList.add('palette-open');
        } else if (dd && group) {
            dd.classList.add('hidden');
            group.classList.remove('palette-open');
        }
    },

    setWalletColor(walletId, colorId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        this.cardColors[walletId] = colorId;
        localStorage.setItem('jvault_wallet_colors', JSON.stringify(this.cardColors));
        const dd = document.getElementById(`color-dropdown-${walletId}`);
        if (dd) dd.classList.add('hidden');
        const group = document.getElementById(`wallet-actions-${walletId}`);
        if (group) group.classList.remove('palette-open');
        this.renderWallets();
        Toast.success(`Theme updated: ${this.cardThemes[colorId]?.name || colorId}`, 1400);
    },

    updateEyeIcons() {
        document.querySelectorAll('.balance-eye-icon').forEach(icon => {
            icon.className = this.balancesHidden ? 'balance-eye-icon ph ph-eye-closed text-lg' : 'balance-eye-icon ph ph-eye text-lg';
        });
    },

    formatBalance(usdAmount, checkGlobal = true) {
        if (checkGlobal && this.balancesHidden) {
            return '••••••••';
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdAmount || 0);
    },

    async loadWallets(forceFresh = false) {
        try {
            let list = null;
            if (!forceFresh && window._walletsFetchPromise) {
                list = await window._walletsFetchPromise;
                window._walletsFetchPromise = null;
            }
            if (!list) {
                list = await API.get('/api/wallets');
            }
            this.walletsList = Array.isArray(list) ? list : [];
            this.renderWallets();
            return this.walletsList;
        } catch (e) {
            Toast.error('Failed to load wallets');
            throw e;
        }
    },

    renderWallets() {
        const container = document.getElementById('wallets-grid');
        const paginationContainer = document.getElementById('wallets-pagination');
        if (!container) return;

        if (!this.walletsList || this.walletsList.length === 0) {
            container.innerHTML = `
                <div class="col-span-full p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
                    <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-3xl">
                        <i class="ph ph-wallet"></i>
                    </div>
                    <h3 class="text-lg font-bold mb-1">No Wallets Created Yet</h3>
                    <p class="text-sm text-zinc-500 max-w-md mx-auto mb-5">Generate a non-custodial local HD wallet supporting 10+ networks.</p>
                    <button onclick="Wallets.openCreateModal()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm inline-flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all">
                        <i class="ph ph-plus-circle text-lg"></i>
                        <span>Generate Master Wallet</span>
                    </button>
                </div>
            `;
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
                paginationContainer.classList.add('hidden');
            }
            return;
        }

        // Sort: Pinned wallets always appear at the top
        const sortedWallets = [...this.walletsList].sort((a, b) => {
            const aPinned = !!this.pinnedWallets[a.id];
            const bPinned = !!this.pinnedWallets[b.id];
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return 0;
        });

        const totalPages = Math.ceil(sortedWallets.length / this.perPage) || 1;
        if (this.page > totalPages) this.page = totalPages;
        if (this.page < 1) this.page = 1;

        const startIdx = (this.page - 1) * this.perPage;
        const pagedWallets = sortedWallets.slice(startIdx, startIdx + this.perPage);

        container.innerHTML = pagedWallets.map(w => {
            const dateStr = new Date(w.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            const themeId = this.cardColors[w.id] || 'obsidian';
            const theme = this.cardThemes[themeId] || this.cardThemes['obsidian'];
            const isPinned = !!this.pinnedWallets[w.id];
            const isCardHidden = this.hiddenCards[w.id] !== undefined ? this.hiddenCards[w.id] : this.balancesHidden;
            const displayBal = isCardHidden ? '••••••••' : this.formatBalance(w.total_balance_usd, false);

            return `
                <div class="flex flex-col gap-3 group">
                    <!-- Physical Crypto Credit Card with 3D Tilt and Mouse Hover Glow -->
                    <div class="card-perspective-container">
                        <div class="credit-card ${theme.bg} text-white p-6 border ${theme.border} relative overflow-visible flex flex-col justify-between min-h-[225px] cursor-pointer"
                             style="--card-glow-shadow: ${theme.glowShadow}; --card-glow-color: ${theme.glowColor};"
                             onclick="Wallets.openCardCinematicModal('${w.id}')"
                             onmousemove="Wallets.handleCardMouseMove(this, event)"
                             onmouseleave="Wallets.handleCardMouseLeave(this, event)">
                            
                            <!-- Dynamic specular ambient glow & interactive cursor-following glow -->
                            <div class="card-hover-glow"></div>
                            <div class="absolute -right-10 -top-10 w-48 h-48 ${theme.ambientGlow} rounded-full blur-2xl pointer-events-none"></div>

                            <!-- Card Header: Brand, Contactless NFC, Pin, Color, Edit/Delete, & Default badge -->
                            <div class="wallet-card-header flex items-center justify-between relative z-30">
                                <div class="flex items-center gap-2.5">
                                    <div class="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
                                        <i class="ph ph-vault text-base"></i>
                                    </div>
                                    <div>
                                        <span class="text-xs font-extrabold tracking-widest uppercase text-zinc-100">JVAULT</span>
                                        <span class="text-[9px] uppercase tracking-wider ${theme.accentText} block -mt-0.5">COLD TREASURY</span>
                                    </div>
                                </div>

                                <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                                    <!-- Status Badges: Green Default Dot + Pinned Icon (Fades out when settings hovered) -->
                                    <div class="wallet-status-badges flex items-center gap-1.5 transition-all duration-300">
                                        ${isPinned ? `<span class="text-amber-400 p-0.5 shrink-0" data-tooltip="Pinned Wallet"><i class="ph-fill ph-push-pin text-xs"></i></span>` : ''}
                                        ${w.is_default ? `<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 inline-block shrink-0" data-tooltip="Default Primary Balance"></span>` : ''}
                                    </div>

                                    <!-- Seamless Settings Gear & Hover Action Icons (No separate floating box/window) -->
                                    <div id="wallet-actions-${w.id}" class="wallet-actions-group relative flex items-center justify-end">
                                        <!-- Gear Settings Icon (fades out on hover or when color palette sticky open) -->
                                        <button class="wallet-gear-trigger p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer" data-tooltip="Wallet Settings">
                                            <i class="ph ph-gear text-sm"></i>
                                        </button>

                                        <!-- Actions revealed next to/in place of gear with fade animation -->
                                        <div class="wallet-action-buttons flex items-center gap-1">
                                            <!-- Pin / Unpin Button -->
                                            <button onclick="Wallets.togglePinWallet('${w.id}', event)" class="btn-pin-wallet p-1 rounded-lg ${isPinned ? 'text-amber-400 bg-amber-500/20' : 'text-white/70 hover:text-amber-400 hover:bg-white/10'} transition-colors" data-tooltip="${isPinned ? 'Unpin Card' : 'Pin Card to Top'}">
                                                <i class="${isPinned ? 'ph-fill ph-push-pin' : 'ph ph-push-pin'} text-sm"></i>
                                            </button>

                                            <!-- Color Swatch Dropdown (Horizontal from left to right, sticky on click) -->
                                            <div class="relative inline-block" onclick="event.stopPropagation()">
                                                <button onclick="Wallets.toggleColorDropdown('${w.id}', event)" class="btn-color-palette p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" data-tooltip="Change Card Color">
                                                    <i class="ph ph-palette text-sm"></i>
                                                </button>
                                                <div id="color-dropdown-${w.id}" class="color-palette-menu hidden absolute right-0 top-full mt-2 p-1.5 bg-zinc-950/95 dark:bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl z-50 backdrop-blur-md flex items-center gap-1.5">
                                                    ${Object.values(this.cardThemes).map(th => `
                                                        <button data-theme="${th.id}" onclick="Wallets.setWalletColor('${w.id}', '${th.id}', event)" class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 shrink-0 ${themeId === th.id ? 'border-white scale-110 shadow-sm' : 'border-white/30 hover:border-white/70'}" style="background-color: ${th.swatchColor}" data-tooltip="${th.name}">
                                                        </button>
                                                    `).join('')}
                                                </div>
                                            </div>

                                            <button onclick="Wallets.openEditModal('${w.id}')" class="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" data-tooltip="Edit Wallet">
                                                <i class="ph ph-pencil-simple text-sm"></i>
                                            </button>
                                            <button onclick="Wallets.openDeleteModal('${w.id}')" class="p-1 rounded-lg text-white/70 hover:text-rose-400 hover:bg-rose-500/20 transition-colors" data-tooltip="Delete Wallet">
                                                <i class="ph ph-trash text-sm"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Contactless Wave Symbol -->
                                    <svg class="w-5 h-5 text-zinc-400 shrink-0 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8.5 16.5a5 5 0 0 1 0-7"/><path d="M12 19a8.5 8.5 0 0 0 0-14"/><path d="M15.5 21.5a12 12 0 0 0 0-19"/></svg>
                                </div>
                            </div>

                            <!-- Card Middle: Golden EMV Chip & Embossed Card Number -->
                            <div class="my-4 flex items-center justify-between relative z-10">
                                <div class="emv-chip">
                                    <div class="emv-chip-lines"></div>
                                </div>
                                <div class="font-mono text-xs tracking-widest text-zinc-300 card-embossed font-semibold">
                                    •••• &nbsp; •••• &nbsp; •••• &nbsp; <span class="text-white">${w.id.slice(-4).toUpperCase()}</span>
                                </div>
                            </div>

                            <!-- Card Bottom: Balance & Cardholder Details -->
                            <div class="relative z-10 pt-2 border-t border-white/10 flex items-end justify-between">
                                <div>
                                    <span class="text-[9px] uppercase font-bold tracking-widest text-zinc-400 block">CARDHOLDER / VAULT</span>
                                    <span class="text-xs font-bold uppercase tracking-wider text-zinc-100 card-label-embossed truncate max-w-[170px] block">${w.name}</span>
                                    <span class="text-[9px] font-mono text-zinc-400 block mt-0.5">${(typeof w.addresses_count === 'number' ? w.addresses_count : (Array.isArray(w.addresses) ? w.addresses.length : 0))} CHAINS ACTIVE</span>
                                </div>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-1.5" onclick="event.stopPropagation()">
                                        <span class="text-[9px] uppercase font-bold tracking-widest text-zinc-400">TREASURY BALANCE</span>
                                        <button onclick="Wallets.toggleCardBalance('${w.id}', event)" class="btn-toggle-card-eye text-zinc-400 hover:text-white transition-colors" data-tooltip="Toggle Card Visibility">
                                            <i id="card-eye-icon-${w.id}" class="${isCardHidden ? 'ph ph-eye-closed' : 'ph ph-eye'} text-xs"></i>
                                        </button>
                                    </div>
                                    <div id="card-balance-${w.id}" class="text-lg font-extrabold font-mono text-white tracking-tight card-embossed">
                                        ${displayBal}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Actions Below Card -->
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="Wallets.openAddressesPage('${w.id}')" class="px-2 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1 shadow-sm transition-all" data-tooltip="Manage Addresses">
                            <i class="ph ph-identification-card text-base text-indigo-500"></i>
                            <span class="truncate">Addresses</span>
                        </button>
                        <button onclick="Wallets.openWithdrawModal('${w.id}')" class="px-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center justify-center gap-1 shadow-md shadow-purple-500/20 transition-all" data-tooltip="Send / Withdraw Funds">
                            <i class="ph ph-paper-plane-tilt text-base text-purple-200"></i>
                            <span class="truncate">Send</span>
                        </button>
                        <button onclick="FastReceive.openModal('${w.id}')" class="px-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1 shadow-md shadow-indigo-500/25 transition-all" data-tooltip="Fast Receive Link">
                            <i class="ph ph-arrow-down-left text-base"></i>
                            <span class="truncate">Receive</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.renderPagination(totalPages);
    },

    async openCardCinematicModal(walletId) {
        const w = this.walletsList.find(x => x.id === walletId);
        if (!w) return;

        const themeId = this.cardColors[w.id] || 'obsidian';
        const theme = this.cardThemes[themeId] || this.cardThemes['obsidian'];
        const isPinned = !!this.pinnedWallets[w.id];

        document.getElementById('cinematic-wallet-name').textContent = w.name;
        document.getElementById('cinematic-card-label').textContent = w.name;
        document.getElementById('cinematic-card-id').innerHTML = `•••• &nbsp; •••• &nbsp; •••• &nbsp; <span class="text-white">${w.id.slice(-4).toUpperCase()}</span>`;
        const initialChainCount = typeof w.addresses_count === 'number' ? w.addresses_count : 0;
        document.getElementById('cinematic-card-chains').textContent = `${initialChainCount} ${initialChainCount === 1 ? 'CHAIN' : 'CHAINS'} ACTIVE`;
        document.getElementById('cinematic-card-balance').textContent = this.formatBalance(w.total_balance_usd, false);

        const heroCard = document.getElementById('cinematic-hero-card');
        if (heroCard) {
            heroCard.className = `hero-credit-card max-w-md mx-auto p-7 text-white border ${theme.border} ${theme.bg} relative flex flex-col justify-between min-h-[240px]`;
            heroCard.style.setProperty('--card-glow-shadow', theme.glowShadow);
            heroCard.style.setProperty('--card-glow-color', theme.glowColor);
        }

        const heroGlow = document.getElementById('cinematic-hero-glow');
        if (heroGlow) {
            heroGlow.className = `absolute -right-10 -top-10 w-52 h-52 rounded-full blur-3xl pointer-events-none opacity-40 ${theme.ambientGlow}`;
        }

        const defBadge = document.getElementById('cinematic-default-badge');
        if (defBadge) {
            if (w.is_default) defBadge.classList.remove('hidden');
            else defBadge.classList.add('hidden');
        }

        const pinBadge = document.getElementById('cinematic-pinned-badge');
        if (pinBadge) {
            if (isPinned) pinBadge.classList.remove('hidden');
            else pinBadge.classList.add('hidden');
        }

        // Action buttons
        document.getElementById('cinematic-btn-addresses').onclick = () => {
            UI.closeModal('modal-wallet-cinematic');
            this.openAddressesPage(w.id);
        };
        document.getElementById('cinematic-btn-send').onclick = () => {
            UI.closeModal('modal-wallet-cinematic');
            this.openWithdrawModal(w.id);
        };
        document.getElementById('cinematic-btn-receive').onclick = () => {
            UI.closeModal('modal-wallet-cinematic');
            FastReceive.openModal(w.id);
        };

        UI.openModal('modal-wallet-cinematic');

        // Fetch wallet addresses and activity logs
        const logsList = document.getElementById('cinematic-wallet-logs-list');
        const addrsList = document.getElementById('cinematic-addrs-list');
        logsList.innerHTML = `<div class="p-4 text-center text-zinc-500"><i class="ph ph-spinner animate-spin"></i> Loading activity logs...</div>`;
        addrsList.innerHTML = `<div class="p-4 text-center text-zinc-500"><i class="ph ph-spinner animate-spin"></i> Loading addresses...</div>`;

        try {
            const [addrs, payments, withdrawals] = await Promise.all([
                API.get(`/api/wallets/${w.id}/addresses`).catch(() => []),
                API.get('/api/payments?status=ALL').catch(() => []),
                API.get(`/api/wallets/withdrawals?wallet_id=${w.id}`).catch(() => [])
            ]);

            document.getElementById('cinematic-card-chains').textContent = `${addrs.length} ${addrs.length === 1 ? 'CHAIN' : 'CHAINS'} ACTIVE`;
            document.getElementById('cinematic-addrs-count').textContent = `${addrs.length} Active Chains`;
            
            // Render addresses
            if (addrs.length === 0) {
                addrsList.innerHTML = `<div class="p-4 text-center text-zinc-500 text-xs">No addresses generated yet</div>`;
            } else {
                addrsList.innerHTML = addrs.map(a => `
                    <div class="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
                        <div class="flex items-center gap-2.5 truncate">
                            ${CryptoIcons.get(a.network_id, 24)}
                            <div class="truncate">
                                <span class="font-bold text-zinc-900 dark:text-zinc-200 block">${a.label || a.network_id.toUpperCase()}</span>
                                <span class="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate block select-all">${a.address}</span>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">${a.balance || 0}</span>
                            <span class="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">${this.formatBalance(a.balance_usd, false)}</span>
                        </div>
                    </div>
                `).join('');
            }

            // Combine payments and withdrawals for this wallet
            const walletAddrsSet = new Set(addrs.map(a => (a.address || '').toLowerCase()));
            const relatedPayments = (Array.isArray(payments) ? payments : []).filter(p => walletAddrsSet.has((p.address || '').toLowerCase()));
            const relatedWithdrawals = Array.isArray(withdrawals) ? withdrawals : [];

            const logs = [
                {
                    time: w.created_at,
                    badge: 'KEYSTORE INITIALIZED',
                    badgeClass: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/30',
                    desc: `Master BIP-44 root seed derived with AES-256-GCM encryption. ${addrs.length} network addresses generated.`
                },
                ...relatedWithdrawals.map(wdr => ({
                    time: wdr.created_at,
                    badge: `WITHDRAWAL: ${wdr.status}`,
                    badgeClass: wdr.status === 'CONFIRMED' || wdr.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
                    desc: `Sent ${wdr.amount} ${wdr.token_symbol} to ${wdr.destination_address.slice(0, 10)}...${wdr.destination_address.slice(-6)} (${wdr.chain_hops_count || 1} hops).`
                })),
                ...relatedPayments.map(p => ({
                    time: p.created_at,
                    badge: `INCOMING: ${p.status}`,
                    badgeClass: p.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
                    desc: `Received ${p.amount} ${p.currency} on ${p.network_name}. Tx: ${(p.tx_hash || 'Pending').slice(0, 12)}...`
                }))
            ].sort((a, b) => new Date(b.time) - new Date(a.time));

            document.getElementById('cinematic-log-count').textContent = `${logs.length} Events`;

            logsList.innerHTML = logs.map(l => `
                <div class="py-2.5 flex flex-col gap-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold ${l.badgeClass}">${l.badge}</span>
                        <span class="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">${new Date(l.time).toLocaleString()}</span>
                    </div>
                    <p class="text-zinc-700 dark:text-zinc-300 text-[11px] leading-relaxed">${l.desc}</p>
                </div>
            `).join('');

        } catch (e) {
            console.error(e);
            logsList.innerHTML = `<div class="p-3 text-center text-zinc-500 text-xs">Could not load additional activity logs.</div>`;
        }
    },

    generatePageButtons(currentPage, totalPages, callbackName) {
        if (totalPages <= 1) return '';
        let pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 4) {
                pages = [1, 2, 3, 4, 5, '...', totalPages];
            } else if (currentPage >= totalPages - 3) {
                pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
            }
        }
        return pages.map(p => {
            if (p === '...') {
                return `<span class="w-7 h-8 flex items-center justify-center text-xs text-zinc-400 font-bold select-none">&hellip;</span>`;
            }
            if (p === currentPage) {
                return `<button class="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md shadow-indigo-500/25 transition-all cursor-default">${p}</button>`;
            }
            return `<button onclick="${callbackName}(${p})" class="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer">${p}</button>`;
        }).join('');
    },

    renderPagination(totalPages) {
        const container = document.getElementById('wallets-pagination');
        if (!container) return;

        if (this.walletsList.length <= this.perPage) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const startIdx = (this.page - 1) * this.perPage + 1;
        const endIdx = Math.min(this.page * this.perPage, this.walletsList.length);
        const pageBtns = this.generatePageButtons(this.page, totalPages, 'Wallets.setPage');

        container.innerHTML = `
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
                Showing <span class="font-semibold text-zinc-800 dark:text-zinc-200">${startIdx}</span> to <span class="font-semibold text-zinc-800 dark:text-zinc-200">${endIdx}</span> of <span class="font-semibold text-zinc-800 dark:text-zinc-200">${this.walletsList.length}</span> wallets
            </div>
            <div class="flex items-center gap-1.5 sm:gap-2">
                <button onclick="Wallets.setPage(${this.page - 1})" ${this.page <= 1 ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <i class="ph ph-caret-left"></i> <span class="hidden sm:inline">Prev</span>
                </button>
                <div class="flex items-center gap-1">
                    ${pageBtns}
                </div>
                <button onclick="Wallets.setPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <span class="hidden sm:inline">Next</span> <i class="ph ph-caret-right"></i>
                </button>
            </div>
        `;
    },

    setPage(p) {
        this.page = p;
        this.renderWallets();
    },

    openEditModal(walletId) {
        const w = this.walletsList.find(item => item.id === walletId);
        if (!w) return;
        document.getElementById('edit-wallet-id').value = w.id;
        document.getElementById('edit-wallet-name').value = w.name;
        document.getElementById('edit-wallet-default').checked = !!w.is_default;
        UI.openModal('modal-edit-wallet');
    },

    async submitEditWallet() {
        const walletId = document.getElementById('edit-wallet-id').value;
        const name = document.getElementById('edit-wallet-name').value.trim();
        const isDefault = document.getElementById('edit-wallet-default').checked;
        if (!name) {
            Toast.warning('Wallet name cannot be empty');
            return;
        }
        const btn = document.getElementById('btn-submit-edit-wallet');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Saving...';
        try {
            await API.put(`/api/wallets/${walletId}`, { name, is_default: isDefault });
            Toast.success('Wallet updated successfully');
            UI.closeModal('modal-edit-wallet');
            await this.loadWallets();
            if (window.App) App.renderStats();
        } catch (err) {
            Toast.error(err.message || 'Failed to update wallet');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        }
    },

    deleteWalletExpectedSegment: '',
    deleteAddressExpectedSegment: '',

    setupOtpInputs(containerId, onValidate) {
        if (window.UI && typeof UI.setupOtpInputs === 'function') {
            UI.setupOtpInputs(containerId, onValidate);
        }
    },

    openDeleteModal(walletId) {
        const w = this.walletsList.find(item => item.id === walletId);
        if (!w) return;
        document.getElementById('delete-wallet-id').value = w.id;
        document.getElementById('delete-wallet-name').textContent = w.name;

        const last4 = (w.id || '').slice(-4);
        const last4El = document.getElementById('delete-wallet-last4');
        if (last4El) last4El.textContent = last4;

        // Strictly require LAST 4 characters
        this.deleteWalletExpectedSegment = last4;
        const targetLabel = document.getElementById('delete-wallet-target-label');
        if (targetLabel) targetLabel.textContent = 'LAST 4';

        // Clear OTP inputs and setup listeners
        UI.clearOtpInputs('delete-wallet-otp-container');
        this.setupOtpInputs('delete-wallet-otp-container', () => this.validateDeleteWalletConfirm());

        const btn = document.getElementById('btn-submit-delete-wallet');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-40', 'cursor-not-allowed');
        }

        UI.openModal('modal-delete-wallet');
        const inputs = Array.from(document.querySelectorAll('#delete-wallet-otp-container input'));
        setTimeout(() => { if (inputs[0]) inputs[0].focus(); }, 120);
    },

    validateDeleteWalletConfirm() {
        const inputs = Array.from(document.querySelectorAll('#delete-wallet-otp-container input'));
        const entered = inputs.map(i => i.value.trim()).join('').toUpperCase();
        const expected = (this.deleteWalletExpectedSegment || '').toUpperCase();
        const btn = document.getElementById('btn-submit-delete-wallet');
        if (!btn) return;

        if (entered.length === 4 && entered === expected) {
            btn.disabled = false;
            btn.classList.remove('opacity-40', 'cursor-not-allowed');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-40', 'cursor-not-allowed');
        }
    },

    async submitDeleteWallet() {
        const walletId = document.getElementById('delete-wallet-id').value;
        const btn = document.getElementById('btn-submit-delete-wallet');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Deleting...';
        try {
            await API.delete(`/api/wallets/${walletId}`);
            Toast.success('Wallet deleted successfully');
            UI.closeModal('modal-delete-wallet');
            await this.loadWallets();
            if (window.App) {
                App.loadStats();
                Payments.loadPayments();
            }
        } catch (err) {
            Toast.error(err.message || 'Failed to delete wallet');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Delete Wallet';
        }
    },

    openCreateModal() {
        document.getElementById('wallet-name-input').value = 'Balance Vault #' + (this.walletsList.length + 1);
        document.getElementById('wallet-mnemonic-input').value = '';
        document.getElementById('wallet-create-result').classList.add('hidden');
        document.getElementById('wallet-create-form').classList.remove('hidden');
        const footer = document.getElementById('wallet-create-result-footer');
        if (footer) footer.classList.add('hidden');

        // Custom Dropdown for words count
        CustomDropdown.create('wallet-words-count-container', [
            { value: '12', label: '12 Words (BIP39 Standard)', iconHtml: '<i class="ph ph-key text-base text-indigo-500"></i>' },
            { value: '24', label: '24 Words (High Security)', iconHtml: '<i class="ph ph-shield-check text-base text-purple-500"></i>' }
        ], '12');

        UI.openModal('modal-create-wallet');
    },

    async submitCreateWallet() {
        const name = document.getElementById('wallet-name-input').value.trim();
        const mnemonic = document.getElementById('wallet-mnemonic-input').value.trim();
        const words_count = parseInt(CustomDropdown.getValue('wallet-words-count-container') || '12', 10);
        const submitBtn = document.getElementById('btn-submit-wallet');

        if (!name) {
            Toast.warning('Please enter a wallet name');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Generating...`;

            const autoGenerate = document.getElementById('wallet-auto-generate-addresses') ? document.getElementById('wallet-auto-generate-addresses').checked : true;

            const res = await API.post('/api/wallets/generate', {
                name,
                mnemonic: mnemonic || null,
                words_count,
                auto_generate_addresses: autoGenerate
            });

            Toast.success(autoGenerate ? 'Wallet generated with 10 network addresses!' : 'Wallet generated successfully!');

            document.getElementById('wallet-create-form').classList.add('hidden');
            const resultBox = document.getElementById('wallet-create-result');
            resultBox.classList.remove('hidden');

            const footer = document.getElementById('wallet-create-result-footer');
            if (footer) footer.classList.remove('hidden');

            const words = (res.mnemonic || '').split(' ');
            document.getElementById('mnemonic-words-grid').innerHTML = words.map((w, idx) => `
                <div class="flex items-center gap-1.5 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">
                    <span class="text-zinc-400 select-none">${idx + 1}.</span>
                    <span class="font-semibold text-zinc-900 dark:text-zinc-100">${w}</span>
                </div>
            `).join('');

            document.getElementById('btn-copy-mnemonic').onclick = () => {
                navigator.clipboard.writeText(res.mnemonic);
                Toast.success('Seed phrase copied to clipboard!');
            };

            await this.loadWallets();
            if (window.App) App.loadAllData();
        } catch (err) {
            Toast.error(err.message || 'Failed to create wallet');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Generate Wallet</span> <i class="ph ph-sparkle text-base"></i>`;
        }
    },

    // ==================== DEDICATED ADDRESSES PAGE ====================

    async openAddressesPage(walletId) {
        this.currentWalletId = walletId;
        this.shouldAnimateAddresses = true;
        localStorage.setItem('jvault_active_tab', 'addresses');
        localStorage.setItem('jvault_active_wallet', walletId);
        if (window.App) {
            App.navigateTo(`addresses?walletId=${walletId}`);
        } else {
            window.location.hash = `#addresses?walletId=${walletId}`;
            await this.loadAddressesData();
        }
    },

    async loadAddressesData(isBackground = false) {
        if (!this.currentWalletId) return;

        if (!isBackground) {
            this.shouldAnimateAddresses = true;
        }

        try {
            const [w, addrs] = await Promise.all([
                API.get(`/api/wallets/${this.currentWalletId}`),
                API.get(`/api/wallets/${this.currentWalletId}/addresses`)
            ]);

            document.getElementById('addr-page-wallet-name').textContent = w.name;
            document.getElementById('addr-page-wallet-balance').textContent = this.formatBalance(w.total_balance_usd);

            this.currentAddresses = addrs;
            this.renderAddressesPage();

            // Start countdown ticker for temporary addresses
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => this.tickTemporaryTimers(), 1000);
        } catch (e) {
            Toast.error('Failed to load wallet addresses');
            throw e;
        }
    },

    pendingDeriveWalletId: null,
    pendingDeriveCallback: null,

    tokenNetworkMatrix: {
        'USDT': {
            label: 'USDT (Tether USD)',
            icon: 'usdt',
            subtext: '7 Supported Networks',
            networks: [
                { value: 'tron', label: 'TRON Network (TRC20)', icon: 'trx', subtext: 'Fee: ~$1.60 • Instant (1m)' },
                { value: 'bsc', label: 'BNB Smart Chain (BEP20)', icon: 'bnb', subtext: 'Fee: ~$0.08 • 30 sec' },
                { value: 'polygon', label: 'Polygon PoS (MATIC)', icon: 'matic', subtext: 'Fee: ~$0.03 • 1 min' },
                { value: 'solana', label: 'Solana (SPL)', icon: 'sol', subtext: 'Fee: <$0.01 • 10 sec' },
                { value: 'arbitrum', label: 'Arbitrum One (L2)', icon: 'arb', subtext: 'Fee: ~$0.12 • 15 sec' },
                { value: 'ton', label: 'The Open Network (TON Jetton)', icon: 'ton', subtext: 'Fee: ~$0.05 • 20 sec' },
                { value: 'ethereum', label: 'Ethereum (ERC20)', icon: 'eth', subtext: 'Fee: ~$3.50 • 2-3 min' }
            ]
        },
        'USDC': {
            label: 'USDC (USD Coin)',
            icon: 'usdc',
            subtext: '5 Supported Networks',
            networks: [
                { value: 'polygon', label: 'Polygon PoS (MATIC)', icon: 'matic', subtext: 'Fee: ~$0.03 • 1 min' },
                { value: 'solana', label: 'Solana (SPL)', icon: 'sol', subtext: 'Fee: <$0.01 • 10 sec' },
                { value: 'bsc', label: 'BNB Smart Chain (BEP20)', icon: 'bnb', subtext: 'Fee: ~$0.08 • 30 sec' },
                { value: 'arbitrum', label: 'Arbitrum One (L2)', icon: 'arb', subtext: 'Fee: ~$0.12 • 15 sec' },
                { value: 'ethereum', label: 'Ethereum (ERC20)', icon: 'eth', subtext: 'Fee: ~$3.50 • 2-3 min' }
            ]
        },
        'BTC': {
            label: 'BTC (Bitcoin)',
            icon: 'btc',
            subtext: 'Native SegWit (bc1q)',
            networks: [
                { value: 'bitcoin', label: 'Bitcoin (Native SegWit)', icon: 'btc', subtext: 'Fee: ~$1.45 • 10-20 min' }
            ]
        },
        'ETH': {
            label: 'ETH (Ethereum)',
            icon: 'eth',
            subtext: '2 Supported Networks',
            networks: [
                { value: 'ethereum', label: 'Ethereum Mainnet', icon: 'eth', subtext: 'Fee: ~$2.80 • 2-4 min' },
                { value: 'arbitrum', label: 'Arbitrum One (L2)', icon: 'arb', subtext: 'Fee: ~$0.12 • 15 sec' }
            ]
        },
        'SOL': {
            label: 'SOL (Solana)',
            icon: 'sol',
            subtext: 'High-speed SPL Network',
            networks: [
                { value: 'solana', label: 'Solana Mainnet (SPL)', icon: 'sol', subtext: 'Fee: <$0.01 • 5 sec' }
            ]
        },
        'TRX': {
            label: 'TRX (TRON)',
            icon: 'trx',
            subtext: 'TRON Mainnet Native',
            networks: [
                { value: 'tron', label: 'TRON Mainnet', icon: 'trx', subtext: 'Fee: ~$0.18 • 1 min' }
            ]
        },
        'BNB': {
            label: 'BNB (BNB Chain)',
            icon: 'bnb',
            subtext: 'BNB Smart Chain BEP20',
            networks: [
                { value: 'bsc', label: 'BNB Smart Chain (BEP20)', icon: 'bnb', subtext: 'Fee: ~$0.08 • 30 sec' }
            ]
        },
        'TON': {
            label: 'TON (The Open Network)',
            icon: 'ton',
            subtext: 'Telegram TON Ecosystem',
            networks: [
                { value: 'ton', label: 'The Open Network', icon: 'ton', subtext: 'Fee: ~$0.05 • 20 sec' }
            ]
        },
        'LTC': {
            label: 'LTC (Litecoin)',
            icon: 'ltc',
            subtext: 'Litecoin Native SegWit',
            networks: [
                { value: 'litecoin', label: 'Litecoin (Native SegWit)', icon: 'ltc', subtext: 'Fee: <$0.01 • 2-5 min' }
            ]
        },
        'DOGE': {
            label: 'DOGE (Dogecoin)',
            icon: 'doge',
            subtext: 'Dogecoin Mainnet Native',
            networks: [
                { value: 'dogecoin', label: 'Dogecoin Mainnet', icon: 'doge', subtext: 'Fee: <$0.01 • 5-10 min' }
            ]
        }
    },

    openGenerateAddressModal(targetWalletId = null, callback = null, defaultToken = 'USDT') {
        this.pendingDeriveWalletId = targetWalletId || this.currentWalletId;
        this.pendingDeriveCallback = callback;

        // 1. Token Selector
        const tokenOptions = Object.keys(this.tokenNetworkMatrix).map(sym => ({
            value: sym,
            label: this.tokenNetworkMatrix[sym].label,
            icon: this.tokenNetworkMatrix[sym].icon,
            subtext: this.tokenNetworkMatrix[sym].subtext
        }));

        const selectedToken = defaultToken || 'USDT';
        CustomDropdown.create('modal-addr-token-container', tokenOptions, selectedToken, (chosenToken) => {
            this.onDeriveTokenChanged(chosenToken);
        });

        // 2. Populate available networks for chosen token
        this.onDeriveTokenChanged(selectedToken);

        // 3. Disposal Time duration selector inside modal
        CustomDropdown.create('modal-addr-duration-container', [
            { value: '0', label: 'Permanent Static Address (No Auto-delete)', iconHtml: '<i class="ph ph-infinity text-base text-emerald-500"></i>' },
            { value: '15', label: '15 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '30', label: '30 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '45', label: '45 Minutes (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '60', label: '1 Hour (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' },
            { value: '1440', label: '24 Hours (Auto-deletes when expired)', iconHtml: '<i class="ph ph-timer text-base text-amber-500"></i>' }
        ], '0');

        const labelInput = document.getElementById('modal-page-derive-label');
        if (labelInput) labelInput.value = '';

        UI.openModal('modal-generate-address');
    },

    onDeriveTokenChanged(tokenSymbol) {
        const tokenConfig = this.tokenNetworkMatrix[tokenSymbol] || this.tokenNetworkMatrix['USDT'];
        const netOptions = tokenConfig.networks;
        const defaultNet = netOptions[0] ? netOptions[0].value : 'tron';

        CustomDropdown.create('modal-addr-derive-network-container', netOptions, defaultNet);
    },

    async submitGenerateAddressModal() {
        const netId = CustomDropdown.getValue('modal-addr-derive-network-container') || 'tron';
        const durationMin = parseInt(CustomDropdown.getValue('modal-addr-duration-container') || '0', 10);
        const labelInput = document.getElementById('modal-page-derive-label');
        const label = labelInput ? labelInput.value.trim() : '';
        const btn = document.getElementById('btn-modal-derive-addr');
        const walletIdToUse = this.pendingDeriveWalletId || this.currentWalletId;

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Generating...`;
            }

            const created = await API.post(`/api/wallets/${walletIdToUse}/addresses`, {
                network_id: netId,
                label: label || null,
                is_temporary: durationMin > 0,
                duration_minutes: durationMin
            });

            UI.closeModal('modal-generate-address');
            Toast.success('New address generated successfully!');
            if (this.currentWalletId) {
                await this.loadAddressesData();
            }
            await this.loadWallets();

            if (typeof this.pendingDeriveCallback === 'function') {
                this.pendingDeriveCallback(created);
                this.pendingDeriveCallback = null;
            }
        } catch (err) {
            Toast.error(err.message || 'Failed to generate address');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="ph ph-plus-circle text-base"></i> <span>Generate Address</span>`;
            }
        }
    },

    togglePinAddress(addrId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        this.pinnedAddresses[addrId] = !this.pinnedAddresses[addrId];
        localStorage.setItem('jvault_pinned_addresses', JSON.stringify(this.pinnedAddresses));
        Toast.info(this.pinnedAddresses[addrId] ? 'Address pinned to top' : 'Address unpinned', 1400);
        this.renderAddressesPage();
    },

    toggleActivateAddress(addrId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        const currentStatus = this.getAddressStatus(addrId);
        if (currentStatus === 'EXPIRED') {
            Toast.warning('Cannot activate an expired address', 2000);
            return;
        }
        const isNowActive = currentStatus !== 'ACTIVE';
        this.addressActiveStates[addrId] = isNowActive;
        localStorage.setItem('jvault_address_active_states', JSON.stringify(this.addressActiveStates));
        Toast.info(isNowActive ? 'Address marked ACTIVE' : 'Address marked INACTIVE', 1400);
        this.renderAddressesPage();
    },

    getAddressStatus(addr) {
        const addrId = typeof addr === 'object' ? addr.id : addr;
        const addrObj = typeof addr === 'object' ? addr : (this.currentAddresses || []).find(a => a.id === addrId);
        if (addrObj && (addrObj.status === 'EXPIRED' || (addrObj.is_temporary && addrObj.remaining_seconds <= 0))) {
            return 'EXPIRED';
        }
        if (this.addressActiveStates[addrId] === false) {
            return 'INACTIVE';
        }
        return 'ACTIVE';
    },

    filterAddressesByStatus(status) {
        this.addressFilterStatus = status;
        this.addressPage = 1;
        this.shouldAnimateAddresses = true;

        const activeColors = {
            'ALL': 'bg-indigo-600 text-white shadow-sm',
            'ACTIVE': 'bg-emerald-600 text-white shadow-sm',
            'INACTIVE': 'bg-zinc-700 text-white shadow-sm',
            'EXPIRED': 'bg-rose-600 text-white shadow-sm'
        };

        document.querySelectorAll('.addr-status-btn').forEach(b => {
            const btnStatus = b.getAttribute('data-status');
            if (btnStatus === status) {
                const colorClass = activeColors[status] || 'bg-indigo-600 text-white shadow-sm';
                b.className = `addr-status-btn px-3 py-1.5 rounded-lg text-xs font-semibold ${colorClass} transition-all flex items-center gap-1.5 cursor-pointer`;
            } else {
                b.className = 'addr-status-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer';
            }
        });
        this.renderAddressesPage();
    },

    filterAddressesByNetwork(netId) {
        this.addressFilterNetwork = netId;
        this.addressPage = 1;
        this.shouldAnimateAddresses = true;
        document.querySelectorAll('.addr-filter-btn').forEach(b => {
            if (b.getAttribute('data-net') === netId) {
                b.className = 'addr-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 transition-all';
            } else {
                b.className = 'addr-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all';
            }
        });
        this.renderAddressesPage();
    },

    setAddressPage(p) {
        this.addressPage = p;
        this.shouldAnimateAddresses = true;
        this.renderAddressesPage();
    },

    handleAddressCardMouseMove(el, e) {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const px = ((x / rect.width) * 100).toFixed(1);
        const py = ((y / rect.height) * 100).toFixed(1);
        el.style.setProperty('--mouse-x', `${px}%`);
        el.style.setProperty('--mouse-y', `${py}%`);
        
        // Gentle 3D tilt (-10deg to +10deg)
        const tiltX = (((y / rect.height) - 0.5) * -10).toFixed(2);
        const tiltY = (((x / rect.width) - 0.5) * 10).toFixed(2);
        el.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
    },

    handleAddressCardMouseLeave(el, e) {
        el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        el.style.setProperty('--mouse-x', '50%');
        el.style.setProperty('--mouse-y', '50%');
    },

    renderAddressPagination(totalPages, totalItems) {
        const container = document.getElementById('addresses-pagination');
        if (!container) return;

        if (totalItems <= this.addressPerPage) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const startIdx = (this.addressPage - 1) * this.addressPerPage + 1;
        const endIdx = Math.min(this.addressPage * this.addressPerPage, totalItems);
        const pageBtns = this.generatePageButtons(this.addressPage, totalPages, 'Wallets.setAddressPage');

        container.innerHTML = `
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
                Showing <span class="font-semibold text-zinc-800 dark:text-zinc-200">${startIdx}</span> to <span class="font-semibold text-zinc-800 dark:text-zinc-200">${endIdx}</span> of <span class="font-semibold text-zinc-800 dark:text-zinc-200">${totalItems}</span> addresses
            </div>
            <div class="flex items-center gap-1.5 sm:gap-2">
                <button onclick="Wallets.setAddressPage(${this.addressPage - 1})" ${this.addressPage <= 1 ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <i class="ph ph-caret-left"></i> <span class="hidden sm:inline">Prev</span>
                </button>
                <div class="flex items-center gap-1">
                    ${pageBtns}
                </div>
                <button onclick="Wallets.setAddressPage(${this.addressPage + 1})" ${this.addressPage >= totalPages ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <span class="hidden sm:inline">Next</span> <i class="ph ph-caret-right"></i>
                </button>
            </div>
        `;
    },

    renderAddressesPage() {
        const grid = document.getElementById('addresses-cards-grid');
        const paginationContainer = document.getElementById('addresses-pagination');
        if (!grid) return;

        let filtered = [...(this.currentAddresses || [])];

        // 1. Network Filter
        if (this.addressFilterNetwork && this.addressFilterNetwork !== 'ALL') {
            filtered = filtered.filter(a => a.network_id === this.addressFilterNetwork);
        }

        // 2. Status Filter
        if (this.addressFilterStatus && this.addressFilterStatus !== 'ALL') {
            filtered = filtered.filter(a => this.getAddressStatus(a) === this.addressFilterStatus);
        }

        // 3. Sort Pinned Addresses First
        filtered.sort((a, b) => {
            const aPinned = !!this.pinnedAddresses[a.id];
            const bPinned = !!this.pinnedAddresses[b.id];
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return 0;
        });

        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / this.addressPerPage) || 1;
        if (this.addressPage > totalPages) this.addressPage = totalPages;
        if (this.addressPage < 1) this.addressPage = 1;

        if (totalItems === 0) {
            grid.innerHTML = `<div class="col-span-full p-12 text-center text-zinc-400">No addresses derived for this filter.</div>`;
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
                paginationContainer.classList.add('hidden');
            }
            return;
        }

        // 4. Client-side Pagination Slice
        const startIdx = (this.addressPage - 1) * this.addressPerPage;
        const paged = filtered.slice(startIdx, startIdx + this.addressPerPage);
        this.renderAddressPagination(totalPages, totalItems);

        const netThemes = {
            bitcoin: { bg: 'from-amber-950/70 via-zinc-900 to-black', border: 'border-amber-500/30', accent: 'text-amber-400', glowShadow: 'rgba(245, 158, 11, 0.4)', glowColor: 'rgba(245, 158, 11, 0.3)' },
            ethereum: { bg: 'from-slate-900 via-indigo-950/60 to-zinc-950', border: 'border-indigo-500/30', accent: 'text-indigo-400', glowShadow: 'rgba(99, 102, 241, 0.45)', glowColor: 'rgba(99, 102, 241, 0.3)' },
            tron: { bg: 'from-red-950/70 via-zinc-900 to-black', border: 'border-red-500/30', accent: 'text-red-400', glowShadow: 'rgba(239, 68, 68, 0.4)', glowColor: 'rgba(239, 68, 68, 0.3)' },
            solana: { bg: 'from-purple-950/70 via-zinc-900 to-zinc-950', border: 'border-purple-500/30', accent: 'text-purple-400', glowShadow: 'rgba(168, 85, 247, 0.45)', glowColor: 'rgba(168, 85, 247, 0.3)' },
            bsc: { bg: 'from-yellow-950/70 via-zinc-900 to-black', border: 'border-yellow-500/30', accent: 'text-yellow-400', glowShadow: 'rgba(234, 179, 8, 0.4)', glowColor: 'rgba(234, 179, 8, 0.3)' },
            polygon: { bg: 'from-violet-950/70 via-zinc-900 to-black', border: 'border-violet-500/30', accent: 'text-violet-400', glowShadow: 'rgba(139, 92, 246, 0.45)', glowColor: 'rgba(139, 92, 246, 0.3)' },
            arbitrum: { bg: 'from-sky-950/70 via-zinc-900 to-slate-950', border: 'border-sky-500/30', accent: 'text-sky-400', glowShadow: 'rgba(14, 165, 233, 0.45)', glowColor: 'rgba(14, 165, 233, 0.3)' },
            ton: { bg: 'from-cyan-950/70 via-zinc-900 to-slate-950', border: 'border-cyan-500/30', accent: 'text-cyan-400', glowShadow: 'rgba(6, 182, 212, 0.45)', glowColor: 'rgba(6, 182, 212, 0.3)' },
            litecoin: { bg: 'from-blue-950/70 via-zinc-900 to-black', border: 'border-blue-500/30', accent: 'text-blue-400', glowShadow: 'rgba(59, 130, 246, 0.45)', glowColor: 'rgba(59, 130, 246, 0.3)' },
            dogecoin: { bg: 'from-amber-950/60 via-zinc-900 to-black', border: 'border-amber-400/30', accent: 'text-amber-300', glowShadow: 'rgba(251, 191, 36, 0.4)', glowColor: 'rgba(251, 191, 36, 0.3)' }
        };

        grid.innerHTML = paged.map((a, idx) => {
            const theme = netThemes[a.network_id] || { bg: 'from-zinc-900 via-zinc-800 to-black', border: 'border-zinc-700/50', accent: 'text-zinc-300', glowShadow: 'rgba(99, 102, 241, 0.4)', glowColor: 'rgba(255, 255, 255, 0.22)' };
            const isTemp = Boolean(a.is_temporary);
            const status = this.getAddressStatus(a);
            const isPinned = !!this.pinnedAddresses[a.id];
            const isActive = status === 'ACTIVE';

            let statusBadge = '';
            if (status === 'EXPIRED') {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">EXPIRED</span>`;
            } else if (status === 'INACTIVE') {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">INACTIVE</span>`;
            } else if (isTemp) {
                statusBadge = `<span id="timer-badge-${a.id}" class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1" data-tooltip="Auto-deletes upon expiry"><i class="ph ph-timer animate-pulse"></i> <span>DISPOSAL: ${this.formatRemainingTime(a.remaining_seconds || 0)}</span></span>`;
            } else {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ACTIVE</span>`;
            }

            const balFormatted = this.balancesHidden ? '••••••••' : `${a.balance || 0} ${a.short_name}`;
            const usdFormatted = this.balancesHidden ? '••••••••' : `~$${a.balance_usd || 0} USD`;

            const animClass = this.shouldAnimateAddresses ? 'address-card-entry' : '';
            const animStyle = this.shouldAnimateAddresses ? `style="--card-index: ${idx};"` : '';

            return `
                <div class="flex flex-col gap-3 group">
                    <!-- Physical Crypto Address Credit Card with Tilt and Specular Glow -->
                    <div class="card-perspective-container ${animClass}" ${animStyle}>
                        <div class="credit-card addr-credit-card cursor-default bg-gradient-to-br ${theme.bg} text-white p-5 border ${theme.border} relative overflow-hidden flex flex-col justify-between min-h-[220px]"
                             style="--card-glow-shadow: ${theme.glowShadow}; --card-glow-color: ${theme.glowColor};"
                             onmousemove="Wallets.handleAddressCardMouseMove(this, event)"
                             onmouseleave="Wallets.handleAddressCardMouseLeave(this, event)">
                            
                            <!-- Specular ambient glow & interactive cursor glow -->
                            <div class="card-hover-glow"></div>
                            <div class="absolute -right-8 -top-8 w-36 h-36 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

                            <!-- Card Header: Network Icon & Status / Hover Actions -->
                            <div class="addr-card-header flex items-center justify-between relative z-10">
                                <div class="flex items-center gap-2.5">
                                    <div class="w-8 h-8 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center p-1 shadow-inner">
                                        ${CryptoIcons.get(a.icon || a.network_id, 24)}
                                    </div>
                                    <div>
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-xs font-extrabold tracking-wider uppercase text-zinc-100">${a.network_name}</span>
                                            <span class="text-[10px] font-mono text-zinc-400">#${a.address_index}</span>
                                        </div>
                                        <span class="text-[9px] uppercase tracking-wider ${theme.accent} font-mono block">${a.short_name} NETWORK</span>
                                    </div>
                                </div>

                                <div class="flex items-center gap-1.5">
                                    <!-- Status badges & Pinned icon container that fades on settings hover -->
                                    <div class="addr-status-badges flex items-center gap-1.5 transition-all duration-300">
                                        <!-- Pinned Icon -->
                                        ${isPinned ? `<span class="text-amber-400 p-0.5 shrink-0" data-tooltip="Pinned Address"><i class="ph-fill ph-push-pin text-xs"></i></span>` : ''}

                                        <!-- Status Badge -->
                                        ${statusBadge}
                                    </div>

                                    <!-- Address Settings Hover Gear (Reveals Pin, Activate/Deactivate, Edit, Delete) -->
                                    <div class="addr-actions-group relative flex items-center justify-end" onclick="event.stopPropagation()">
                                        <button class="addr-gear-trigger p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer" data-tooltip="Address Settings">
                                            <i class="ph ph-gear text-sm"></i>
                                        </button>
                                        <div class="addr-action-buttons flex items-center gap-1">
                                            <!-- Pin / Unpin Button -->
                                            <button onclick="Wallets.togglePinAddress('${a.id}', event)" class="p-1 rounded-lg ${isPinned ? 'text-amber-400 bg-amber-500/20' : 'text-white/70 hover:text-amber-400 hover:bg-white/10'} transition-colors" data-tooltip="${isPinned ? 'Unpin Address' : 'Pin Address'}">
                                                <i class="${isPinned ? 'ph-fill ph-push-pin' : 'ph ph-push-pin'} text-sm"></i>
                                            </button>

                                            <!-- Activate / Deactivate Button -->
                                            <button onclick="Wallets.toggleActivateAddress('${a.id}', event)" class="p-1 rounded-lg ${isActive ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-700'} transition-colors" data-tooltip="${isActive ? 'Deactivate Address' : 'Activate Address'}">
                                                <i class="ph ${isActive ? 'ph-power' : 'ph-play'} text-sm"></i>
                                            </button>

                                            <!-- Edit Label Button -->
                                            <button onclick="Wallets.openEditLabelModal('${a.id}', '${(a.label || '').replace(/'/g, "\\'")}')" class="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" data-tooltip="Edit Label">
                                                <i class="ph ph-pencil-simple text-sm"></i>
                                            </button>

                                            <!-- Delete Address Button -->
                                            <button onclick="Wallets.openDeleteAddressModal('${a.id}', '${a.address}')" class="p-1 rounded-lg text-white/70 hover:text-rose-400 hover:bg-rose-500/20 transition-colors" data-tooltip="Delete Address">
                                                <i class="ph ph-trash text-sm"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Contactless Wave Symbol -->
                                    <svg class="w-5 h-5 text-zinc-400 shrink-0 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8.5 16.5a5 5 0 0 1 0-7"/><path d="M12 19a8.5 8.5 0 0 0 0-14"/><path d="M15.5 21.5a12 12 0 0 0 0-19"/></svg>
                                </div>
                            </div>

                            <!-- Card Middle: Smart Chip & Segmented Card Number (Uncovers full address on hover) -->
                            <div class="my-3 flex items-center justify-between relative z-10">
                                <div class="emv-chip">
                                    <div class="emv-chip-lines"></div>
                                </div>
                                <!-- Segmented Card Number with 1-Click Copy & Hover Uncover -->
                                <button onclick="navigator.clipboard.writeText('${a.address}'); Toast.success('Address copied to clipboard!');"
                                        onmouseenter="this.querySelector('.addr-num-display').textContent = '${a.address}'; this.querySelector('.addr-num-display').classList.add('text-[10px]');"
                                        onmouseleave="this.querySelector('.addr-num-display').innerHTML = '${a.address.slice(0, 4)} &nbsp; •••• &nbsp; •••• &nbsp; <span class=\\'text-white\\'>${a.address.slice(-4)}</span>'; this.querySelector('.addr-num-display').classList.remove('text-[10px]');"
                                        class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 hover:bg-black/60 transition-colors group/num max-w-[72%]"
                                        data-tooltip="Hover to uncover, click to copy">
                                    <span class="addr-num-display font-mono text-xs tracking-widest text-zinc-200 card-embossed font-semibold truncate">
                                        ${a.address.slice(0, 4)} &nbsp; •••• &nbsp; •••• &nbsp; <span class="text-white">${a.address.slice(-4)}</span>
                                    </span>
                                    <i class="ph ph-copy text-xs text-zinc-400 group-hover/num:text-white shrink-0 transition-colors"></i>
                                </button>
                            </div>

                            <!-- Card Bottom: Cardholder Label & On-Chain Balance -->
                            <div class="relative z-10 pt-2 border-t border-white/10 flex items-end justify-between">
                                <div class="max-w-[55%]">
                                    <span class="text-[8px] uppercase font-bold tracking-widest text-zinc-400 block">CARD LABEL</span>
                                    <span id="label-text-${a.id}" class="text-xs font-bold uppercase tracking-wider text-zinc-100 card-label-embossed truncate block">${a.label || 'Receiving Address'}</span>
                                </div>

                                <div class="text-right max-w-[45%]">
                                    <span class="text-[8px] uppercase font-bold tracking-widest text-zinc-400 block">ON-CHAIN BALANCE</span>
                                    <div class="text-base font-extrabold font-mono text-white tracking-tight card-embossed truncate">
                                        ${balFormatted}
                                    </div>
                                    <span class="text-[9px] font-mono text-zinc-400 block">${usdFormatted}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Actions Below Card: QR + Receive + Send + Explorer (Clean 4-col grid, delete moved to settings gear) -->
                    <div class="grid grid-cols-4 gap-2">
                        <button onclick="Wallets.showQrModal('${a.address}', '${a.network_name}', '${a.wallet_id}', '${a.id}', '${a.network_id}')" class="h-9 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-indigo-500 flex items-center justify-center shadow-sm transition-all cursor-pointer" data-tooltip="View QR Code">
                            <i class="ph ph-qr-code text-lg"></i>
                        </button>
                        <button onclick="Wallets.openReceiveForAddress('${a.wallet_id}', '${a.id}')" class="h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm transition-all cursor-pointer" data-tooltip="Receive Funds to this Address">
                            <i class="ph ph-arrow-down-left text-lg text-emerald-500"></i>
                        </button>
                        <button onclick="Wallets.openWithdrawModal('${a.wallet_id}', '${a.network_id}')" class="h-9 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-sm transition-all cursor-pointer" data-tooltip="Send / Withdraw from this Network">
                            <i class="ph-bold ph-paper-plane-tilt text-lg text-purple-500"></i>
                        </button>
                        <a href="${a.explorer_url}" target="_blank" class="h-9 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-indigo-500 flex items-center justify-center shadow-sm transition-all cursor-pointer" data-tooltip="View on Blockchain Explorer">
                            <i class="ph ph-arrow-square-out text-lg"></i>
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        // Reset animation trigger so subsequent background polling renders stay smooth
        this.shouldAnimateAddresses = false;
    },

    openDeleteAddressModal(addressId, addressStr = '') {
        const idInput = document.getElementById('delete-address-id');
        if (idInput) idInput.value = addressId;

        const target = addressStr || addressId || '';
        const last4 = target.slice(-4);
        const last4El = document.getElementById('delete-address-last4');
        if (last4El) last4El.textContent = last4;

        // Strictly require LAST 4 characters
        this.deleteAddressExpectedSegment = last4;
        const targetLabel = document.getElementById('delete-address-target-label');
        if (targetLabel) targetLabel.textContent = 'LAST 4';

        // Clear OTP inputs and setup listeners
        UI.clearOtpInputs('delete-address-otp-container');
        this.setupOtpInputs('delete-address-otp-container', () => this.validateDeleteAddressConfirm());

        const btn = document.getElementById('btn-submit-delete-address');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-40', 'cursor-not-allowed');
        }

        UI.openModal('modal-delete-address');
        const inputs = Array.from(document.querySelectorAll('#delete-address-otp-container input'));
        setTimeout(() => { if (inputs[0]) inputs[0].focus(); }, 120);
    },

    validateDeleteAddressConfirm() {
        const inputs = Array.from(document.querySelectorAll('#delete-address-otp-container input'));
        const entered = inputs.map(i => i.value.trim()).join('').toUpperCase();
        const expected = (this.deleteAddressExpectedSegment || '').toUpperCase();
        const btn = document.getElementById('btn-submit-delete-address');
        if (!btn) return;

        if (entered.length === 4 && entered === expected) {
            btn.disabled = false;
            btn.classList.remove('opacity-40', 'cursor-not-allowed');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-40', 'cursor-not-allowed');
        }
    },

    async submitDeleteAddress() {
        const idInput = document.getElementById('delete-address-id');
        const addressId = idInput ? idInput.value : null;
        if (!addressId) return;

        const btn = document.getElementById('btn-submit-delete-address');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Deleting...';
        }

        try {
            await API.delete(`/api/addresses/${addressId}`);
            Toast.success('Address deleted successfully');
            UI.closeModal('modal-delete-address');
            if (this.currentWalletId) {
                await this.loadAddressesData();
                await this.loadWallets();
                if (window.App) App.renderStats();
            }
        } catch (err) {
            Toast.error(err.message || 'Failed to delete address');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Delete Address';
            }
        }
    },

    // Backward compatibility wrapper
    deleteAddress(addressId, addressStr = '') {
        this.openDeleteAddressModal(addressId, addressStr);
    },

    formatRemainingTime(seconds) {
        if (seconds <= 0) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    },

    tickTemporaryTimers() {
        this.currentAddresses.forEach(a => {
            if (a.is_temporary && a.remaining_seconds > 0) {
                a.remaining_seconds -= 1;
                const el = document.getElementById(`timer-badge-${a.id}`);
                if (el) {
                    if (a.remaining_seconds <= 0) {
                        el.innerHTML = 'EXPIRED';
                        el.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20';
                    } else {
                        const span = el.querySelector('span');
                        if (span) span.textContent = this.formatRemainingTime(a.remaining_seconds);
                    }
                }
            }
        });
    },

    async refreshAllOnChainBalances() {
        if (!this.currentWalletId) return;
        const btn = document.getElementById('btn-refresh-balances');
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="ph ph-arrows-clockwise animate-spin text-base"></i> Refreshing on-chain...`;
            }

            const res = await API.post(`/api/wallets/${this.currentWalletId}/refresh-balances`);
            this.currentAddresses = res.addresses;
            document.getElementById('addr-page-wallet-balance').textContent = this.formatBalance(res.total_balance_usd);
            this.renderAddressesPage();
            await this.loadWallets();
            if (window.App) App.renderStats();
            Toast.success('All address balances refreshed from blockchain!');
        } catch (e) {
            Toast.error('Balance update failed');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="ph ph-arrows-clockwise text-base"></i> Refresh Balances`;
            }
        }
    },

    async deriveNextAddressFromPage() {
        return this.submitGenerateAddressModal();
    },

    openEditLabelModal(addressId, currentLabel) {
        document.getElementById('edit-addr-id').value = addressId;
        document.getElementById('edit-addr-label').value = currentLabel;
        UI.openModal('modal-edit-label');
    },

    async submitEditLabel() {
        const addressId = document.getElementById('edit-addr-id').value;
        const newLabel = document.getElementById('edit-addr-label').value.trim();

        try {
            await API.post(`/api/addresses/${addressId}/edit`, { label: newLabel });
            Toast.success('Address label updated');
            UI.closeModal('modal-edit-label');

            const item = this.currentAddresses.find(a => a.id === addressId);
            if (item) item.label = newLabel;
            const textEl = document.getElementById(`label-text-${addressId}`);
            if (textEl) textEl.textContent = newLabel || 'No Label';
        } catch (e) {
            Toast.error('Failed to update label');
        }
    },

    currentQrWalletId: null,
    currentQrAddressId: null,
    currentQrNetworkId: null,

    openReceiveForAddress(walletId, addressId) {
        const targetWId = walletId || this.currentWalletId || null;
        FastReceive.openModal(targetWId, addressId);
    },

    openReceiveFromQrModal() {
        UI.closeModal('modal-view-qr');
        this.openReceiveForAddress(this.currentQrWalletId, this.currentQrAddressId);
    },

    openSendFromQrModal() {
        UI.closeModal('modal-view-qr');
        this.openWithdrawModal(this.currentQrWalletId, this.currentQrNetworkId);
    },

    showQrModal(address, networkName, walletId = null, addressId = null, networkId = null) {
        this.currentQrWalletId = walletId || this.currentWalletId || null;
        this.currentQrAddressId = addressId || null;
        this.currentQrNetworkId = networkId || null;

        document.getElementById('qr-modal-title').textContent = `${networkName} Address`;
        document.getElementById('qr-modal-address').textContent = address;
        
        const qrContainer = document.getElementById('qr-modal-code');
        qrContainer.innerHTML = '';
        if (window.QRious) {
            const canvas = document.createElement('canvas');
            new QRious({
                element: canvas,
                value: address,
                size: 200,
                level: 'H'
            });
            qrContainer.appendChild(canvas);
        } else {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}" class="rounded-xl shadow" />`;
        }
        UI.openModal('modal-view-qr');
    },

    // ==================== SEND / WITHDRAWAL CONTROLLER ====================
    withdrawSelectedHops: 2,
    withdrawWalletAddresses: [],
    withdrawSelectedWalletId: null,
    withdrawSelectedNetworkId: 'litecoin',

    async openWithdrawModal(targetWalletId = null, targetNetworkId = null) {
        if (!this.walletsList || this.walletsList.length === 0) {
            await this.loadWallets();
        }
        if (!this.walletsList || this.walletsList.length === 0) {
            Toast.warning('Please generate a master wallet first.');
            return;
        }

        this.withdrawSelectedWalletId = targetWalletId || (this.walletsList[0] ? this.walletsList[0].id : null);
        this.withdrawSelectedNetworkId = targetNetworkId || 'litecoin';
        this.withdrawSelectedHops = 2;

        // Reset screens
        document.getElementById('withdraw-form-container').classList.remove('hidden');
        document.getElementById('withdraw-receipt-container').classList.add('hidden');
        document.getElementById('withdraw-dest-input').value = '';
        document.getElementById('withdraw-amount-input').value = '';
        document.getElementById('withdraw-amount-usd-badge').textContent = '~$0.00 USD';

        // Secured Chain toggle default is FALSE (OFF)
        const toggle = document.getElementById('withdraw-secured-toggle');
        if (toggle) toggle.checked = false;
        document.getElementById('withdraw-secured-options').classList.add('hidden');
        this.setWithdrawHops(2);

        if (!this.walletsList || this.walletsList.length === 0) {
            await this.loadWallets();
        }

        // Populate Wallet Dropdown
        const walletOptions = this.walletsList.map(w => ({
            value: w.id,
            label: `${w.name} (${this.formatBalance(w.total_balance_usd)})`,
            iconHtml: '<i class="ph ph-vault text-indigo-500 text-base"></i>'
        }));
        CustomDropdown.create('withdraw-wallet-dropdown', walletOptions, this.withdrawSelectedWalletId, (val) => {
            this.withdrawSelectedWalletId = val;
            this.onWithdrawWalletChanged();
        });

        // Networks
        const netOptions = [
            { value: 'litecoin', label: 'Litecoin (LTC SegWit)', icon: 'ltc', subtext: 'Fee: ~0.0001 LTC' },
            { value: 'bitcoin', label: 'Bitcoin (BTC Native SegWit)', icon: 'btc', subtext: 'Fee: ~0.00005 BTC' },
            { value: 'ethereum', label: 'Ethereum (ETH ERC20)', icon: 'eth', subtext: 'Fee: ~0.001 ETH' },
            { value: 'tron', label: 'TRON Network (TRX TRC20)', icon: 'trx', subtext: 'Fee: ~1 TRX' },
            { value: 'bsc', label: 'BNB Smart Chain (BEP20)', icon: 'bnb', subtext: 'Fee: ~0.0002 BNB' },
            { value: 'solana', label: 'Solana (SOL)', icon: 'sol', subtext: 'Fee: ~0.00001 SOL' },
            { value: 'polygon', label: 'Polygon PoS (MATIC)', icon: 'matic', subtext: 'Fee: ~0.01 MATIC' },
            { value: 'ton', label: 'The Open Network (TON)', icon: 'ton', subtext: 'Fee: ~0.005 TON' },
            { value: 'dogecoin', label: 'Dogecoin (DOGE)', icon: 'doge', subtext: 'Fee: ~0.1 DOGE' }
        ];

        CustomDropdown.create('withdraw-network-dropdown', netOptions, this.withdrawSelectedNetworkId, (val) => {
            this.withdrawSelectedNetworkId = val;
            this.updateWithdrawBalanceAndFee();
        });

        await this.onWithdrawWalletChanged();
        document.getElementById('withdraw-form-container')?.classList.remove('hidden');
        document.getElementById('withdraw-receipt-container')?.classList.add('hidden');
        document.getElementById('withdraw-modal-footer')?.classList.remove('hidden');
        UI.openModal('modal-withdraw-funds');
    },

    async onWithdrawWalletChanged() {
        if (!this.withdrawSelectedWalletId) return;
        try {
            this.withdrawWalletAddresses = await API.get(`/api/wallets/${this.withdrawSelectedWalletId}/addresses`);
            this.updateWithdrawBalanceAndFee();
        } catch (e) {
            console.error(e);
        }
    },

    getCryptoRate(symbol) {
        if (window.PriceTicker && window.PriceTicker.prices && window.PriceTicker.prices[symbol]) {
            return window.PriceTicker.prices[symbol];
        }
        const defaultRates = {
            'BTC': 82500,
            'ETH': 2450,
            'SOL': 105,
            'BNB': 740,
            'TRX': 0.33,
            'LTC': 60.5,
            'MATIC': 0.38,
            'TON': 5.25,
            'DOGE': 0.08,
            'USDT': 1.0,
            'USDC': 1.0
        };
        return defaultRates[symbol] || 1.0;
    },

    updateWithdrawBalanceAndFee() {
        const net = this.withdrawSelectedNetworkId;
        const addrs = this.withdrawWalletAddresses.filter(a => a.network_id === net);
        const totalBal = addrs.reduce((acc, a) => acc + (a.balance || 0), 0);
        const symbol = (net === 'bitcoin' ? 'BTC' : (net === 'litecoin' ? 'LTC' : (net === 'ethereum' ? 'ETH' : (net === 'tron' ? 'TRX' : (net === 'solana' ? 'SOL' : (net === 'bsc' ? 'BNB' : (net === 'dogecoin' ? 'DOGE' : 'USDT')))))));

        const availBadge = document.getElementById('withdraw-avail-badge');
        if (availBadge) {
            availBadge.textContent = `Available: ${totalBal} ${symbol}`;
        }

        const currLabel = document.getElementById('withdraw-amount-currency-label');
        if (currLabel) currLabel.textContent = symbol;

        const isSecured = document.getElementById('withdraw-secured-toggle')?.checked || false;
        const hops = isSecured ? this.withdrawSelectedHops : 0;
        const feePerHop = (net === 'litecoin' ? 0.0001 : 0.00005);
        const totalFee = parseFloat((feePerHop * (hops + 1)).toFixed(8));
        const rate = this.getCryptoRate(symbol);
        const feeUsd = (totalFee * rate).toFixed(2);

        const feeEst = document.getElementById('withdraw-fee-est');
        if (feeEst) {
            feeEst.textContent = `${totalFee} ${symbol} (~$${feeUsd} USD) • ${hops > 0 ? (hops + 1) + ' chain txs' : 'Direct transfer'}`;
        }

        this.updateWithdrawRoutingDiagram();
        this.onWithdrawCryptoAmountChanged();
    },

    toggleSecuredChainUI() {
        const toggle = document.getElementById('withdraw-secured-toggle');
        const opts = document.getElementById('withdraw-secured-options');
        if (toggle && opts) {
            if (toggle.checked) {
                opts.classList.remove('hidden');
            } else {
                opts.classList.add('hidden');
            }
        }
        this.updateWithdrawBalanceAndFee();
    },

    setWithdrawHops(hops) {
        this.withdrawSelectedHops = hops;
        const customContainer = document.getElementById('withdraw-custom-hops-container');
        if (customContainer && hops <= 4) {
            customContainer.classList.add('hidden');
        }

        document.querySelectorAll('.withdraw-hop-btn').forEach(b => {
            const h = b.getAttribute('data-hops');
            if (h === String(hops)) {
                b.className = 'withdraw-hop-btn py-1.5 rounded-xl border border-indigo-500 bg-indigo-500/10 text-indigo-500 text-xs font-bold transition-all';
            } else if (h === 'custom' && hops > 4) {
                b.className = 'withdraw-hop-btn py-1.5 rounded-xl border border-indigo-500 bg-indigo-500/10 text-indigo-500 text-xs font-bold transition-all';
            } else {
                b.className = 'withdraw-hop-btn py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-semibold hover:border-indigo-500 transition-all';
            }
        });

        const disp = document.getElementById('withdraw-hops-count-display');
        if (disp) disp.textContent = `${hops} Stealth ${hops === 1 ? 'Hop' : 'Hops'}`;

        this.updateWithdrawBalanceAndFee();
    },

    toggleCustomHopsInput() {
        const customContainer = document.getElementById('withdraw-custom-hops-container');
        if (!customContainer) return;
        const isCurrentlyHidden = customContainer.classList.contains('hidden');
        if (isCurrentlyHidden) {
            customContainer.classList.remove('hidden');
            const inputVal = parseInt(document.getElementById('withdraw-custom-hops-input')?.value || '5', 10) || 5;
            this.setWithdrawHops(inputVal);
        } else {
            customContainer.classList.add('hidden');
            this.setWithdrawHops(2);
        }
    },

    onCustomHopsChanged(val) {
        let hops = parseInt(val, 10);
        if (isNaN(hops) || hops < 1) hops = 1;
        if (hops > 10000) hops = 10000;
        this.withdrawSelectedHops = hops;
        
        document.querySelectorAll('.withdraw-hop-btn').forEach(b => {
            const h = b.getAttribute('data-hops');
            if (h === 'custom') {
                b.className = 'withdraw-hop-btn py-1.5 rounded-xl border border-indigo-500 bg-indigo-500/10 text-indigo-500 text-xs font-bold transition-all';
            } else {
                b.className = 'withdraw-hop-btn py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-semibold hover:border-indigo-500 transition-all';
            }
        });

        const disp = document.getElementById('withdraw-hops-count-display');
        if (disp) disp.textContent = `${hops} Stealth Hops (Custom)`;

        this.updateWithdrawBalanceAndFee();
    },

    updateWithdrawRoutingDiagram() {
        const diagram = document.getElementById('withdraw-routing-diagram');
        if (!diagram) return;

        const isSecured = document.getElementById('withdraw-secured-toggle')?.checked || false;
        const hops = isSecured ? this.withdrawSelectedHops : 0;

        let html = `
            <span class="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold">Source Vault</span>
            <i class="ph ph-arrow-right text-zinc-400"></i>
        `;

        if (isSecured && hops > 0) {
            if (hops <= 7) {
                for (let i = 1; i <= hops; i++) {
                    html += `
                        <span class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold">Stealth Hop #${i}</span>
                        <i class="ph ph-arrow-right text-zinc-400"></i>
                    `;
                }
            } else {
                // Truncate visualization for large hop counts (> 7)
                html += `
                    <span class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold">Stealth Hop #1</span>
                    <i class="ph ph-arrow-right text-zinc-400"></i>
                    <span class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold">Stealth Hop #2</span>
                    <i class="ph ph-arrow-right text-zinc-400"></i>
                    <span class="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold tracking-widest text-[10px]">••• (${hops - 4} intermediate hops) •••</span>
                    <i class="ph ph-arrow-right text-zinc-400"></i>
                    <span class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold">Stealth Hop #${hops - 1}</span>
                    <i class="ph ph-arrow-right text-zinc-400"></i>
                    <span class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold">Stealth Hop #${hops}</span>
                    <i class="ph ph-arrow-right text-zinc-400"></i>
                `;
            }
        }

        html += `
            <span class="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold">Destination</span>
        `;

        diagram.innerHTML = html;
    },

    onWithdrawCryptoAmountChanged() {
        const cryptoInput = document.getElementById('withdraw-amount-input');
        const usdInput = document.getElementById('withdraw-amount-usd-input');
        const val = parseFloat(cryptoInput?.value) || 0;
        const net = this.withdrawSelectedNetworkId;
        const symbol = (net === 'bitcoin' ? 'BTC' : (net === 'litecoin' ? 'LTC' : (net === 'ethereum' ? 'ETH' : (net === 'tron' ? 'TRX' : (net === 'solana' ? 'SOL' : (net === 'bsc' ? 'BNB' : (net === 'dogecoin' ? 'DOGE' : 'USDT')))))));
        const rate = this.getCryptoRate(symbol);

        if (usdInput && document.activeElement === cryptoInput) {
            usdInput.value = val > 0 ? (val * rate).toFixed(2) : '';
        }

        const usdBadge = document.getElementById('withdraw-amount-usd-badge');
        if (usdBadge) {
            usdBadge.textContent = `~$${(val * rate).toFixed(2)} USD`;
        }
    },

    onWithdrawUsdAmountChanged() {
        const cryptoInput = document.getElementById('withdraw-amount-input');
        const usdInput = document.getElementById('withdraw-amount-usd-input');
        const usdVal = parseFloat(usdInput?.value) || 0;
        const net = this.withdrawSelectedNetworkId;
        const symbol = (net === 'bitcoin' ? 'BTC' : (net === 'litecoin' ? 'LTC' : (net === 'ethereum' ? 'ETH' : (net === 'tron' ? 'TRX' : (net === 'solana' ? 'SOL' : (net === 'bsc' ? 'BNB' : (net === 'dogecoin' ? 'DOGE' : 'USDT')))))));
        const rate = this.getCryptoRate(symbol);

        if (cryptoInput && document.activeElement === usdInput) {
            cryptoInput.value = usdVal > 0 ? parseFloat((usdVal / rate).toFixed(8)) : '';
        }

        const usdBadge = document.getElementById('withdraw-amount-usd-badge');
        if (usdBadge) {
            usdBadge.textContent = `~$${usdVal.toFixed(2)} USD`;
        }
    },

    onWithdrawAmountChanged() {
        this.onWithdrawCryptoAmountChanged();
    },

    setWithdrawMaxAmount() {
        const net = this.withdrawSelectedNetworkId;
        const addrs = this.withdrawWalletAddresses.filter(a => a.network_id === net);
        const totalBal = addrs.reduce((acc, a) => acc + (a.balance || 0), 0);
        const isSecured = document.getElementById('withdraw-secured-toggle')?.checked || false;
        const hops = isSecured ? this.withdrawSelectedHops : 0;
        const feePerHop = (net === 'litecoin' ? 0.0001 : 0.00005);
        const totalFee = parseFloat((feePerHop * (hops + 1)).toFixed(8));

        const maxAmt = Math.max(0, parseFloat((totalBal - totalFee).toFixed(8)));
        const amtInput = document.getElementById('withdraw-amount-input');
        if (amtInput) {
            amtInput.value = maxAmt > 0 ? maxAmt : '0';
            const symbol = (net === 'bitcoin' ? 'BTC' : (net === 'litecoin' ? 'LTC' : (net === 'ethereum' ? 'ETH' : (net === 'tron' ? 'TRX' : (net === 'solana' ? 'SOL' : (net === 'bsc' ? 'BNB' : (net === 'dogecoin' ? 'DOGE' : 'USDT')))))));
            const rate = this.getCryptoRate(symbol);
            const usdInput = document.getElementById('withdraw-amount-usd-input');
            if (usdInput) usdInput.value = (maxAmt * rate).toFixed(2);
            this.onWithdrawCryptoAmountChanged();
        }
    },

    validateAddress(networkId, address) {
        const addr = (address || '').trim();
        if (!addr) return { valid: false, message: 'Please enter a destination address' };

        // EVM
        if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'avalanche'].includes(networkId)) {
            if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return { valid: true, message: 'Valid EVM address (0x...)' };
            return { valid: false, message: 'Invalid EVM address: must start with 0x and have 40 hex digits (42 chars total)' };
        }

        // Bitcoin
        if (networkId === 'bitcoin') {
            if (/^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59}|1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34})$/.test(addr)) {
                return { valid: true, message: 'Valid Bitcoin address' };
            }
            return { valid: false, message: 'Invalid Bitcoin address: must be SegWit (bc1...), Legacy (1...) or P2SH (3...)' };
        }

        // Litecoin
        if (networkId === 'litecoin') {
            if (/^(ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59}|[LM3][1-9A-HJ-NP-Za-km-z]{26,34})$/.test(addr)) {
                return { valid: true, message: 'Valid Litecoin address' };
            }
            return { valid: false, message: 'Invalid Litecoin address: must start with ltc1, L, or M' };
        }

        // TRON
        if (networkId === 'tron') {
            if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return { valid: true, message: 'Valid TRON address' };
            return { valid: false, message: 'Invalid TRON address: must start with T and be 34 characters' };
        }

        // Solana
        if (networkId === 'solana') {
            if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return { valid: true, message: 'Valid Solana address' };
            return { valid: false, message: 'Invalid Solana address: must be 32-44 base58 characters' };
        }

        // TON
        if (networkId === 'ton') {
            if (/^(EQ|UQ|kQ|0Q)[a-zA-Z0-9_-]{46}$/.test(addr) || /^(-1|0):[a-fA-F0-9]{64}$/.test(addr) || (addr.length === 48 && /^[a-zA-Z0-9_\-\+/=]{48}$/.test(addr))) {
                return { valid: true, message: 'Valid TON address' };
            }
            return { valid: false, message: 'Invalid TON address: must be 48-character address' };
        }

        // Dogecoin
        if (networkId === 'dogecoin') {
            if (/^[D9A][1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return { valid: true, message: 'Valid Dogecoin address' };
            return { valid: false, message: 'Invalid Dogecoin address: must start with D, 9, or A' };
        }

        if (addr.length < 15) return { valid: false, message: 'Address is too short to be valid' };
        return { valid: true, message: 'Valid address' };
    },

    onWithdrawDestChanged() {
        const destInput = document.getElementById('withdraw-dest-input');
        const feedback = document.getElementById('withdraw-dest-feedback');
        if (!destInput || !feedback) return;

        const addr = destInput.value.trim();
        if (!addr) {
            feedback.className = 'hidden';
            destInput.classList.remove('border-emerald-500', 'border-rose-500');
            return;
        }

        const res = this.validateAddress(this.withdrawSelectedNetworkId, addr);
        feedback.classList.remove('hidden');
        if (res.valid) {
            feedback.className = 'text-[11px] mt-1 font-medium text-emerald-500 flex items-center gap-1';
            feedback.innerHTML = `<i class="ph-bold ph-check-circle"></i> <span>${res.message}</span>`;
            destInput.classList.remove('border-rose-500');
            destInput.classList.add('border-emerald-500');
        } else {
            feedback.className = 'text-[11px] mt-1 font-medium text-rose-500 flex items-center gap-1';
            feedback.innerHTML = `<i class="ph-bold ph-warning-circle"></i> <span>${res.message}</span>`;
            destInput.classList.remove('border-emerald-500');
            destInput.classList.add('border-rose-500');
        }
    },

    receiptPollTimer: null,

    async submitWithdrawal() {
        const walletId = this.withdrawSelectedWalletId;
        const netId = this.withdrawSelectedNetworkId;
        const destAddr = document.getElementById('withdraw-dest-input')?.value.trim();
        const amt = parseFloat(document.getElementById('withdraw-amount-input')?.value) || 0;
        const isSecured = document.getElementById('withdraw-secured-toggle')?.checked || false;
        const hops = isSecured ? this.withdrawSelectedHops : 0;
        const submitBtn = document.getElementById('btn-submit-withdraw');

        if (!destAddr) {
            Toast.warning('Please enter an external recipient address');
            return;
        }

        // 1. Client-side address validation
        const validation = this.validateAddress(netId, destAddr);
        if (!validation.valid) {
            Toast.error(validation.message);
            document.getElementById('withdraw-dest-input')?.focus();
            return;
        }

        if (amt <= 0) {
            Toast.warning('Please specify an amount greater than 0');
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-base"></i> Routing & Broadcasting...`;
            }

            const payload = {
                wallet_id: walletId,
                network_id: netId,
                destination_address: destAddr,
                amount: amt,
                is_secured_chain: isSecured,
                chain_hops_count: hops
            };

            const res = await API.post('/api/wallets/withdraw', payload);

            // Notify user & add to notification drawer
            if (window.App) {
                App.addNotification({
                    title: isSecured ? 'Secured Multi-Hop Dispatched' : 'Direct Transfer Broadcasted',
                    desc: `Dispatched ${amt} ${res.token_symbol} (~$${res.amount_usd || 0} USD) to ${destAddr.slice(0, 10)}... (ID: ${res.payment_id || res.id})`,
                    type: 'info'
                });
            } else {
                Toast.success(`Outgoing transfer of ${amt} ${res.token_symbol} submitted!`);
            }

            // Switch to receipt & tracking screen
            document.getElementById('withdraw-form-container').classList.add('hidden');
            document.getElementById('withdraw-receipt-container').classList.remove('hidden');
            document.getElementById('withdraw-modal-footer')?.classList.add('hidden');

            const trackingId = res.payment_id || res.id;
            document.getElementById('receipt-title').textContent = isSecured ? 'Secured Multi-Hop Transfer Broadcasted!' : 'Direct Transfer Broadcasted!';
            document.getElementById('receipt-desc').textContent = `Dispatched ${res.amount} ${res.token_symbol} (~$${res.amount_usd} USD) to ${res.destination_address.slice(0, 10)}...`;
            document.getElementById('receipt-tracking-id').textContent = trackingId;
            document.getElementById('receipt-dest-address').textContent = res.destination_address;

            // Tracking Links
            const webLinkInput = document.getElementById('receipt-web-link');
            const tgLinkInput = document.getElementById('receipt-tg-link');
            const webOpenLink = document.getElementById('receipt-web-open');
            const tgOpenLink = document.getElementById('receipt-tg-open');

            if (webLinkInput) webLinkInput.value = res.web_link || `${window.location.origin}/pay/${trackingId}`;
            if (webOpenLink) webOpenLink.href = res.web_link || `${window.location.origin}/pay/${trackingId}`;
            if (tgLinkInput) tgLinkInput.value = res.telegram_link || '';
            if (tgOpenLink) tgOpenLink.href = res.telegram_link || '#';

            // Initial status badge
            const statusBadge = document.getElementById('receipt-status-badge');
            if (statusBadge) {
                statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 mb-3';
                statusBadge.innerHTML = `<i class="ph ph-spinner animate-spin"></i> <span>BROADCASTING TO MEMPOOL</span>`;
            }

            // Hops breakdown for secured chain
            const hopsCard = document.getElementById('receipt-hops-card');
            const hopsList = document.getElementById('receipt-hops-list');
            if (isSecured && res.hops && res.hops.length > 0) {
                if (hopsCard) hopsCard.classList.remove('hidden');
                document.getElementById('receipt-hops-count').textContent = `${res.hops.length} Steps`;
                if (hopsList) {
                    hopsList.innerHTML = res.hops.map((hop, idx) => `
                        <div class="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-indigo-500">Step #${idx + 1}: ${idx === res.hops.length - 1 ? 'Final Delivery' : 'Stealth Hop'}</span>
                                <span class="text-[10px] text-zinc-400">Gas: ${hop.gas_fee}</span>
                            </div>
                            <div class="text-[10px] text-zinc-400">From: <span class="font-mono text-zinc-600 dark:text-zinc-300">${hop.from_address}</span></div>
                            <div class="text-[10px] text-zinc-400">To: <span class="font-mono text-zinc-600 dark:text-zinc-300">${hop.to_address}</span></div>
                        </div>
                    `).join('');
                }
            } else {
                if (hopsCard) hopsCard.classList.add('hidden');
            }

            // Start live tracking status updates for this transfer
            this.pollWithdrawalReceiptStatus(trackingId);

            // Refresh balances
            await this.loadWallets();
            if (this.currentWalletId) await this.loadAddressesData();
            if (window.App) App.renderStats();

        } catch (err) {
            Toast.error(err.message || 'Withdrawal failed');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="ph-bold ph-paper-plane-tilt text-base"></i> <span>Confirm & Send</span>`;
            }
        }
    },

    pollWithdrawalReceiptStatus(trackingId) {
        if (this.receiptPollTimer) clearInterval(this.receiptPollTimer);

        let pollsCount = 0;
        this.receiptPollTimer = setInterval(async () => {
            pollsCount++;
            if (pollsCount > 30) {
                clearInterval(this.receiptPollTimer);
                return;
            }

            try {
                const pay = await API.get(`/api/payments/${trackingId}`);
                if (!pay) return;

                const statusBadge = document.getElementById('receipt-status-badge');
                const txHashEl = document.getElementById('receipt-tx-hash');
                const explorerContainer = document.getElementById('receipt-explorer-container');
                const explorerLink = document.getElementById('receipt-explorer-link');

                if (pay.tx_hash && txHashEl) {
                    txHashEl.textContent = pay.tx_hash;
                }
                if (pay.explorer_tx && explorerLink && explorerContainer) {
                    explorerLink.href = pay.explorer_tx;
                    explorerContainer.classList.remove('hidden');
                }

                if (pay.status === 'PAID') {
                    if (statusBadge) {
                        statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 mb-3';
                        statusBadge.innerHTML = `<i class="ph-fill ph-check-circle"></i> <span>SETTLED & CONFIRMED (2/2)</span>`;
                    }
                    document.getElementById('receipt-title').textContent = 'Transfer Confirmed & Settled!';
                    document.getElementById('receipt-desc').textContent = 'Transaction verified on-chain with full block confirmations.';
                    clearInterval(this.receiptPollTimer);
                } else if (pay.status === 'CONFIRMING') {
                    if (statusBadge) {
                        statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 mb-3';
                        statusBadge.innerHTML = `<i class="ph ph-spinner animate-spin"></i> <span>CONFIRMING ON BLOCKCHAIN (${pay.confirmations || 1}/${pay.required_confirmations || 2})</span>`;
                    }
                }
            } catch (e) {
                // Ignore poll errors
            }
        }, 2000);
    },

    copyReceiptLink(inputId, label) {
        const input = document.getElementById(inputId);
        if (input && input.value) {
            navigator.clipboard.writeText(input.value);
            Toast.success(`${label} copied to clipboard!`);
        }
    },

    closeWithdrawReceipt() {
        if (this.receiptPollTimer) clearInterval(this.receiptPollTimer);
        UI.closeModal('modal-withdraw-funds');
    }
};

window.Wallets = Wallets;
