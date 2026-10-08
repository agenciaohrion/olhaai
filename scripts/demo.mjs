/**
 * DEMO COM UM COMANDO SÓ — sobe painel + API + aparelhos falsos e te dá a URL.
 *
 *   npm run demo            # prepara o que faltar (build, dados) e roda tudo
 *   npm run demo -- --fresh # limpa a base e recria a demonstração do zero
 *
 * O que ele faz, na ordem, pulando o que já estiver pronto:
 *   1. npm install          (se node_modules não existir)
 *   2. npm run build        (se web/dist não existir — é o painel que a API serve)
 *   3. node server/seed.js  (cria agência, 3 empresas, 8 telas, grades, histórico)
 *   4. sobe a API e 8 aparelhos simulados (heartbeat, GPS, capturas)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRESH = process.argv.includes('--fresh');
const PORT = Number(process.env.PORT || 4000);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const has = (p) => fs.existsSync(path.join(ROOT, p));
const step = (n, msg) => console.log(`\n  ${n} · ${msg}`);

function run(args, { fatal = true } = {}) {
  console.log(`     $ ${args.join(' ')}`);
  const r = spawnSync(npm, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.status !== 0 && fatal) {
    console.error(`\n  ✗ falhou: ${args.join(' ')} (código ${r.status})\n`);
    process.exit(r.status || 1);
  }
}

/* 1 · dependências */
if (!has('node_modules/vite') || !has('node_modules/express')) {
  step('1/4', 'instalando dependências (uma vez só)');
  run(['install', '--no-audit', '--no-fund']);
} else {
  step('1/4', 'dependências já instaladas ✓');
}

/* 2 · build do painel */
if (FRESH || !has('web/dist/index.html')) {
  step('2/4', 'gerando o painel (web/dist)');
  run(['run', 'build']);
} else {
  step('2/4', 'painel já gerado ✓');
}

/* 3 · dados de demonstração */
if (!has('data/signage.db')) {
  step('3/4', 'criando a base de demonstração');
  run(['run', 'seed']);
} else {
  step('3/4', FRESH ? 'recriando a base do zero (--fresh)' : 'base já existe — completando o que falta');
  run(['run', 'seed', ...(FRESH ? [] : ['--keep'])]);
}

/* 4 · servidor + aparelhos */
step('4/4', 'subindo painel, API e aparelhos simulados\n');
const kids = [spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'inherit' })];

// o simulador precisa da API no ar: esperar o /api/health evita o "fetch failed" na largada
const waitApi = async (ms = 20_000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

const sim = async () => {
  if (await waitApi()) kids.push(spawn(process.execPath, ['scripts/simulate.mjs'], { cwd: ROOT, stdio: 'inherit' }));
  else console.log('  ! API não respondeu em 20s — rode `npm run simulate` quando ela subir');
};
sim();
const kill = () => kids.forEach((k) => k.kill('SIGTERM'));
process.on('SIGINT', kill);
process.on('SIGTERM', kill);
for (const k of kids) k.on('exit', (code) => { if (code && code !== 0 && code !== null) console.log(`\n  ! processo saiu com código ${code}`); });

console.log(`
  ─────────────────────────────────────────────────────────
   ABRA NO NAVEGADOR        http://localhost:${PORT}
   TELA DE APARELHO         http://localhost:${PORT}/player   (código OLHA101)

   login da agência   admin@olha.ai            olha12345
   login do cliente   ju@fitmoveis.com.br      cliente123

   Ctrl+C aqui para parar tudo
  ─────────────────────────────────────────────────────────
`);
