/* Utilitários de navegador para testes (servidor estático, Chrome headless e CDP).
   Cópia fiel das funções de tests/smoke.mjs (v73), para os testes novos; os
   testes antigos mantêm as próprias cópias. Zero dependências npm. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

export const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------ servidor estático */
export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

/** @param {string} [raizServida] Pasta servida (padrão: a raiz deste repositório). */
export function iniciarServidor(raizServida = raiz) {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        let caminho = new URL(req.url, 'http://localhost').pathname;
        if (caminho === '/') caminho = '/index.html';
        const arquivo = join(raizServida, caminho.replace(/^\/+/, ''));
        const corpo = await readFile(arquivo);
        res.writeHead(200, { 'Content-Type': MIME[extname(arquivo)] || 'application/octet-stream' });
        res.end(corpo);
      } catch {
        res.writeHead(404).end('não encontrado');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ------------------------------------------------ chrome headless */
export function acharChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidatos = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return achado;
}

export function lancarChrome(chrome, perfil) {
  return new Promise((resolve, reject) => {
    const proc = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', `--user-data-dir=${perfil}`,
      '--remote-debugging-port=0', 'about:blank',
    ]);
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome não expôs o DevTools em 60s.\n${stderr}`)), 60000);
    proc.stderr.on('data', (d) => {
      stderr += d;
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve({ proc, wsUrl: m[1] }); }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/* ------------------------------------------------ cliente CDP mínimo */
export function conectarCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let proximoId = 1;
    const pendentes = new Map();
    const esperasEvento = [];
    ws.addEventListener('open', () => resolve({
      enviar(method, params = {}, sessionId) {
        const id = proximoId++;
        return new Promise((res, rej) => {
          pendentes.set(id, { res, rej });
          ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
        });
      },
      aguardarEvento(method, timeoutMs = 15000) {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`Timeout aguardando ${method}`)), timeoutMs);
          esperasEvento.push({ method, res: (p) => { clearTimeout(timer); res(p); } });
        });
      },
      fechar: () => ws.close(),
    }));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) {
        const { res, rej } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
        return;
      }
      if (msg.method) {
        for (let i = esperasEvento.length - 1; i >= 0; i--) {
          if (esperasEvento[i].method === msg.method) {
            esperasEvento.splice(i, 1)[0].res(msg.params);
          }
        }
      }
    });
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket: ${e.message || 'falha'}`)));
  });
}

