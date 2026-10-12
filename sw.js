/* Our Hub — the service worker (Drop 8).
   It does one job: when a notification arrives, ask the hub what's new and show it.
   The push itself is empty, so the words come from the script, which only ever
   says what's already in the bell. Nothing is cached, so the app is never stale. */
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

function cfg(){
  return caches.open("hub-push").then(function(c){ return c.match("cfg"); }).then(function(r){ return r ? r.json() : null; });
}
self.addEventListener("push", function(e){
  e.waitUntil(cfg().then(function(c){
    if (!c || !c.exec) return null;
    var url = c.exec + (c.exec.indexOf("?") < 0 ? "?" : "&") + "push=latest&code=" + encodeURIComponent(c.code || "") + "&me=" + encodeURIComponent(c.me || "");
    return fetch(url, {credentials: "omit"}).then(function(r){ return r.json(); });
  }).catch(function(){ return null; }).then(function(j){
    var title = (j && j.title) || "Our Hub", body = (j && j.body) || "Something’s new in the hub.";
    var n = j && typeof j.count === "number" ? j.count : 0;
    try { if (n > 0 && self.navigator.setAppBadge) self.navigator.setAppBadge(n); } catch (err) {}
    return self.registration.showNotification(title, {body: body, tag: (j && j.tag) || "hub", renotify: true, icon: "icon-180.png", badge: "icon-180.png"});
  }));
});
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(function(cs){
    for (var i = 0; i < cs.length; i++) { if ("focus" in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow("./");
  }));
});
