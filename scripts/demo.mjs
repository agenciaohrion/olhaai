/**
 * DEMO COM UM COMANDO SÓ — sobe painel + API + aparelhos falsos e te dá a URL.
 *
 *   npm run demo            # prepara o que faltar (install, build, dados) e roda tudo
 *   npm run demo -- --fresh # limpa a base e recria a demonstração do zero
 *
 * Na ordem, pulando o que já estiver pronto:
 *   1. npm install          (se node_modules não existir)
 *   2. vite build           (se web/dist não existir — é o painel que a API serve)
 *   3. node server/seed.js  (agência + 3 empresas, pontos com coordenadas, telas, peças, grades)
 *   4. API + 8 aparelhos simulados (heartbeat, GPS, capturas, minutos exibidos)
 *
 * Windows: chamado pelo PowerShell como `npm run demo`. Os passos 2 a 4 usam o
 * próprio binário do Node (sem passar pelo npm), porque o Node 22 não permite
 * iniciar os .cmd do npm sem shell.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRESH = process.argv.includes('--fresh');
const PORT = Number(process.env.PORT || 4000);
const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const VITE = path.join('node_modules', 'vite', 'bin', 'vite.js');

const has = (p) => fs.existsSync(path.join(ROOT, p));
const step = (n, msg) => console.log(`\n  ${n} · ${msg}`);
const line = (s) => console.log(`     ${s}`);

function fail(what, r) {
  console.error(`\n  ✗ ${what} falhou${r && r.status != null ? ` (código ${r.status})` : ''}`);
  if (r && r.error) console.error(`     ${r.error.message}`);
  // status null sem error = o filho não pôde ser lançado: no Windows é o npm/.cmd
  // chamado sem shell (Node 22 recusa). Quem lê "código null" precisa saber disso.
  if (r && r.status === null && !r.error) console.error('     o comando não pôde ser iniciado — no Windows isso é o npm (.cmd) chamado sem shell; rode o comando à mão no PowerShell');
  console.error('\n     Você pode fazer no braço, um por um:\n');
  console.error('       npm install');
  console.error('       npm run build');
  console.error('       npm run seed');
  console.error('       npm start          # e, em outro terminal: npm run simulate\n');
  process.exit((r && r.status) || 1);
}

function runNpm(args) {
  line(`npm ${args.join(' ')}`);
  // no Windows o npm é um .cmd e o Node 22 só deixa chamar via shell
  const opts = { cwd: ROOT, stdio: 'inherit' };
  return IS_WIN ? spawnSync(`${NPM} ${args.join(' ')}`, { ...opts, shell: true }) : spawnSync(NPM, args, opts);
}

function runNode(args, label = args.join(' ')) {
  line(`node ${label}`);
  return spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
}

/* 1 · dependências */
if (!has('node_modules/vite') || !has('node_modules/express')) {
  step('1/4', 'instalando dependências (uma vez só — pode levar 1 min)');
  const r = runNpm(['install', '--no-audit', '--no-fund']);
  if (r.status !== 0 || !has('node_modules/express')) fail('npm install', r);
} else {
  step('1/4', 'dependências já instaladas ✓');
}

/* 2 · build do painel */
if (FRESH || !has('web/dist/index.html')) {
  step('2/4', 'gerando o painel (web/dist)');
  const r = runNode([VITE, 'build', '--config', path.join('web', 'vite.config.js')]);
  if (r.status !== 0 || !has('web/dist/index.html')) fail('build do painel', r);
} else {
  step('2/4', 'painel já gerado ✓');
}

/* 3 · dados de demonstração
   Cuidado com a tentação de pular o seed quando data/signage.db existe: um `npm start`
   sozinho cria o arquivo com as tabelas e NENHUM acesso — a demo "existente" ficaria com
   login morto. Quem decide é o seed: com base populada ele sai na frente, vazia ele preenche. */
const dbExists = has(path.join('data', 'signage.db'));
step('3/4', FRESH ? 'recriando a base do zero (--fresh)' : dbExists ? 'base existe — seed decide se falta algo' : 'criando a base de demonstração');
let seedFailed = false;
{
  const args = [path.join('server', 'seed.js'), ...(FRESH ? [] : ['--keep'])];
  const r = runNode(args);
  if (r.status !== 0) {
    seedFailed = true;
    console.error('\n  ⚠ o seed não rodou — a demo sobe mesmo assim, mas sem dados, e aí');
    console.error('     nenhum login entra (o painel avisa isso na própria tela de entrada).');
    console.error('     para criar a demonstração com o painel no ar:  node server' + (IS_WIN ? '\\' : '/') + 'seed.js');
    console.error('     depois é só recarregar o navegador.\n');
  }
}

/* 4 · servidor + aparelhos */
step('4/4', 'subindo painel, API e aparelhos simulados\n');
const kids = [spawn(process.execPath, [path.join('server', 'index.js')], { cwd: ROOT, stdio: 'inherit' })];

const waitApi = async (ms = 25_000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

(async () => {
  if (await waitApi()) kids.push(spawn(process.execPath, [path.join('scripts', 'simulate.mjs')], { cwd: ROOT, stdio: 'inherit' }));
  else console.log('  ! a API não respondeu em 25s — rode `npm run simulate` quando ela subir');
})();

console.log(`
  ─────────────────────────────────────────────────────────
   ABRA NO NAVEGADOR        http://localhost:${PORT}
   TELA DE APARELHO         http://localhost:${PORT}/player   (código OLHA101)

   login da agência   admin@olha.ai            olha12345
   login do cliente   ju@fitmoveis.com.br      cliente123
${seedFailed ? '\n   ⚠ SEM DADOS  →  node server/seed.js   (senão o login não tem quem entrar)\n' : ''}
   Ctrl+C aqui para parar tudo
  ─────────────────────────────────────────────────────────
`);

const kill = () => kids.forEach((k) => k.kill());
process.on('SIGINT', kill);
process.on('SIGTERM', kill);
for (const k of kids) k.on('exit', (code) => { if (code) console.log(`\n  ! o processo parou (código ${code})`); });
