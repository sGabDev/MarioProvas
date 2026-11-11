const CACHE = 'marioprovas-shell-v1';
const FILES = ['./offline.html', './assets/app.css', './assets/icon-192.png', './assets/icon-512.png'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))));
self.addEventListener('activate', (event) =>
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    ),
);
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;
    if (FILES.some((f) => new URL(f, self.registration.scope).href === url.href)) {
        event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
        return;
    }
    if (event.request.mode === 'navigate')
        event.respondWith(fetch(event.request).catch(() => caches.match('./offline.html')));
});
