/**
 * Roda a suíte de UI através de um proxy que descarta o cabeçalho Authorization.
 *
 *   npm run test:proxy
 *
 * Existe gente cujo login "é aceito" e a sessão não monta por causa do caminho entre o
 * navegador e a API (preview embutido, proxy corporativo, captive portal). O servidor
 * também aceita o token por ?token= — é o que o painel usa em <img>. Este teste garante
 * que o painel descobre isso sozinho e segue funcionando, em vez de devolver a pessoa
 * para a tela de login.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4100;
const UP = process.env.PORT || 4000;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const cleanup = () => { try { proxy.kill('SIGKILL'); } catch {} };
const proxy = spawn(process.execPath, [path.join(ROOT, 'scripts', 'proxy-eats-auth.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(UP), PROXY_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
proxy.stdout.on('data', (b) => process.stdout.write('  ' + b));

const ready = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const code = await ready()
  ? await new Promise((done) => {
      const t = spawn(npm, ['run', 'test:ui'], { cwd: ROOT, env: { ...process.env, BASE: `http://127.0.0.1:${PORT}` }, stdio: 'inherit', shell: process.platform === 'win32' });
      t.on('exit', done);
    })
  : (console.error('\n  ✗ o proxy não subiu — a API está de pé na porta ' + UP + '? (npm run demo)\n'), 1);

// um proxy sobrando na 4100 confunde mais do que o teste esclarece
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
cleanup();
process.exit(code || 0);
