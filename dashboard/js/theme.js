// Theme Controller (Dark / Light mode)
const Theme = {
    current: 'dark',

    init() {
        const saved = localStorage.getItem('jvault_theme');
        if (saved) {
            this.current = saved;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            this.current = 'light';
        } else {
            this.current = 'dark';
        }
        this.apply();
    },

    toggle() {
        this.current = this.current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('jvault_theme', this.current);
        this.apply();
        Toast.info(`Switched to ${this.current} mode`, 1800);
    },

    apply() {
        const root = document.documentElement;
        const icon = document.getElementById('theme-toggle-icon');
        const logoPath = this.current === 'dark' ? '/static/assets/logo_inverted.png' : '/static/assets/logo.png';

        if (this.current === 'dark') {
            root.classList.add('dark');
            if (icon) {
                icon.className = 'ph ph-sun text-xl text-amber-400';
            }
        } else {
            root.classList.remove('dark');
            if (icon) {
                icon.className = 'ph ph-moon text-xl text-zinc-600';
            }
        }

        document.querySelectorAll('.jvault-logo-img').forEach(img => {
            img.src = logoPath;
        });
    }
};

window.Theme = Theme;
