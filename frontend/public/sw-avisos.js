/*
 * O AVISO NO CELULAR (fase 189), dentro do service worker do aplicativo.
 *
 * O servidor manda só o título neutro: "Rede Acolher" e "Há um aviso para você
 * na Casa 03". Este arquivo não sabe mais que isso, e não pede mais nada ao
 * servidor: o que é o aviso, a pessoa vê depois de entrar.
 */
self.addEventListener('push', (evento) => {
  let aviso = { titulo: 'Rede Acolher', texto: 'Há um aviso para você.', marca: 'rede-acolher:geral' };
  try { if (evento.data) aviso = { ...aviso, ...evento.data.json() }; } catch (e) { /* fica o texto neutro */ }
  evento.waitUntil(self.registration.showNotification(aviso.titulo, {
    body: aviso.texto,
    tag: aviso.marca,
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'pt-BR',
  }));
});

/* Tocar no aviso abre o sistema (ou traz para a frente o que já está aberto). */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/');
  })());
});
