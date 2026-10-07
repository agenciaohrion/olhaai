/**
 * Teste de renderização do painel (jsdom) — cada rota é montada de verdade contra a API real.
 * Pega erro de runtime, import quebrado, hook fora de ordem, prop inexistente etc.
 *
 *   node server/index.js &      # API no ar
 *   node scripts/uitest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const BASE = process.env.BASE || 'http://localhost:4000';
const ROOT = path.resolve(import.meta.dirname, '..');

const ROUTES = [
  { path: '/inicio', expect: ['OLHA', 'marketing indoor'], public: true },
  { path: '/login', expect: ['Entrar no painel', 'demonstração'] },
  { path: '/', expect: ['telas no ar', 'O que está no ar agora'] },
  { path: '/telas', expect: ['Parque de telas'] },
  { path: '/mapa', expect: ['Onde cada tela está'] },
  { path: '/conteudo', expect: ['Biblioteca de conteúdo'] },
  { path: '/programacao', expect: ['Programação das telas'] },
  { path: '/programacao/1', expect: ['Trilha', 'Prévia da tela', 'Alcance'] },
  { path: '/relatorios', expect: ['tempo no ar', 'Detalhamento'] },
  { path: '/pontos', expect: ['Pontos de exibição'] },
  { path: '/empresas', expect: ['Empresas atendidas', 'Carteira'] },
  { path: '/equipe', expect: ['Quem acessa este painel'] },
  { path: '/instalacao', expect: ['Instalar o OLHA.AI', 'código'] },
  { path: '/config', expect: ['Minha conta', 'Status da operação'] },
  { path: '/telas/1', expect: ['resumo do aparelho', 'programação'] },
  { path: '/player', expect: ['Conecte esta tela', 'pareamento', 'guarda as peças'], public: true },
  { path: '/nada-qui', expect: ['Página não encontrada'] },
];

async function bundle() {
  const out = path.join(ROOT, 'node_modules', '.cache', 'olha-uitest.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'scripts', 'uitest-entry.jsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    outfile: out,
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty' },
    alias: { '@': path.join(ROOT, 'web', 'src') },
    logLevel: 'silent',
  });
  return fs.readFileSync(out, 'utf8');
}

async function login(email, password) {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error('login falhou: ' + (await r.text()));
  return r.json();
}

async function render(code, route, token) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('[jsdom] ' + (e.detail?.message || e.message)));
  vc.on('error', (...a) => errors.push('[console] ' + a.map(String).join(' ')));
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="root"></div></body></html>`,
    { url: BASE + (token ? '/' : route), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc }
  );
  const w = dom.window;
  w.fetch = (input, init) => {
    const url = typeof input === 'string' ? new URL(input, BASE).toString() : input;
    return fetch(url, init).catch((e) => {
      errors.push('[fetch] ' + url + ' :: ' + e.message);
      throw e;
    });
  };
  w.WebSocket = class {
    constructor() {
      this.readyState = 0;
      setTimeout(() => this.onopen?.(), 0);
    }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
  w.Notification = { permission: 'default', requestPermission: async () => 'granted' };
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollIntoView = () => {};
  const ctx2d = () => {
    const noop = () => {};
    return new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
  };
  w.HTMLCanvasElement.prototype.getContext = ctx2d;
  w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new w.Blob(['x'], { type: 'image/jpeg' }));
  Object.defineProperty(w.navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch() {}, getCurrentPosition: (s, f) => f({ message: 'unavailable in test' }) }, configurable: true });
  w.navigator.wakeLock = { request: async () => ({ release() {} }) };
  if (token) w.localStorage.setItem('olha.token', token);
  // dims não-nulas para o Leaflet
  w.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() {} };
  };
  Object.defineProperties(w.HTMLElement.prototype, {
    clientWidth: { get: () => 1280, configurable: true },
    clientHeight: { get: () => 800, configurable: true },
  });

  w.eval(code);
  await w.__olhaTest.render(route);
  await new Promise((r) => setTimeout(r, 900));
  const root = w.document.getElementById('root');
  const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
  const html = root.innerHTML;
  await new Promise((r) => setTimeout(r, 50));
  dom.window.close();
  return { text, html, errors };
}

async function main() {
  console.log('\n▶ build do bundle de teste…');
  const code = await bundle();
  console.log('▶ login na API…');
  const agency = await login('admin@olha.ai', 'olha12345').catch(() => null);
  const client = await login('rafael@inovepiscinas.com.br', 'cliente123').catch(() => null);
  if (!agency) throw new Error('API fora do ar em ' + BASE + ' — suba com: node server/index.js');

  let fail = 0;
  const line = (s) => console.log(s);

  for (const r of ROUTES) {
    const isPlayer = r.path === '/player';
    const token = r.public && !isPlayer ? null : agency.token;
    const { text, errors } = await render(code, r.path, token);
    const missing = r.expect.filter((e) => !text.toLowerCase().includes(e.toLowerCase()));
    const hardErrors = errors.filter((e) => !/not implemented|Could not parse CSS|@media|jsdomError.*not implemented/i.test(e));
    const okRow = !missing.length && !hardErrors.length && text.length > 40;
    if (!okRow) fail++;
    line(`  ${okRow ? '✅' : '❌'} ${r.path.padEnd(16)} ${String(text.length).padStart(5)} chars ${missing.length ? '| faltando: ' + missing.join(', ') : ''}`);
    if (hardErrors.length) line('       ↳ ' + hardErrors.slice(0, 4).join('\n       ↳ '));
  }

  // portal do cliente: não pode ver gestão de empresas nem dados de terceiros
  line('\n▶ isolamento do cliente');
  {
    const token = client.token;
    const { text } = await render(code, '/', token);
    const ok1 = !text.includes('Toda a rede');
    line(`  ${ok1 ? '✅' : '❌'} / não mostra seletor de carteira para o cliente`);
    const { text: t2 } = await render(code, '/empresas', token);
    const ok2 = !t2.includes('Carteira da agência');
    if (!ok1 || !ok2) fail++;
    line(`  ${ok2 ? '✅' : '❌'} /empresas redireciona para a visão geral`);
    const { text: t3 } = await render(code, '/telas', token);
    const ok3 = t3.includes('Parque de telas') && !t3.includes('Rede Fit Moveis');
    if (!ok3) fail++;
    line(`  ${ok3 ? '✅' : '❌'} /telas lista só as telas da própria empresa`);
    const { text: t4 } = await render(code, '/conteudo', token);
    const ok4 = t4.includes('Biblioteca de conteúdo') && !t4.includes('Piscinas Inove') && !t4.includes('Clínica Sorriso');
    if (!ok4) fail++;
    line(`  ${ok4 ? '✅' : '❌'} /conteudo só expõe as peças da empresa + biblioteca da agência`);
    if (!ok4) line('       texto: ' + JSON.stringify(t4.slice(0, 300)));
  }

  // player: fluxo de pareamento com código válido (sem clicar, chamando a função pareada)
  line('\n▶ pareamento via player');
  {
    const { text, errors } = await render(code, '/player?code=OLHA201', null);
    // pareamento automático + manifest + peça em exibição (o <img> não carrega no jsdom)
    const ok = /OLHA\.AI player|carregando peça|Aguardando programação|Tela pausada/.test(text);
    if (!ok) fail++;
    line(`  ${ok ? '✅' : '❌'} /player?code=OLHA201 chega na tela de conteúdo (${String(text.length)} chars)`);
    if (!ok) line('       texto: ' + JSON.stringify(text.slice(0, 400)));
    if (errors.filter((e) => !/not implemented|Could not parse CSS/i.test(e)).length) {
      fail++;
      line('       ↳ ' + errors.slice(0, 3).join('\n       ↳ '));
    }
  }

  line(`\n  ${fail ? '❌ ' + fail + ' problema(s)' : '✅ tudo renderizando'}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('\n  ⚠️ ', e);
  process.exit(2);
});
