/* Our Hub — the service worker (Drop 8, V11).
   When a notification arrives, it asks the hub what's new and shows it. The push
   itself is empty, so the words come from the script.
   V11: it also keeps a copy of the app (app.html), so the hub opens instantly. It
   opens the copy, checks GitHub for a newer one at the same time, and if there is
   one, keeps it and tells the hub, which offers to restart into it. */
var APP = "hub-app-v1";
/* keep a copy of the app straight away, so even the second open is instant (it's
   fine if this fails: the first time the hub opens through here it keeps one) */
self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(APP).then(function(c){
    var u = new URL("app.html", self.location.href).href;
    return fetch(u, {cache: "no-store"}).then(function(r){ if (r && r.ok) return c.put(new Request(u), r); });
  }).catch(function(){}));
});
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
function sig(r){ return r ? (r.headers.get("etag") || r.headers.get("last-modified") || r.headers.get("content-length") || "") : ""; }
/* V12.2: Our Hub in the Share menu (Android). The share arrives here as a form; it's kept for a few
   minutes, and the hub opens and asks for it (?go=share122). A picture is kept as base64, at most 6 MB. */
function b64of(buf){ var b = new Uint8Array(buf), s = "", i; for (i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
self.addEventListener("fetch", function(e){
  var u = new URL(e.request.url);
  if (e.request.method !== "POST" || u.origin !== self.location.origin || !/\/share$/.test(u.pathname)) return;
  e.respondWith(e.request.formData().then(function(f){
    var out = {title: String(f.get("title") || ""), text: String(f.get("text") || ""), url: String(f.get("url") || ""), at: Date.now()};
    var file = f.get("file");
    var pic = file && file.size && file.size < 6000000 && /^image\//.test(file.type) ? file.arrayBuffer().then(function(b){ out.file = {type: file.type, b64: b64of(b)}; }) : Promise.resolve();
    return pic.then(function(){ return caches.open("hub-share"); }).then(function(c){ return c.put("last", new Response(JSON.stringify(out), {headers: {"Content-Type": "application/json"}})); });
  }).catch(function(){}).then(function(){ return Response.redirect(new URL("./?go=share122", self.location.href).href, 303); }));
});
self.addEventListener("fetch", function(e){
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin || !/\/app\.html$/.test(u.pathname)) return;
  var key = new Request(u.origin + u.pathname);
  e.respondWith(caches.open(APP).then(function(c){
    return c.match(key).then(function(hit){
      var net = fetch(key, {cache: "no-store"}).then(function(r){
        if (r && r.ok) {
          var copy = r.clone();
          c.put(key, copy).then(function(){
            if (hit && sig(hit) !== sig(r)) self.clients.matchAll({type: "window"}).then(function(cs){ cs.forEach(function(cl){ try{ cl.postMessage({hub: "update"}); }catch(err){} }); });
          });
        }
        return r;
      });
      if (hit) { e.waitUntil(net.catch(function(){})); return hit; }
      return net;
    });
  }));
});

function cfg(){
  return caches.open("hub-push").then(function(c){ return c.match("cfg"); }).then(function(r){ return r ? r.json() : null; });
}
self.addEventListener("push", function(e){
  e.waitUntil(cfg().then(function(c){
    /* V12: this device's own key; the script works out whose it is from that */
    if (!c || !c.exec || !c.k) return null;
    var url = c.exec + (c.exec.indexOf("?") < 0 ? "?" : "&") + "push=latest&k=" + encodeURIComponent(c.k);
    return fetch(url, {credentials: "omit"}).then(function(r){ return r.json(); });
  }).catch(function(){ return null; }).then(function(j){
    var title = (j && j.title) || "Our Hub", body = (j && j.body) || "Something’s new in the hub.";
    var n = j && typeof j.count === "number" ? j.count : 0;
    try { if (n > 0 && self.navigator.setAppBadge) self.navigator.setAppBadge(n); } catch (err) {}
    var opts = {body: body, tag: (j && j.tag) || "hub", renotify: true, icon: "icon-180.png", badge: "icon-180.png", data: {go: (j && j.go) || ""}};
    /* V11.6: an ask carries Yes / No (Android shows them; iPhone opens the hub) */
    if (j && Array.isArray(j.actions) && j.actions.length) opts.actions = j.actions.slice(0, 2);
    return self.registration.showNotification(title, opts);
  }));
});
/* Drop 10.8: tapping a notification opens the thing it's about, not just the hub */
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var go = (e.notification.data && e.notification.data.go) || "";
  if (go && e.action) go = go + ":" + e.action;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(function(cs){
    for (var i = 0; i < cs.length; i++) { if ("focus" in cs[i]) { if (go) { try { cs[i].postMessage({hub: "go", go: go}); } catch (err) {} } return cs[i].focus(); } }
    return self.clients.openWindow("./" + (go ? "?go=" + encodeURIComponent(go) : ""));
  }));
});
