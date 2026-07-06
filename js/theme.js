/* Aplica o tema antes do primeiro paint — carregado de forma síncrona no <head>.
   Externo (não inline) para permitir CSP com script-src 'self'. */
(function () {
  try {
    var t = localStorage.getItem('pmgoTheme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
