// Custom Toast Notification System
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toast-container';
                document.body.appendChild(this.container);
            }
        }
    },

    show(message, type = 'info', duration = 3800, title = '') {
        this.init();

        const toast = document.createElement('div');
        toast.className = 'toast-item pointer-events-auto flex items-center gap-3.5 px-4 py-3 rounded-2xl shadow-2xl border text-sm transition-all duration-300 relative overflow-hidden backdrop-blur-xl';

        let iconHtml = '';
        let typeClasses = '';

        const normalizedType = (type === 'danger') ? 'error' : type;

        if (normalizedType === 'success') {
            typeClasses = 'bg-white/95 dark:bg-zinc-900/95 border-emerald-500/30 text-zinc-800 dark:text-zinc-100 shadow-emerald-500/10';
            iconHtml = `<div class="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0"><i class="ph-bold ph-check-circle text-lg"></i></div>`;
        } else if (normalizedType === 'error') {
            typeClasses = 'bg-white/95 dark:bg-zinc-900/95 border-rose-500/30 text-zinc-800 dark:text-zinc-100 shadow-rose-500/10';
            iconHtml = `<div class="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0"><i class="ph-bold ph-warning-circle text-lg"></i></div>`;
        } else if (normalizedType === 'warning') {
            typeClasses = 'bg-white/95 dark:bg-zinc-900/95 border-amber-500/30 text-zinc-800 dark:text-zinc-100 shadow-amber-500/10';
            iconHtml = `<div class="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0"><i class="ph-bold ph-warning text-lg"></i></div>`;
        } else {
            typeClasses = 'bg-white/95 dark:bg-zinc-900/95 border-indigo-500/30 text-zinc-800 dark:text-zinc-100 shadow-indigo-500/10';
            iconHtml = `<div class="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0"><i class="ph-bold ph-info text-lg"></i></div>`;
        }

        toast.className += ' ' + typeClasses;

        const titleHtml = title ? `<div class="font-bold text-xs uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-0.5 leading-tight text-left">${title}</div>` : '';

        toast.innerHTML = `
            ${iconHtml}
            <div class="flex-1 min-w-0 pr-1 flex flex-col justify-center text-left">
                ${titleHtml}
                <div class="text-xs text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed">${message}</div>
            </div>
            <button class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors shrink-0 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center">
                <i class="ph ph-x text-base"></i>
            </button>
            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-current opacity-25 origin-left" style="animation: toast-timer ${duration}ms linear forwards;"></div>
        `;

        const closeBtn = toast.querySelector('button');
        const removeToast = () => {
            toast.style.animation = 'toast-slide-out 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => {
                if (toast.parentElement) toast.parentElement.removeChild(toast);
            }, 250);
        };

        closeBtn.addEventListener('click', removeToast);
        setTimeout(removeToast, duration);

        this.container.appendChild(toast);
    },

    success(msg, duration, title) { this.show(msg, 'success', duration, title); },
    error(msg, duration, title) { this.show(msg, 'error', duration, title); },
    danger(msg, duration, title) { this.show(msg, 'danger', duration, title); },
    warning(msg, duration, title) { this.show(msg, 'warning', duration, title); },
    info(msg, duration, title) { this.show(msg, 'info', duration, title); }
};

window.Toast = Toast;
