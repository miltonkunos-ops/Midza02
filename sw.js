const CACHE = "stp-shell-v3";
const RT = "stp-runtime-v1";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

// Install Event - Pre-cache essential app shell assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old cache versions automatically
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks.filter((k) => k !== CACHE && k !== RT).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event - Handle caching strategy based on request type
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);

  // 1. Firebase / External CDN scripts (Runtime Cache)
  if (
    u.hostname === "www.gstatic.com" &&
    u.pathname.indexOf("/firebasejs/") === 0
  ) {
    e.respondWith(
      caches.open(RT).then((c) =>
        c.match(r).then(
          (hit) =>
            hit ||
            fetch(r).then((res) => {
              c.put(r, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  if (u.origin !== location.origin) return;

  // 2. Main Page Navigation (index.html) -> Network-First
  // Guarantees app updates load immediately without wiping browser storage
  if (
    r.mode === "navigate" ||
    u.pathname.endsWith("/") ||
    u.pathname.endsWith("/index.html")
  ) {
    e.respondWith(
      fetch(r)
        .then((res) => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(r, cp));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(r, { ignoreSearch: true })
            .then((hit) => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // 3. Static Assets (Icons, Manifest) -> Cache-First with Background Update
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then((hit) => {
      const net = fetch(r)
        .then((res) => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(r, cp));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

