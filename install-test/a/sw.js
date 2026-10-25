// Leerer Service Worker: sorgt nur dafür, dass der Haupt-Service-Worker diese Testseite nicht steuert.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
