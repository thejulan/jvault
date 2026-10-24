// Production Authentication Controller (AJAX Login/Logout)
const Auth = {
    user: null,

    init() {
        this.checkAdminStatus();
        const token = API.getToken();
        if (token) {
            this.showDashboard();
            this.checkSession();
        } else {
            this.showLogin();
        }

        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.onsubmit = (e) => {
                if (e) e.preventDefault();
                this.handleLogin(e);
                return false;
            };
        }
    },

    async checkAdminStatus() {
        try {
            const res = await API.get('/api/auth/status');
            const noticeBox = document.getElementById('admin-setup-notice');
            if (noticeBox) {
                if (!res.has_admin) {
                    noticeBox.classList.remove('hidden');
                } else {
                    noticeBox.classList.add('hidden');
                }
            }
        } catch (e) {
            console.error('Could not check admin status', e);
        }
    },

    async checkSession() {
        try {
            const me = await API.get('/api/auth/me');
            this.user = me;
            const nameEl = document.getElementById('nav-user-name');
            if (nameEl && this.user) {
                nameEl.textContent = this.user.username;
            }
        } catch (e) {
            API.setToken(null);
            this.showLogin();
        }
    },

    async handleLogin(e) {
        if (e && e.preventDefault) e.preventDefault();

        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const submitBtn = document.getElementById('login-submit-btn');

        if (!usernameInput || !passwordInput) return false;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            Toast.warning('Please enter both username and password');
            return false;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> Authenticating...`;
            }

            const res = await API.post('/api/auth/login', { username, password });
            API.setToken(res.token);
            this.user = res.user;

            Toast.success(`Welcome back, ${res.user.username}!`);

            // Clean up any stray ? in url
            if (window.location.search) {
                const cleanUrl = window.location.pathname + (window.location.hash || '');
                window.history.replaceState(null, '', cleanUrl);
            }

            this.showDashboard();

            if (window.App) {
                await App.initRouting();
            }
            return false;
        } catch (err) {
            Toast.error(err.message || 'Login failed. Please check credentials.');
            return false;
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Sign In to JVault</span> <i class="ph ph-arrow-right text-lg"></i>`;
            }
        }
    },

    logout() {
        API.setToken(null);
        this.user = null;
        Toast.info('You have been logged out');
        this.showLogin();
    },

    showLogin() {
        document.documentElement.classList.remove('is-authenticated');
        const loginEl = document.getElementById('view-login');
        const dashEl = document.getElementById('view-dashboard');
        if (loginEl) loginEl.classList.remove('hidden');
        if (dashEl) dashEl.classList.add('hidden');
        const launcher = document.getElementById('floating-price-launcher');
        if (launcher) launcher.classList.add('hidden');
        const priceModal = document.getElementById('floating-price-modal');
        if (priceModal) priceModal.classList.add('hidden');
    },

    showDashboard() {
        document.documentElement.classList.add('is-authenticated');
        const loginEl = document.getElementById('view-login');
        const dashEl = document.getElementById('view-dashboard');
        if (loginEl) loginEl.classList.add('hidden');
        if (dashEl) dashEl.classList.remove('hidden');
        const launcher = document.getElementById('floating-price-launcher');
        if (launcher) launcher.classList.remove('hidden');
        const nameEl = document.getElementById('nav-user-name');
        if (nameEl && this.user) {
            nameEl.textContent = this.user.username;
        }
        if (window.location.search) {
            const cleanUrl = window.location.pathname + (window.location.hash || '');
            window.history.replaceState(null, '', cleanUrl);
        }
    }
};

window.Auth = Auth;
