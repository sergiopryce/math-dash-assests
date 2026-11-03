// Offline cache so the game works without a connection once installed.
const CACHE = 'mathdash-v3';
const FILES = [
  './', 'index.html', 'style.css', 'js/data.js', 'js/save.js', 'js/audio.js', 'js/game.js', 'js/ui.js', 'manifest.webmanifest',
  'assets/icon-192.png', 'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
