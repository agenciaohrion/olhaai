/**
 * CHECK-UP DO SISTEMA — `npm run doctor`
 *
 * Diz em uma tela se falta alguma coisa para o painel abrir, e o que rodar.
 * Feito para o caso clássico de "abre e fica preto": build incompleto, cache
 * velho, dependência não instalada, banco vazio ou servidor em outra porta.
 *
 *   npm run doctor              # verifica e explica
 *   npm run doctor -- --port 4100
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4000));
const ok = [];
const bad = [];
const fix = [];

const has = (p) => fs.existsSync(path.join(ROOT, p));
const pass = (m) => ok.push(m);
const fail = (m, ...help) => {
  bad.push(m);
  fix.push(...help);
};

/* --- Node --- */
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 22 || (maj === 22 && min >= 5)) pass(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} é velho`, 'instale o LTS em https://nodejs.org (precisa de 22.5+ por causa do banco embutido)');

/* --- dependências --- */
for (const [pkg, what] of [['express', 'API'], ['vite', 'compilador do painel'], ['ws', 'tempo real']]) {
  if (has(path.join('node_modules', pkg))) pass(`dependência ${pkg} ✓ (${what})`);
  else fail(`falta a dependência ${pkg}`, 'rode:  npm install');
}

/* --- build do painel (é aqui que o "tela preta" mora) --- */
const distIndex = path.join(ROOT, 'web', 'dist', 'index.html');
if (fs.existsSync(distIndex)) {
  pass('web/dist/index.html existe (painel compilado)');
  const html = fs.readFileSync(distIndex, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (!assets.length) fail('web/dist/index.html não referencia nenhum asset', 'o build ficou pela metade — rode:  npm run build');
  for (const a of assets) {
    const f = path.join(ROOT, 'web', 'dist', a.replace(/^\//, ''));
    if (fs.existsSync(f)) pass(`${a}  ·  ${(fs.statSync(f).size / 1024).toFixed(0)} kB`);
    else fail(`${a} está referenciado mas NÃO existe em web/dist`, 'rode de novo:  npm run build   — e abra com Ctrl+Shift+R');
  }
} else {
  fail('web/dist/index.html não existe — o painel nunca foi compilado', 'rode:  npm run build   (demora ~20s e cria web/dist)');
}

/* --- banco --- */
if (has(path.join('data', 'signage.db'))) {
  pass('data/signage.db existe');
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(ROOT, 'data', 'signage.db'));
    const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
    const devices = db.prepare('SELECT COUNT(*) n FROM devices').get().n;
    users ? pass(`${users} acesso(s), ${devices} tela(s) cadastradas`) : fail('o banco está vazio', 'rode:  npm run seed');
    db.close();
  } catch (e) {
    fail('não consegui ler o banco: ' + e.message, 'feche o servidor e rode:  npm run seed');
  }
} else {
  fail('ainda não existe banco de dados', 'rode:  npm run seed');
}

/* --- servidor --- */
const probe = (host) =>
  new Promise((resolve) => {
    const req = http.get({ host, port: PORT, path: '/api/health', timeout: 2500 }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b, type: res.headers['content-type'] }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('tempo esgotado'));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
  });

for (const [label, host] of [['127.0.0.1 (IPv4)', '127.0.0.1'], ['localhost (pode ser IPv6)', 'localhost']]) {
  const r = await probe(host);
  if (r.error) fail(`nada respondendo em ${label} na porta ${PORT}`, r.error === 'ECONNREFUSED' ? 'o servidor não está rodando → deixe este comando ativo:  npm start' : r.error);
  else if (r.status === 200 && r.body.startsWith('{')) pass(`${label} → ${r.body.slice(0, 70)}`);
  else fail(`${label} respondeu ${r.status} (${r.type})`, 'a porta está sendo usada por outro programa, ou o servidor subiu antes do build — pare (Ctrl+C) e rode  npm start  de novo');
}

/* --- o que o navegador realmente vai receber --- */
const firstJs = fs.existsSync(distIndex) ? [...fs.readFileSync(distIndex, 'utf8').matchAll(/src="(\/assets\/[^"]+\.js)"/g)][0]?.[1] : null;
if (firstJs) {
  const got = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: firstJs, timeout: 2500 }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => req.destroy());
  });
  if (!got) pass(`${firstJs} está no disco (não testei por HTTP — servidor parado?)`);
  else if (got.status === 200 && /javascript|ecmascript/.test(got.type || '')) pass(`${firstJs} → 200 · ${got.type}`);
  else
    fail(
      `${firstJs} chega como "${got.type || '?'}" (HTTP ${got.status})`,
      'é isso que deixa a tela preta: o navegador recusa executar HTML como módulo. Rode  npm run build  e reabra com Ctrl+Shift+R'
    );
}

/* --- relatório --- */
console.log('\n  OLHA.AI · check-up\n');
for (const m of ok) console.log('  ✅ ' + m);
for (const m of bad) console.log('  ✗ ' + m);
if (bad.length) {
  console.log('\n  Para resolver:\n');
  for (const f of [...new Set(fix)]) console.log('    ' + f);
  console.log('');
  process.exit(1);
}
console.log(`\n  Tudo certo. Abra:  http://127.0.0.1:${PORT}   (se o navegador for mal-humorado com "localhost", use o número)\n`);
console.log('  Para ligar as telas de exemplo, em outra janela:  npm run simulate\n');
