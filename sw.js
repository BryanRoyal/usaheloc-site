/* usaheloc.com service worker (tools/build_live.py, 2026-11-03).
   The front-door engine registers 'sw.js' on https. This one keeps NO offline shell:
   it installs, clears any cache an earlier worker left, and handles no fetches, so the
   browser always goes to the network. Nothing from the Royal shell lives here. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
