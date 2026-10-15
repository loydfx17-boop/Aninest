const C="aninest-v1",F=["./","index.html","manifest.json","config.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);
 if(e.request.method!=="GET")return;
 if(u.pathname.startsWith("/api/")){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));return}
 e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)))});
