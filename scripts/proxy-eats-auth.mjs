/**
 * Proxy de teste: repassa tudo para a API, mas descarta o cabeçalho Authorization
 * (o pior caso de preview embutido / proxy corporativo). Usado por scripts/test-proxy.mjs.
 */
import http from 'node:http';
const UP = Number(process.env.PORT || 4000), ME = Number(process.env.PROXY_PORT || 4100);
http.createServer((req, res) => {
  const headers = { ...req.headers };
  const stripped = !!headers.authorization;
  delete headers.authorization;
  const preq = http.request({ port: UP, path: req.url, method: req.method, headers }, (pres) => {
    if (stripped) console.log(`  [proxy] cortei Authorization de ${req.method} ${req.url.split('?')[0]} → ${pres.statusCode}`);
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res);
  });
  preq.on('error', (e) => { res.writeHead(502); res.end(e.message); });
  req.pipe(preq);
}).listen(ME, '0.0.0.0', () => console.log('  [proxy] :4100 → :4000 comendo Authorization'));
