// Service worker do EntendAI (PWA).
// - Páginas e arquivos do site: tenta a rede primeiro (sempre a versão mais nova) e usa a cópia guardada se estiver sem internet.
// - Imagens: usa a cópia guardada e atualiza em segundo plano.
// - NUNCA mexe em chamadas de dados (Supabase, funções, IA): essas sempre vão direto para a rede.
// Para forçar a atualização do cache, aumente a VERSAO.
const VERSAO = "entendai-v1";
const CACHE = VERSAO;

const PRE_CACHE = [
  "./",
  "index.html",
  "atendente.html",
  "offline.html",
  "manifest.webmanifest",
  "manifest-atendente.webmanifest",
  "css/style.css",
  "js/config.js",
  "js/app.js",
  "js/recursos.js",
  "js/codigo.js",
  "js/atendente.js",
  "js/pwa.js",
  "vendor/qrcode.min.js",
  "img/logo.webp",
  "img/logo-nome.webp",
  "img/logo-jf-df.webp",
  "img/logo-jf-texto.webp",
  "img/escuro/logo.webp",
  "img/escuro/logo-nome.webp",
  "img/escuro/logo-jf-df.webp",
  "img/escuro/logo-jf-texto.webp",
  "img/favicon-64.png",
  "img/apple-touch-icon.png",
  "img/pwa/icon-192.png",
  "img/pwa/icon-512.png",
];

// Bibliotecas de CDN pequenas que o site carrega ao abrir (para a tela abrir mesmo sem internet)
const CDN_OK = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/.*(supabase|marked|purify)/i;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // um arquivo que falhe não deve impedir a instalação
      Promise.all(PRE_CACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("entendai-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function redeDepoisCache(req, fallbackNavegacao) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok && resp.type !== "opaque") cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    if (fallbackNavegacao) {
      return (await cache.match("offline.html")) || new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw err;
  }
}

async function cacheDepoisRede(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  const atualiza = fetch(req).then((resp) => { if (resp && resp.ok) cache.put(req, resp.clone()); return resp; }).catch(() => null);
  return guardado || (await atualiza) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // CDN de bibliotecas pequenas
  if (url.origin !== self.location.origin) {
    if (CDN_OK.test(req.url)) e.respondWith(cacheDepoisRede(req));
    return;   // todo o resto (Supabase, IA, etc.) passa direto, sem cache
  }

  // Voz local (arquivos grandes): o próprio recurso de voz guarda o que precisa
  if (url.pathname.includes("/vendor/piper/")) return;

  if (req.mode === "navigate") { e.respondWith(redeDepoisCache(req, true)); return; }
  if (/\.(?:webp|png|jpg|jpeg|svg|ico)$/i.test(url.pathname)) { e.respondWith(cacheDepoisRede(req)); return; }
  e.respondWith(redeDepoisCache(req, false));
});
