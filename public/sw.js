// Service worker mínimo — existe só pra satisfazer o critério de instalabilidade do
// Chrome/Android ("Adicionar à tela de início"). Este é um CRM de atendimento ao vivo,
// então não faz sentido cachear dados/mensagens: toda requisição segue direto pra rede.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Intencionalmente vazio — deixa o navegador seguir com o fetch normal.
})
