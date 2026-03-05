const CACHE = 'dice-dungeon-v1';
const SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/constants.js',
    './js/state.js',
    './js/engine.js',
    './js/combat.js',
    './js/screens.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c =>
            Promise.all(SHELL.map(url =>
                fetch(url).then(r => {
                    if (r.ok) return c.put(url, r);
                }).catch(() => {})
            ))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Let Google Fonts and external resources go to network only
    if (e.request.url.includes('fonts.googleapis.com') ||
        e.request.url.includes('fonts.gstatic.com')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // Cache successful GET responses for app assets
                if (response.ok && e.request.method === 'GET') {
                    const url = new URL(e.request.url);
                    if (url.origin === self.location.origin) {
                        const clone = response.clone();
                        caches.open(CACHE).then(c => c.put(e.request, clone));
                    }
                }
                return response;
            });
        })
    );
});
