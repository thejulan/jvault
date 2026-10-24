// JVault Service Worker for PWA Installation and Asset Caching
const CACHE_NAME = 'jvault-cache-v1';
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/static/icons/icon.svg',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/api.js',
    '/static/js/wallets.js',
    '/static/js/payments.js',
    '/static/js/fast_receive.js',
    '/static/js/dropdowns.js',
    '/static/js/modals.js',
    '/static/js/theme.js',
    '/static/js/toast.js',
    '/static/js/icons.js',
    '/static/js/price_ticker.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Network-first strategy for API calls, stale-while-revalidate for static assets
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/')) {
        return; // Always fetch API dynamically
    }

    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});
