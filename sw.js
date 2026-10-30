// Service worker: permite instalar o app e abrir a tela mesmo com internet fraca.
// Sempre tenta buscar a versão nova primeiro; usa a cópia salva só se estiver sem conexão.
const CACHE = 'viagens-despesas-v2';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'styles.css', 'relatorio.js', 'modelo_relatorio.xlsx',
  'logo_quimicer.png', 'icone-192.png', 'icone-512.png', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // dados do Supabase nunca ficam salvos aqui
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
