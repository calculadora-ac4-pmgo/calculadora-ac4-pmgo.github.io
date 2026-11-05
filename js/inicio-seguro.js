/* Calculadora AC4 — aviso de carregamento (v87)
   Script clássico e independente dos módulos: funciona mesmo quando o app não
   consegue iniciar (ex.: atualização interrompida pela rede, com arquivos de versões
   diferentes). Se o <html> continuar com .app-pending depois do limite, ou se um
   script falhar ao carregar, mostra o aviso com o botão Recarregar, que apaga as
   cópias guardadas (se houver internet) e recarrega a versão publicada.
   Os dados (localStorage) não são tocados. Nunca recarrega sozinho. */
(function () {
  var LIMITE_MS = 10000;
  var raiz = document.documentElement;
  var carregou = function () { return !raiz.classList.contains('app-pending'); };

  function mostrar() {
    if (carregou()) return;
    var aviso = document.getElementById('avisoCarregamento');
    if (aviso) aviso.classList.remove('hidden');
  }

  function esconderSeCarregou() {
    if (!carregou()) return;
    var aviso = document.getElementById('avisoCarregamento');
    if (aviso) aviso.classList.add('hidden');
  }

  function recarregar() {
    var botao = document.getElementById('avisoCarregamentoRecarregar');
    if (botao) { botao.disabled = true; botao.textContent = 'Recarregando…'; }
    var ir = function () { window.location.reload(); };
    var cofre = window.caches;
    if (navigator.onLine !== false && cofre && cofre.keys) {
      cofre.keys()
        .then(function (chaves) { return Promise.all(chaves.map(function (c) { return cofre.delete(c); })); })
        .then(ir, ir);
    } else {
      ir();
    }
  }

  setTimeout(mostrar, LIMITE_MS);
  /* Falha ao carregar um script (rede) ou módulo com versão incompatível. */
  window.addEventListener('error', function (evento) {
    var alvo = evento && evento.target;
    var ehScript = alvo && alvo.tagName === 'SCRIPT';
    var ehModulo = /import|export|module/i.test(String((evento && evento.message) || ''));
    if (ehScript || ehModulo) setTimeout(mostrar, 1500);
  }, true);
  if (window.MutationObserver) {
    new window.MutationObserver(esconderSeCarregou).observe(raiz, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('click', function (evento) {
    if (evento.target && evento.target.closest && evento.target.closest('#avisoCarregamentoRecarregar')) recarregar();
  });
})();
