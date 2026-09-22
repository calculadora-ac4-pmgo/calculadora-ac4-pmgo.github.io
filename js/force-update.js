if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      reg.unregister();
      console.info('AC4: Service Worker v64 desregistrado, v65 será carregado');
    });
    try {
      localStorage.removeItem('pmgoNovidadesVistas');
      console.info('AC4: Modal de novidades v65 será mostrado');
    } catch (e) { console.error('Erro ao limpar novidades:', e); }
  });
}
