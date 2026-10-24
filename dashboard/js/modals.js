// Custom Modals, Dropdowns, and Tooltips Manager
const UI = {
    activeModal: null,

    init() {
        // Global escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.activeModal === 'modal-self-destroy') return;
                this.closeAllModals();
                this.closeAllDropdowns();
            }
        });

        // Global click to close dropdowns and backdrop clicks
        document.addEventListener('click', (e) => {
            // Dropdowns
            if (!e.target.closest('.dropdown-container')) {
                this.closeAllDropdowns();
            }

            // Wallet card color palette sticky dropdowns
            if (!e.target.closest('.color-palette-menu') && !e.target.closest('.btn-color-palette')) {
                document.querySelectorAll('[id^="color-dropdown-"]').forEach(d => d.classList.add('hidden'));
                document.querySelectorAll('.wallet-actions-group').forEach(g => g.classList.remove('palette-open'));
            }

            // Modal backdrops
            if (e.target.classList.contains('modal-backdrop')) {
                const modal = e.target.closest('.modal-root');
                if (modal && modal.id !== 'modal-self-destroy') {
                    this.closeModal(modal.id);
                }
            }
        });

        this.initTooltips();
    },

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('modal-hidden');
        modal.classList.remove('hidden');
        this.activeModal = modalId;
        document.body.classList.add('overflow-hidden');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('modal-hidden');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 200);
        this.activeModal = null;
        document.body.classList.remove('overflow-hidden');
    },

    closeAllModals() {
        document.querySelectorAll('.modal-root').forEach(m => {
            m.classList.add('modal-hidden');
            setTimeout(() => m.classList.add('hidden'), 200);
        });
        this.activeModal = null;
        document.body.classList.remove('overflow-hidden');
    },

    toggleDropdown(dropdownId) {
        const dd = document.getElementById(dropdownId);
        if (!dd) return;
        const isHidden = dd.classList.contains('hidden');
        this.closeAllDropdowns();
        if (isHidden) {
            dd.classList.remove('hidden');
        }
    },

    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden'));
    },

    initTooltips() {
        let tooltipEl = document.getElementById('global-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'global-tooltip';
            tooltipEl.className = 'tooltip-box hidden px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xl border border-zinc-700/50 dark:border-zinc-300';
            document.body.appendChild(tooltipEl);
        }

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip], [title]');
            if (!target) {
                tooltipEl.classList.add('hidden');
                return;
            }
            if (target.hasAttribute('title')) {
                const t = target.getAttribute('title');
                if (t && !target.hasAttribute('data-tooltip')) {
                    target.setAttribute('data-tooltip', t);
                }
                target.removeAttribute('title');
            }
            const text = target.getAttribute('data-tooltip');
            if (!text) return;

            tooltipEl.textContent = text;
            tooltipEl.classList.remove('hidden');

            const rect = target.getBoundingClientRect();
            const isNavbar = !!target.closest('header, nav, #header');
            let top;
            if (isNavbar || (rect.top - tooltipEl.offsetHeight - 6) < 10) {
                // Show below element in navbar so text is fully visible and not cut off
                top = rect.bottom + 8;
            } else {
                top = rect.top - tooltipEl.offsetHeight - 6;
            }
            let left = rect.left + (rect.width / 2) - (tooltipEl.offsetWidth / 2);
            left = Math.max(8, Math.min(left, window.innerWidth - tooltipEl.offsetWidth - 8));

            tooltipEl.style.top = `${top}px`;
            tooltipEl.style.left = `${left}px`;
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip], [title]');
            if (target) {
                tooltipEl.classList.add('hidden');
            }
        });
    },

    setupOtpInputs(containerId, onValidate) {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;
        const inputs = Array.from(container.querySelectorAll('input'));

        if (!container._otpBound) {
            container._otpBound = true;

            inputs.forEach((input, idx) => {
                input.addEventListener('input', () => {
                    input.value = input.value.slice(-1).toUpperCase();
                    if (input.value && idx < inputs.length - 1) {
                        inputs[idx + 1].focus();
                        inputs[idx + 1].select();
                    }
                    if (typeof onValidate === 'function') onValidate(this.getOtpValue(container));
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace') {
                        if (!input.value && idx > 0) {
                            inputs[idx - 1].focus();
                            inputs[idx - 1].value = '';
                            e.preventDefault();
                            if (typeof onValidate === 'function') onValidate(this.getOtpValue(container));
                        } else {
                            input.value = '';
                            if (typeof onValidate === 'function') onValidate(this.getOtpValue(container));
                        }
                    } else if (e.key === 'ArrowLeft' && idx > 0) {
                        inputs[idx - 1].focus();
                        e.preventDefault();
                    } else if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
                        inputs[idx + 1].focus();
                        e.preventDefault();
                    }
                });

                input.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (!pasteData) return;
                    for (let i = 0; i < inputs.length; i++) {
                        if (i < pasteData.length) {
                            inputs[i].value = pasteData.charAt(i);
                        }
                    }
                    const targetIdx = Math.min(pasteData.length, inputs.length - 1);
                    inputs[targetIdx].focus();
                    if (typeof onValidate === 'function') onValidate(this.getOtpValue(container));
                });
            });
        }

        // Store active validator callback if provided
        container._onValidate = onValidate;
    },

    getOtpValue(containerId) {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return '';
        const inputs = Array.from(container.querySelectorAll('input'));
        return inputs.map(i => i.value.trim()).join('').toUpperCase();
    },

    clearOtpInputs(containerId) {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;
        const inputs = Array.from(container.querySelectorAll('input'));
        inputs.forEach(inp => { inp.value = ''; });
    }
};

window.UI = UI;
