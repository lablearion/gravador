// Service worker MÍNIMO — existe para satisfazer o critério de "instalável" (o beforeinstallprompt do
// Chrome/Android espera um SW com handler de fetch). NÃO faz cache: o app exige internet (Supabase +
// Google) e cachear respostas quebraria auth/cache nativo do Next (DEC-018). Por isso o fetch é
// passthrough (não chama respondWith) — registra o handler sem alterar nenhuma resposta.
// Atualização: skipWaiting + clients.claim para a nova versão assumir sem precisar fechar o app.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handler presente de propósito (passthrough). Não intercepta nem cacheia nada.
self.addEventListener("fetch", () => {});
