import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR, ROOT, get, all, run } from './db.js';
import { requireUser } from './auth.js';
import { attachRealtime } from './realtime.js';
import { router as authRoutes } from './routes/auth.js';
import { router as clientRoutes } from './routes/clients.js';
import { router as deviceRoutes } from './routes/devices.js';
import { router as mediaRoutes } from './routes/media.js';
import { router as playlistRoutes } from './routes/playlists.js';
import { router as playerRoutes } from './routes/player.js';
import { router as dashRoutes } from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT || 4000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));

// logs de acesso resumidos (sem ruído de heartbeat no console)
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    if (req.path.startsWith('/uploads') || req.path.endsWith('/heartbeat')) return;
    if (ms > 250 || res.statusCode >= 400) console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const api = express.Router();
api.get('/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString(), devices: get("SELECT COUNT(*) n FROM devices WHERE status='online'").n });
});

// rotas públicas: login do painel + API consumida pelo aparelho (token do dispositivo)
const pub = express.Router();
pub.use(authRoutes);
pub.use(playerRoutes);
api.use(pub);

// rotas do painel: todas exigem sessão (login) e aplicam escopo por papel
const priv = express.Router();
priv.use(requireUser);
priv.use(clientRoutes);
priv.use(deviceRoutes);
priv.use(mediaRoutes);
priv.use(playlistRoutes);
priv.use(dashRoutes);
api.use(priv);

api.use((req, res) => res.status(404).json({ error: `rota não encontrada: ${req.method} ${req.originalUrl}` }));
app.use('/api', api);

// arquivos de mídia: nome de arquivo aleatório + cache longo (o player guarda em cache local)
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: 'deny',
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}shots`)) res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  })
);

/**
 * Painel React (build) + fallback de SPA.
 *
 * Duas regras que evitam o clássico "abre e fica preto":
 *  1. decidimos a cada requisição se web/dist existe — assim dá para rodar
 *     `npm run build` com o servidor de pé e a página nova aparece sem reiniciar;
 *  2. pedido de arquivo (/assets/*.js, .css, .svg…) que não existe devolve 404
 *     de verdade. Entregar o index.html para um <script type="module"> faz o
 *     navegador recusar o módulo e a tela ficar escura sem nenhuma mensagem.
 */
const BUILD_HINT = `<!doctype html><meta charset="utf-8"><title>OLHA.AI — API ativa</title>
  <body style="font:16px system-ui;background:#05070f;color:#e8ecff;padding:60px;max-width:720px">
  <h1>API do OLHA.AI está no ar ✅</h1>
  <p>O painel ainda não foi compilado. Rode <code style="background:#141a33;padding:2px 6px;border-radius:6px">npm run build</code>
  (produção) ou <code style="background:#141a33;padding:2px 6px;border-radius:6px">npm run dev</code> (Vite + HMR) e recarregue esta página.</p>
  <p>Check-up completo: <code style="background:#141a33;padding:2px 6px;border-radius:6px">npm run doctor</code> · Health: <a style="color:#7c5cff" href="/api/health">/api/health</a></p></body>`;

app.use(express.static(DIST, { index: false, maxAge: '1h', immutable: true }));
app.get(/^(?!\/(api|uploads|ws)).*/, (req, res) => {
  const indexHtml = path.join(DIST, 'index.html');
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) {
    return res
      .status(404)
      .type('text/plain; charset=utf-8')
      .send(
        `arquivo não encontrado no build: ${req.path}\n\n` +
          `O index.html do seu navegador está apontando para um build antigo.\n` +
          `Rode  npm run build  na pasta do projeto e recarregue com Ctrl+Shift+R.\n` +
          `Check-up:  npm run doctor\n`
      );
  }
  if (!fs.existsSync(indexHtml)) return res.status(200).type('html').send(BUILD_HINT);
  // sem cache do HTML: é ele que aponta os hashes dos assets; cache velho = tela preta
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexHtml);
});

// tratamento central de erros
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('[erro]', err);
  res.status(status).json({ error: err.message || 'falha interna', detail: err.code || undefined });
});

// capturas são efêmeras: se o arquivo sumiu (deploy novo, limpeza manual),
// remove a linha para o painel não apontar <img> quebrada
try {
  for (const r of all('SELECT id, filename FROM screenshots')) {
    if (!fs.existsSync(path.join(UPLOAD_DIR, 'shots', r.filename))) run('DELETE FROM screenshots WHERE id=?', [r.id]);
  }
} catch {}

const server = http.createServer(app);
const rt = attachRealtime(server);

/**
 * Escuta em todas as interfaces. `undefined` = dual-stack (:: aceita IPv4 e IPv6),
 * porque no Windows o navegador resolve "localhost" para ::1 primeiro e, escutando
 * só em IPv4, a página simplesmente não abre. Se a máquina não tiver IPv6, caímos
 * para 0.0.0.0. OLHA_HOST força um endereço (ex.: OLHA_HOST=127.0.0.1).
 */
function listen(hosts) {
  const [host, ...rest] = hosts;
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ✗ a porta ${PORT} já está em uso. Feche o outro servidor ou rode com outra porta:`);
      console.error(`      PowerShell:  $env:PORT=4100; npm start`);
      console.error(`      Linux/Mac:   PORT=4100 npm start\n`);
      process.exit(1);
    }
    if (!rest.length) {
      console.error('\n  ✗ não consegui abrir o servidor:', err.message, '\n');
      process.exit(1);
    }
    try {
      server.close();
    } catch {}
    listen(rest);
  });
  server.listen(PORT, host, () => {
    const links = [
      ['Painel (agência + cliente)', `http://localhost:${PORT}/`],
      ['Player (TV / tablet)', `http://localhost:${PORT}/player`],
      ['API health', `http://localhost:${PORT}/api/health`],
    ];
    const ip = lanAddress();
    if (ip) links.push(['Na rede local (TV/celular)', `http://${ip}:${PORT}/`]);
    console.log('\n  OLHA.AI · Marketing Indoor — servidor pronto');
    for (const [k, v] of links) console.log(`   ${k.padEnd(26)} ${v}`);
    const users = get("SELECT COUNT(*) n FROM users");
    if (!users.n) console.log('\n   Banco vazio → rode:  npm run seed');
    console.log('');
  });
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) return n.address;
  return null;
}

listen(process.env.OLHA_HOST ? [process.env.OLHA_HOST] : [undefined, '0.0.0.0']);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
