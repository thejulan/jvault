// AJAX API Client (Zero Page Reloads)
const API = {
    baseUrl: '',

    getToken() {
        return localStorage.getItem('jvault_token') || '';
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('jvault_token', token);
        } else {
            localStorage.removeItem('jvault_token');
        }
    },

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const res = await fetch(`${this.baseUrl}${endpoint}`, {
                cache: 'no-store',
                ...options,
                headers
            });

            if (res.status === 401) {
                // If unauthorized and not already on auth check, clear token
                if (endpoint !== '/api/auth/login') {
                    this.setToken(null);
                    if (window.Auth) {
                        Auth.showLogin();
                    }
                }
                const errData = await res.json().catch(() => ({ detail: 'Unauthorized' }));
                throw new Error(errData.detail || 'Unauthorized');
            }

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: `HTTP error ${res.status}` }));
                throw new Error(errData.detail || `Request failed with code ${res.status}`);
            }

            return await res.json();
        } catch (err) {
            console.error(`API Error on [${endpoint}]:`, err);
            throw err;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    }
};

window.API = API;
