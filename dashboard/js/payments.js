// Payments & Sent Withdrawals Controller
const Payments = {
    transactionsList: [],
    rawPayments: [],
    rawWithdrawals: [],
    directionFilter: 'ALL', // 'ALL', 'INCOMING', 'OUTGOING'
    activeFilter: 'ALL',    // 'ALL', 'PENDING', 'CONFIRMING', 'PAID', 'EXPIRED'
    activeNetwork: 'ALL',
    currentDetailPayment: null,
    currentDetailWithdrawal: null,
    pollInterval: null,
    timerInterval: null,
    page: 1,
    perPage: 10,
    shouldAnimateRows: true,

    init() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            const paymentsTab = document.getElementById('tab-payments');
            if (paymentsTab && !paymentsTab.classList.contains('hidden')) {
                this.loadPayments(false, true);
            }
        }, 5000);

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => this.tickTimers(), 1000);
    },

    setDirection(direction) {
        this.directionFilter = direction;
        this.page = 1;
        this.shouldAnimateRows = true;
        document.querySelectorAll('.payment-dir-btn').forEach(b => {
            const isMatch = b.getAttribute('data-dir') === direction;
            b.className = `payment-dir-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${isMatch ? 'bg-indigo-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`;
        });
        this.applyFiltersAndRender();
    },

    setFilter(status) {
        this.activeFilter = status;
        this.page = 1;
        this.shouldAnimateRows = true;
        document.querySelectorAll('.payment-filter-btn').forEach(b => {
            const isMatch = b.getAttribute('data-status') === status;
            b.className = `payment-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${isMatch ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`;
        });
        this.applyFiltersAndRender();
    },

    statusTracker: {},
    isTrackerInit: false,

    async loadPayments(showToastOnSuccess = false, isBackground = false) {
        if (!isBackground) {
            this.shouldAnimateRows = true;
        }
        try {
            const [payments, withdrawals] = await Promise.all([
                API.get(`/api/payments?status=ALL&network_id=${this.activeNetwork}`).catch(() => []),
                API.get('/api/withdrawals').catch(() => [])
            ]);

            this.rawPayments = Array.isArray(payments) ? payments : [];
            this.rawWithdrawals = Array.isArray(withdrawals) ? withdrawals : [];

            this.checkForStatusChanges(this.rawPayments);
            this.applyFiltersAndRender();

            if (showToastOnSuccess) Toast.success('Activity updated');
        } catch (e) {
            console.error('Failed to load payments and withdrawals', e);
        }
    },

    checkForStatusChanges(payments) {
        if (!Array.isArray(payments) || payments.length === 0) return;

        if (!this.isTrackerInit) {
            payments.forEach(p => {
                this.statusTracker[p.id] = {
                    status: p.status,
                    confirmations: p.confirmations || 0
                };
            });
            this.isTrackerInit = true;
            return;
        }

        payments.forEach(p => {
            const prev = this.statusTracker[p.id];
            const currentStatus = p.status;
            const currentConfs = p.confirmations || 0;
            const isOutgoing = p.customer_ref === 'OUTGOING';

            if (prev) {
                if (prev.status !== currentStatus) {
                    const amtText = p.amount ? `${p.amount} ${p.currency || ''}` : '';
                    if (currentStatus === 'PAID') {
                        if (isOutgoing) {
                            if (window.App) App.addNotification({
                                title: 'Transfer Settled',
                                desc: `Outgoing transfer ${p.id} confirmed and settled on-chain: ${amtText}`,
                                type: 'success'
                            });
                        } else {
                            if (window.App) App.addNotification({
                                title: 'Payment Received',
                                desc: `Payment received and confirmed on-chain: ${amtText} (${p.id})`,
                                type: 'success'
                            });
                        }
                        if (window.App) App.loadStats();
                    } else if (currentStatus === 'CONFIRMING') {
                        const req = p.required_confirmations || (isOutgoing ? 2 : 1);
                        if (window.App) App.addNotification({
                            title: 'Payment Detected',
                            desc: `Payment ${p.id} detected on blockchain: confirming (${currentConfs}/${req})`,
                            type: 'info'
                        });
                    } else if (currentStatus === 'EXPIRED') {
                        if (window.App) App.addNotification({
                            title: 'Payment Expired',
                            desc: `Payment ${p.id} expired without completion`,
                            type: 'warning'
                        });
                    } else if (currentStatus === 'FAILED') {
                        if (window.App) App.addNotification({
                            title: 'Payment Failed',
                            desc: `Payment ${p.id} failed on blockchain`,
                            type: 'danger'
                        });
                    } else {
                        if (window.App) App.addNotification({
                            title: `Status: ${currentStatus}`,
                            desc: `Payment ${p.id} status updated to ${currentStatus}`,
                            type: 'info'
                        });
                    }

                    // Refresh detail modal if open
                    if (this.currentDetailPayment && this.currentDetailPayment.id === p.id) {
                        this.openDetailModal(p.id);
                    }
                } else if (prev.status === 'CONFIRMING' && prev.confirmations !== currentConfs) {
                    const req = p.required_confirmations || 2;
                    if (window.App) App.addNotification({
                        title: 'Confirmations Progress',
                        desc: `Payment ${p.id}: ${currentConfs}/${req} confirmations reached`,
                        type: 'info'
                    });
                    if (this.currentDetailPayment && this.currentDetailPayment.id === p.id) {
                        this.openDetailModal(p.id);
                    }
                }
            }

            this.statusTracker[p.id] = {
                status: currentStatus,
                confirmations: currentConfs
            };
        });
    },

    applyFiltersAndRender() {
        let combined = [];

        // 1. Map incoming payments
        if (this.directionFilter === 'ALL' || this.directionFilter === 'INCOMING') {
            const mappedIn = this.rawPayments.map(p => ({
                ...p,
                direction: 'INCOMING',
                is_withdrawal: false,
                display_time: p.created_at
            }));
            combined = combined.concat(mappedIn);
        }

        // 2. Map outgoing withdrawals
        if (this.directionFilter === 'ALL' || this.directionFilter === 'OUTGOING') {
            const mappedOut = this.rawWithdrawals.map(w => ({
                ...w,
                direction: 'OUTGOING',
                is_withdrawal: true,
                display_time: w.created_at,
                currency: w.token_symbol,
                pay_address: w.destination_address
            }));
            combined = combined.concat(mappedOut);
        }

        // 3. Status filter
        if (this.activeFilter !== 'ALL') {
            combined = combined.filter(item => {
                const st = (item.status || '').toUpperCase();
                if (this.activeFilter === 'PAID') {
                    return st === 'PAID' || st === 'COMPLETED' || st === 'BROADCASTED';
                }
                if (this.activeFilter === 'CONFIRMING') {
                    return st === 'CONFIRMING';
                }
                if (this.activeFilter === 'PENDING') {
                    return st === 'PENDING';
                }
                if (this.activeFilter === 'EXPIRED') {
                    return st === 'EXPIRED' || st === 'FAILED';
                }
                return true;
            });
        }

        // 4. Sort newest first
        combined.sort((a, b) => new Date(b.display_time) - new Date(a.display_time));

        this.transactionsList = combined;
        this.renderPaymentsTable();
    },

    tickTimers() {
        this.transactionsList.forEach(p => {
            if (!p.is_withdrawal && p.remaining_seconds > 0) {
                p.remaining_seconds -= 1;
                const el = document.getElementById(`pay-timer-${p.id}`);
                if (el) {
                    if (p.remaining_seconds <= 0) {
                        el.textContent = 'EXPIRED';
                    } else {
                        const m = Math.floor(p.remaining_seconds / 60);
                        const s = p.remaining_seconds % 60;
                        el.textContent = `${m}m ${s < 10 ? '0' : ''}${s}s`;
                    }
                }
            }
        });

        // Detail modal timer
        if (this.currentDetailPayment && this.currentDetailPayment.remaining_seconds > 0) {
            this.currentDetailPayment.remaining_seconds -= 1;
            const el = document.getElementById('dt-pay-timer');
            if (el) {
                const m = Math.floor(this.currentDetailPayment.remaining_seconds / 60);
                const s = this.currentDetailPayment.remaining_seconds % 60;
                el.textContent = `${m}m ${s < 10 ? '0' : ''}${s}s`;
            }
        }
    },

    renderPaymentsTable() {
        const tbody = document.getElementById('payments-table-body');
        const emptyState = document.getElementById('payments-empty-state');
        const paginationContainer = document.getElementById('payments-pagination');
        if (!tbody) return;

        if (!this.transactionsList || this.transactionsList.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
                paginationContainer.classList.add('hidden');
            }
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        const totalPages = Math.ceil(this.transactionsList.length / this.perPage) || 1;
        if (this.page > totalPages) this.page = totalPages;
        if (this.page < 1) this.page = 1;

        const startIdx = (this.page - 1) * this.perPage;
        const pagedList = this.transactionsList.slice(startIdx, startIdx + this.perPage);
        const shouldAnim = !!this.shouldAnimateRows;

        tbody.innerHTML = pagedList.map((tx, idx) => {
            const rowAnimClass = shouldAnim ? 'payment-row-entry' : '';
            const rowAnimStyle = shouldAnim ? `style="--row-index: ${idx};"` : '';

            const dateStr = new Date(tx.display_time).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const cleanId = (tx.id || '').replace(/^(PAY-OUT-|pay-out-|WDR-|WD-|out-|INV-|inv-|PAY-|pay-)/i, '');
            const displayId = 'PAY-' + cleanId;

            if (tx.is_withdrawal) {
                // Outgoing withdrawal row
                const shortDest = tx.destination_address ? `${tx.destination_address.slice(0, 6)}...${tx.destination_address.slice(-6)}` : '';
                
                let statusBadge = '';
                if (tx.status === 'BROADCASTED') {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="ph-bold ph-broadcast"></i> BROADCASTED</span>`;
                } else if (tx.status === 'COMPLETED') {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="ph-fill ph-check-circle"></i> COMPLETED</span>`;
                } else {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><i class="ph ph-clock"></i> ${tx.status}</span>`;
                }

                const hopBadge = tx.is_secured_chain ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold mt-1">
                        <i class="ph-bold ph-shield-check"></i> ${tx.chain_hops_count} Intermediate Hops
                    </span>
                ` : '';

                return `
                    <tr class="hover:bg-purple-50/20 dark:hover:bg-purple-950/10 transition-colors border-b border-zinc-100 dark:border-zinc-800/60 ${rowAnimClass}" ${rowAnimStyle}>
                        <td class="py-4 px-4 whitespace-nowrap">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <i class="ph-bold ph-paper-plane-tilt"></i> SENT
                            </span>
                        </td>
                        <td class="py-4 px-4 font-mono font-bold text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
                            <button onclick="Payments.openWithdrawalDetailModal('${tx.id}')" class="hover:underline flex items-center gap-1">
                                ${displayId}
                                <i class="ph ph-arrow-up-right text-xs"></i>
                            </button>
                        </td>
                        <td class="py-4 px-4">
                            <div class="flex items-center gap-2.5">
                                ${CryptoIcons.get(tx.token_symbol || 'ltc', 24)}
                                <div>
                                    <div class="font-bold text-xs text-purple-600 dark:text-purple-400">-${tx.amount} ${tx.token_symbol}</div>
                                    ${tx.amount_usd > 0 ? `<div class="text-[11px] text-zinc-400 font-mono">~$${tx.amount_usd} USD</div>` : ''}
                                </div>
                            </div>
                        </td>
                        <td class="py-4 px-4">
                            <div class="text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 inline-block">
                                ${tx.network_name || tx.network_id}
                            </div>
                            ${tx.fee_total ? `<div class="text-[10px] text-zinc-400 mt-0.5">Fee: ${tx.fee_total} ${tx.token_symbol}</div>` : ''}
                        </td>
                        <td class="py-4 px-4">
                            <div class="flex items-center gap-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                <span>${shortDest}</span>
                                ${tx.destination_address ? `
                                    <button onclick="navigator.clipboard.writeText('${tx.destination_address}'); Toast.success('Recipient address copied!');" class="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 rounded" data-tooltip="Copy Address">
                                        <i class="ph ph-copy text-xs"></i>
                                    </button>
                                ` : ''}
                            </div>
                            ${hopBadge}
                        </td>
                        <td class="py-4 px-4">
                            ${statusBadge}
                        </td>
                        <td class="py-4 px-4 text-xs text-zinc-400 font-medium">
                            ${dateStr}
                        </td>
                        <td class="py-4 px-4 text-right">
                            <div class="flex items-center justify-end gap-1.5">
                                <button onclick="Payments.openWithdrawalDetailModal('${tx.id}')" class="p-2 text-zinc-500 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-tooltip="View Transfer Details">
                                    <i class="ph ph-eye text-base"></i>
                                </button>
                                ${tx.explorer_tx ? `
                                    <a href="${tx.explorer_tx}" target="_blank" class="p-2 text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-tooltip="View on Blockchain Explorer">
                                        <i class="ph ph-arrow-square-out text-base"></i>
                                    </a>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }

            // Incoming payment invoice row
            const reqConfs = tx.required_confirmations || 1;
            const curConfs = tx.confirmations || 0;

            let statusBadge = '';
            if (tx.status === 'PAID') {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><i class="ph-fill ph-check-circle"></i> PAID (${reqConfs}/${reqConfs})</span>`;
            } else if (tx.status === 'CONFIRMING') {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20"><i class="ph ph-spinner animate-spin"></i> CONFIRMING (${curConfs}/${reqConfs})</span>`;
            } else if (tx.status === 'EXPIRED') {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><i class="ph ph-clock-countdown"></i> EXPIRED</span>`;
            } else {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"><i class="ph ph-clock"></i> PENDING</span>`;
            }

            const amountStr = tx.currency ? (tx.amount > 0 ? `+${tx.amount} ${tx.currency}` : `Open (${tx.currency})`) : (tx.amount > 0 ? `+$${tx.amount} USD` : 'Open Blind');
            const shortAddr = tx.pay_address ? `${tx.pay_address.slice(0, 6)}...${tx.pay_address.slice(-4)}` : '<span class="text-zinc-400 italic">Pending selection</span>';

            const timerStr = tx.remaining_seconds > 0 ? `
                <div class="text-[10px] text-amber-500 font-mono flex items-center gap-1 mt-0.5">
                    <i class="ph ph-timer"></i>
                    <span id="pay-timer-${tx.id}">${Math.floor(tx.remaining_seconds / 60)}m ${tx.remaining_seconds % 60}s</span>
                </div>
            ` : '';

            return `
                <tr class="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors border-b border-zinc-100 dark:border-zinc-800/60 ${rowAnimClass}" ${rowAnimStyle}>
                    <td class="py-4 px-4 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center gap-1 w-max">
                            <i class="ph ph-arrow-down-left"></i> RECEIVED
                        </span>
                    </td>
                    <td class="py-4 px-4 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        <button onclick="Payments.openDetailModal('${tx.id}')" class="hover:underline flex items-center gap-1">
                            ${displayId}
                            <i class="ph ph-arrow-up-right text-xs"></i>
                        </button>
                    </td>
                    <td class="py-4 px-4">
                        <div class="flex items-center gap-2.5">
                            ${CryptoIcons.get(tx.currency || 'usdt', 24)}
                            <div>
                                <div class="font-bold text-xs text-zinc-900 dark:text-zinc-100">${amountStr}</div>
                                ${tx.amount_usd > 0 ? `<div class="text-[11px] text-zinc-400 font-mono">~$${tx.amount_usd} USD</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="py-4 px-4">
                        <div class="text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 inline-block">
                            ${tx.network_name || tx.network_id}
                        </div>
                        ${tx.gas_fee_est ? `<div class="text-[10px] text-zinc-400 mt-0.5">Fee: ${tx.gas_fee_est}</div>` : ''}
                    </td>
                    <td class="py-4 px-4">
                        <div class="flex items-center gap-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            <span>${shortAddr}</span>
                            ${tx.pay_address ? `
                                <button onclick="navigator.clipboard.writeText('${tx.pay_address}'); Toast.success('Address copied!');" class="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 rounded" data-tooltip="Copy Address">
                                    <i class="ph ph-copy text-xs"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                    <td class="py-4 px-4">
                        ${statusBadge}
                    </td>
                    <td class="py-4 px-4 text-xs text-zinc-400 font-medium">
                        ${dateStr}
                        ${timerStr}
                    </td>
                    <td class="py-4 px-4 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            ${tx.web_link ? `
                                <button onclick="Payments.copyPaymentLink('${tx.web_link}', 'Web Checkout Link')" class="p-2 text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-tooltip="Copy Web Checkout Link">
                                    <i class="ph ph-globe text-base"></i>
                                </button>
                            ` : ''}
                            ${tx.telegram_link ? `
                                <button onclick="Payments.copyPaymentLink('${tx.telegram_link}', 'Telegram Link')" class="p-2 text-zinc-500 hover:text-sky-500 dark:text-zinc-400 dark:hover:text-sky-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-tooltip="Copy Telegram Bot Link">
                                    <i class="ph-fill ph-telegram-logo text-base"></i>
                                </button>
                            ` : ''}
                            <button onclick="Payments.openDetailModal('${tx.id}')" class="p-2 text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-tooltip="View Details">
                                <i class="ph ph-eye text-base"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.shouldAnimateRows = false;
        this.renderPagination(totalPages);
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
        const container = document.getElementById('payments-pagination');
        if (!container) return;

        if (this.transactionsList.length <= this.perPage) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const startIdx = (this.page - 1) * this.perPage + 1;
        const endIdx = Math.min(this.page * this.perPage, this.transactionsList.length);
        const pageBtns = this.generatePageButtons(this.page, totalPages, 'Payments.setPage');

        container.innerHTML = `
            <div class="text-xs text-zinc-500 dark:text-zinc-400">
                Showing <span class="font-semibold text-zinc-800 dark:text-zinc-200">${startIdx}</span> to <span class="font-semibold text-zinc-800 dark:text-zinc-200">${endIdx}</span> of <span class="font-semibold text-zinc-800 dark:text-zinc-200">${this.transactionsList.length}</span> transactions
            </div>
            <div class="flex items-center gap-1.5 sm:gap-2">
                <button onclick="Payments.setPage(${this.page - 1})" ${this.page <= 1 ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <i class="ph ph-caret-left"></i> <span class="hidden sm:inline">Prev</span>
                </button>
                <div class="flex items-center gap-1">
                    ${pageBtns}
                </div>
                <button onclick="Payments.setPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 dark:text-zinc-600 opacity-50 cursor-not-allowed"' : 'class="px-2.5 sm:px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"'}>
                    <span class="hidden sm:inline">Next</span> <i class="ph ph-caret-right"></i>
                </button>
            </div>
        `;
    },

    setPage(p) {
        this.page = p;
        this.shouldAnimateRows = true;
        this.renderPaymentsTable();
    },

    copyPaymentLink(url, label) {
        if (!url) return;
        const formatted = window.Settings ? Settings.formatLink(url) : url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(formatted).then(() => {
                Toast.success(`${label || 'Link'} copied to clipboard!`);
            }).catch(() => {
                this.fallbackCopy(formatted, label);
            });
        } else {
            this.fallbackCopy(formatted, label);
        }
    },

    fallbackCopy(url, label) {
        const temp = document.createElement('textarea');
        temp.value = url;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        Toast.success(`${label || 'Link'} copied to clipboard!`);
    },

    async openDetailModal(paymentId) {
        try {
            const pay = await API.get(`/api/payments/${paymentId}`);
            this.currentDetailPayment = pay;

            document.getElementById('dt-pay-id').textContent = pay.id;
            document.getElementById('dt-pay-amount').textContent = pay.currency ? (pay.amount > 0 ? `${pay.amount} ${pay.currency}` : `Open (${pay.currency})`) : (pay.amount > 0 ? `$${pay.amount} USD` : 'Open');
            document.getElementById('dt-pay-network').textContent = pay.network_name || pay.network_id;
            document.getElementById('dt-pay-address').textContent = pay.pay_address || 'Pending client selection';
            document.getElementById('dt-pay-gas-fee').textContent = pay.gas_fee_est || 'Calculated on client choice';
            document.getElementById('dt-pay-confs').textContent = `${pay.confirmations || 0} / ${pay.required_confirmations || 1} Confirmations`;

            // Timer display
            const timerContainer = document.getElementById('dt-timer-container');
            if (pay.remaining_seconds > 0) {
                timerContainer.classList.remove('hidden');
                const m = Math.floor(pay.remaining_seconds / 60);
                const s = pay.remaining_seconds % 60;
                document.getElementById('dt-pay-timer').textContent = `${m}m ${s < 10 ? '0' : ''}${s}s`;
            } else {
                timerContainer.classList.add('hidden');
            }

            // QR code (if generated)
            const qrBox = document.getElementById('dt-qr-wrapper');
            if (pay.pay_address) {
                qrBox.classList.remove('hidden');
                document.getElementById('dt-pay-qr-img').src = `/api/payments/${pay.id}/qr.png?t=${Date.now()}`;
            } else {
                qrBox.classList.add('hidden');
            }

            // Links (formatted with custom domain if configured)
            const formattedWeb = window.Settings ? Settings.formatLink(pay.web_link) : pay.web_link;
            document.getElementById('dt-pay-web-input').value = formattedWeb;
            document.getElementById('dt-pay-tg-input').value = pay.telegram_link;
            document.getElementById('dt-open-web-btn').href = formattedWeb;
            document.getElementById('dt-open-tg-btn').href = pay.telegram_link;

            // Status Badge
            const stEl = document.getElementById('dt-pay-status');
            if (pay.status === 'PAID') {
                stEl.className = 'font-bold text-emerald-500 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph-fill ph-check-circle"></i> PAID & CONFIRMED`;
            } else if (pay.status === 'CONFIRMING') {
                stEl.className = 'font-bold text-amber-500 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph ph-spinner animate-spin"></i> CONFIRMING (${pay.confirmations || 0}/${pay.required_confirmations || 1})`;
            } else if (pay.status === 'EXPIRED') {
                stEl.className = 'font-bold text-rose-500 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph ph-x-circle"></i> EXPIRED`;
            } else {
                stEl.className = 'font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph ph-clock"></i> PENDING`;
            }

            // Tx hash
            const txBox = document.getElementById('dt-pay-tx-box');
            if (pay.tx_hash) {
                txBox.classList.remove('hidden');
                document.getElementById('dt-pay-tx-hash').textContent = pay.tx_hash;
                const expLink = document.getElementById('dt-pay-tx-explorer');
                if (pay.explorer_tx) {
                    expLink.href = pay.explorer_tx;
                    expLink.classList.remove('hidden');
                } else {
                    expLink.classList.add('hidden');
                }
            } else {
                txBox.classList.add('hidden');
            }

            // Render live blockchain and audit logs
            const logsCont = document.getElementById('dt-logs-container');
            const logsCount = document.getElementById('dt-logs-count');
            if (pay.logs && Array.isArray(pay.logs) && pay.logs.length > 0) {
                if (logsCount) logsCount.textContent = `${pay.logs.length} events`;
                if (logsCont) {
                    logsCont.innerHTML = pay.logs.map(log => {
                        const timeStr = log.created_at ? (log.created_at.split('T')[1]?.substring(0, 8) || log.created_at) : '';
                        let colorClass = 'text-zinc-500';
                        let icon = 'ph-info';
                        if (log.event_type === 'MEMPOOL_DETECTED') {
                            colorClass = 'text-amber-500';
                            icon = 'ph-clock';
                        } else if (log.event_type === 'CONFIRMATION_UPDATE' || log.event_type === 'PAYMENT_CONFIRMED') {
                            colorClass = 'text-emerald-500';
                            icon = 'ph-check-circle';
                        } else if (log.event_type === 'PAYMENT_EXPIRED') {
                            colorClass = 'text-rose-500';
                            icon = 'ph-warning';
                        }
                        return `
                            <div class="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-left">
                                <div class="flex items-center justify-between">
                                    <span class="font-bold flex items-center gap-1.5 ${colorClass}">
                                        <i class="ph ${icon}"></i>
                                        <span>${log.event_type}</span>
                                    </span>
                                    <span class="text-[10px] text-zinc-400 font-mono">${timeStr}</span>
                                </div>
                                <div class="text-zinc-700 dark:text-zinc-300 mt-1 break-all">${log.message}</div>
                                ${log.tx_hash ? `<div class="text-[10px] text-indigo-500 mt-0.5 break-all">Tx: ${log.tx_hash}</div>` : ''}
                            </div>
                        `;
                    }).join('');
                }
            } else {
                if (logsCount) logsCount.textContent = '0 logs';
                if (logsCont) logsCont.innerHTML = '<div class="text-zinc-400 italic text-center py-2">No blockchain logs recorded yet.</div>';
            }

            document.getElementById('dt-btn-download-qr').onclick = () => {
                const a = document.createElement('a');
                a.href = `/api/payments/${pay.id}/qr.png`;
                a.download = `${pay.id}-qr.png`;
                a.click();
                Toast.success('QR Code saved');
            };

            UI.openModal('modal-payment-detail');
        } catch (e) {
            Toast.error('Failed to load payment details');
        }
    },

    async openWithdrawalDetailModal(withdrawalId) {
        try {
            const w = await API.get(`/api/withdrawals/${withdrawalId}`);
            this.currentDetailWithdrawal = w;

            document.getElementById('wdr-dt-id').textContent = w.id;
            document.getElementById('wdr-dt-amount').textContent = `-${w.amount} ${w.token_symbol}`;
            document.getElementById('wdr-dt-usd').textContent = `~$${w.amount_usd || 0} USD`;
            document.getElementById('wdr-dt-network').textContent = w.network_name || w.network_id;
            document.getElementById('wdr-dt-dest').textContent = w.destination_address;
            document.getElementById('wdr-dt-fee').textContent = `${w.fee_total} ${w.token_symbol}`;
            document.getElementById('wdr-dt-created').textContent = new Date(w.created_at).toLocaleString();

            // Status badge
            const stEl = document.getElementById('wdr-dt-status');
            if (w.status === 'BROADCASTED') {
                stEl.className = 'font-bold text-emerald-500 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph-bold ph-broadcast"></i> BROADCASTED ON-CHAIN`;
            } else if (w.status === 'COMPLETED') {
                stEl.className = 'font-bold text-emerald-500 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph-fill ph-check-circle"></i> COMPLETED`;
            } else {
                stEl.className = 'font-bold text-zinc-400 flex items-center gap-1.5';
                stEl.innerHTML = `<i class="ph ph-clock"></i> ${w.status}`;
            }

            // Tx Hash & Explorer link
            const txEl = document.getElementById('wdr-dt-tx-hash');
            const expEl = document.getElementById('wdr-dt-explorer-btn');
            if (w.final_tx_hash) {
                txEl.textContent = w.final_tx_hash;
                if (w.explorer_tx) {
                    expEl.href = w.explorer_tx;
                    expEl.classList.remove('hidden');
                } else {
                    expEl.classList.add('hidden');
                }
            } else {
                txEl.textContent = 'Awaiting broadcast';
                expEl.classList.add('hidden');
            }

            // Hops Section
            const hopsBox = document.getElementById('wdr-dt-hops-section');
            const hopsList = document.getElementById('wdr-dt-hops-list');
            if (w.is_secured_chain && w.hops && w.hops.length > 0) {
                hopsBox.classList.remove('hidden');
                document.getElementById('wdr-dt-hops-count').textContent = `${w.hops.length} Steps`;
                hopsList.innerHTML = w.hops.map((hop, idx) => `
                    <div class="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                        <div class="flex items-center justify-between text-xs">
                            <span class="font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                                <span class="w-5 h-5 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px]">${idx + 1}</span>
                                <span>Hop #${hop.hop_index} Transfer</span>
                            </span>
                            <span class="text-[10px] font-bold text-emerald-500 uppercase">${hop.status}</span>
                        </div>
                        <div class="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                            <div>From: <span class="select-all">${hop.from_address}</span></div>
                            <div>To: <span class="select-all">${hop.to_address}</span></div>
                        </div>
                        ${hop.tx_hash ? `
                            <div class="pt-1 flex items-center justify-between text-[10px]">
                                <span class="font-mono text-zinc-400">Tx: ${hop.tx_hash.slice(0, 10)}...${hop.tx_hash.slice(-8)}</span>
                                ${hop.explorer_tx ? `<a href="${hop.explorer_tx}" target="_blank" class="text-indigo-500 hover:underline">Explorer &rarr;</a>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `).join('');
            } else {
                hopsBox.classList.add('hidden');
            }

            UI.openModal('modal-withdrawal-detail');
        } catch (e) {
            Toast.error('Failed to load withdrawal details');
        }
    },

    async simulateCurrentDetail() {
        if (!this.currentDetailPayment) return;
        await this.simulateSingle(this.currentDetailPayment.id);
        await this.openDetailModal(this.currentDetailPayment.id);
    },

    async simulateSingle(paymentId) {
        try {
            const updated = await API.post(`/api/payments/${paymentId}/simulate`);
            Toast.info(`Payment ${paymentId}: Status is now ${updated.status}`);
            await this.loadPayments(false);
            if (window.App) App.renderStats();
        } catch (e) {
            Toast.error('Simulation failed');
        }
    }
};

window.Payments = Payments;
