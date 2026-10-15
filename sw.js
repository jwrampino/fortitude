/* Network-first: always fetch fresh when online, fall back to cache offline.
   No version number to bump. */
var CACHE = "fortitude";
var CORE = ["./", "index.html", "style.css", "engine.js", "expert-weights.js", "expert.js", "game.js", "net.js", "peerjs.min.js",
  "manifest.webmanifest", "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") return;
  var same = u.origin === self.location.origin;
  var font = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (!same && !font) return;
  e.respondWith(
    fetch(r).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(r).then(function (m) { return m || (r.mode === "navigate" ? caches.match("index.html") : Response.error()); });
    })
  );
});
