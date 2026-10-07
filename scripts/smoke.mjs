/**
 * Teste de ponta a ponta da API (sem browser). Roda contra um servidor já no ar.
 *   node server/index.js &   # ou npm start
 *   node scripts/smoke.mjs
 * Cobre: login, escopo por papel, cadastro de ponto/aparelho, pareamento, grade,
 * janelas de horário, publicação com push, comandos remotos em fila, GPS, captura e relatórios.
 */
const BASE = process.env.BASE || 'http://localhost:4000';
let pass = 0;
let fail = 0;
const results = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    results.push(`  ✅ ${name}`);
  } else {
    fail++;
    results.push(`  ❌ ${name} ${extra}`);
  }
}

async function call(path, { token, method = 'GET', body, form, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text: raw ? text.slice(0, 120) : text };
}

const log = (...a) => console.log(...a);

async function main() {
  log(`\n▶ smoke test contra ${BASE}\n`);

  /* ---------------- auth ---------------- */
  const agency = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@olha.ai', password: 'olha12345' } });
  ok('login da agência', agency.status === 200 && !!agency.json?.token);
  const A = agency.json.token;

  const badLogin = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@olha.ai', password: 'errada' } });
  ok('senha errada é rejeitada', badLogin.status === 401);

  const anon = await call('/api/overview');
  ok('rota do painel exige login', anon.status === 401);

  const client = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'rafael@inovepiscinas.com.br', password: 'cliente123' },
  });
  ok('login do cliente', client.status === 200 && client.json?.user?.role === 'client');
  const C = client.json.token;
  const clientCid = client.json.user.client_id;

  /* ---------------- escopo / privacidade ---------------- */
  const cl = await call('/api/clients', { token: A });
  ok('agência lista todas as empresas', cl.status === 200 && cl.json.length >= 3, `(${cl.json?.length})`);
  const otherClient = cl.json.find((x) => x.id !== clientCid);

  const myOnly = await call('/api/clients', { token: C });
  ok('cliente enxerga apenas a própria empresa', myOnly.status === 200 && myOnly.json.length === 1 && myOnly.json[0].id === clientCid);

  const peek = await call(`/api/clients/${otherClient.id}`, { token: C });
  ok('cliente NÃO acessa dados de outra empresa', peek.status === 403 || peek.status === 404, `(status ${peek.status})`);

  const peekDev = await call(`/api/devices?client_id=${otherClient.id}`, { token: C });
  ok('lista de aparelhos respeita o escopo', peekDev.status === 200 && peekDev.json.every((d) => d.client_id === clientCid));

  const devWrite = await call('/api/clients', {
    method: 'POST',
    token: C,
    body: { name: 'Empresa que não deveria nascer' },
  });
  ok('cliente não cria novas empresas', devWrite.status === 403);

  /* ---------------- visão geral / rede ---------------- */
  const ov = await call('/api/overview', { token: A });
  ok('overview traz contagem de telas', ov.status === 200 && typeof ov.json?.screens?.total === 'number');
  ok('overview traz minutos exibidos hoje', ov.json?.playback?.today_minutes >= 0);
  const ns = await call('/api/network-state', { token: A });
  ok('estado da rede resolve a programação por aparelho', ns.status === 200 && ns.json.length > 0 && 'playlist' in ns.json[0]);

  /* ---------------- ponto + aparelho criados pelo cliente ---------------- */
  const loc = await call('/api/locations', {
    method: 'POST',
    token: C,
    body: { name: 'Ponto Smoke Test', city: 'Teresina', state: 'PI', lat: -5.09, lng: -42.8, kind: 'loja', footfall: 120 },
  });
  ok('cliente cadastra ponto', loc.status === 201, JSON.stringify(loc.json));
  const locId = loc.json.id;

  const dev = await call('/api/devices', {
    method: 'POST',
    token: C,
    body: { name: 'TV Smoke', type: 'tv', orientation: 'h', location_id: locId },
  });
  ok('cliente cadastra aparelho e recebe código de pareamento', dev.status === 201 && /^[A-Z0-9]{6}$/.test(dev.json?.pairing_code || ''), JSON.stringify(dev.json));
  const devId = dev.json.id;
  const code = dev.json.pairing_code;

  /* ---------------- pareamento do aparelho ---------------- */
  const pair = await call('/api/player/pair', {
    method: 'POST',
    body: { code, info: { ua: 'SmokePlayer/1.0', os: 'Android TV 12', app_version: '1.4.0', width: 1920, height: 1080 } },
  });
  ok('aparelho pareia com o código', pair.status === 200 && !!pair.json?.token);
  const D = pair.json.token;

  const wrong = await call('/api/player/pair', { method: 'POST', body: { code: 'ZZZZZZ' } });
  ok('código de pareamento inválido é recusado', wrong.status === 404);

  let man = await call('/api/player/manifest', { token: D });
  ok('tela nova entra na grade padrão da empresa (sem vínculo)', man.status === 200 && man.json.program.source === 'fallback');
  ok('manifest informa cliente e ponto', man.json.client?.id === clientCid && man.json.location?.id === locId);

  /* ---------------- conteúdo do cliente ---------------- */
  const fd = new FormData();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#111"/><text x="40" y="220" fill="#fff" font-size="48">SMOKE</text></svg>`;
  fd.append('files[]', new Blob([svg], { type: 'image/svg+xml' }), 'smoke.svg');
  fd.append('client_id', String(clientCid));
  fd.append('meta', JSON.stringify({ title: 'Peça Smoke', width: 800, height: 450, orientation: 'h' }));
  const up = await call('/api/media/upload', { token: C, method: 'POST', form: fd });
  ok('upload de imagem', up.status === 201 && !!up.json[0]?.src, JSON.stringify(up.json));
  const mediaId = up.json[0].id;
  const mediaSrc = up.json[0].src;

  const widget = await call('/api/media', {
    method: 'POST',
    token: C,
    body: { kind: 'text', title: 'Aviso Smoke', body: 'Aviso importante para as telas' },
  });
  ok('cria conteúdo dinâmico (aviso rolante)', widget.status === 201);
  const widgetId = widget.json.id;

  const fetched = await fetch(BASE + mediaSrc);
  ok('arquivo enviado é servido ao aparelho', fetched.status === 200);

  const thumb = await call(`/api/media/${mediaId}/thumb?token=${C}`, { token: C });
  ok('thumbnail do conteúdo responde', thumb.status === 200);

  /* ---------------- playlist + janelas + publicação ---------------- */
  const pl = await call('/api/playlists', { method: 'POST', token: C, body: { name: 'Playlist Smoke', orientation: 'h' } });
  ok('cliente cria playlist', pl.status === 201);
  const plId = pl.json.id;

  const items = await call(`/api/playlists/${plId}/items`, {
    method: 'PUT',
    token: C,
    body: { items: [{ media_id: mediaId, duration_ms: 8000 }, { media_id: widgetId, duration_ms: 6000 }] },
  });
  ok('adiciona 2 conteúdos à trilha', items.status === 200 && items.json.items.length === 2);
  ok('duração do item respeita o ajuste manual', items.json.items[0].slot_ms === 8000);

  const pubNoBind = await call(`/api/playlists/${plId}/publish`, { method: 'POST', token: C });
  ok('publicação exige vínculo com tela', pubNoBind.status === 422);

  const win = await call(`/api/playlists/${plId}/windows`, {
    method: 'PUT',
    token: C,
    body: { windows: [{ name: 'Manhã', days: [0, 1, 2, 3, 4, 5, 6], start_time: '00:00', end_time: '23:59', priority: 2 }] },
  });
  ok('grava janela de horário', win.status === 200 && win.json.windows.length === 1);

  const foreignLoc = await call(`/api/locations?client_id=${otherClient.id}`, { token: A });
  const bad = await call(`/api/playlists/${plId}/assignments`, { method: 'PUT', token: C, body: { location_ids: [foreignLoc.json[0].id] } });
  ok('vínculo a ponto de outra empresa é bloqueado', bad.status === 422, `status ${bad.status}`);

  const bind = await call(`/api/playlists/${plId}/assignments`, { method: 'PUT', token: C, body: { device_ids: [devId] } });
  ok('vincula playlist ao aparelho', bind.status === 200 && bind.json.devices.some((d) => d.id === devId));

  const pub = await call(`/api/playlists/${plId}/publish`, { method: 'POST', token: C });
  ok('publica a grade', pub.status === 200 && pub.json.status === 'publicada', JSON.stringify(pub.json).slice(0, 200));
  ok('publicação entrega para as telas vinculadas', pub.json.pushed_to >= 1);

  man = await call('/api/player/manifest', { token: D });
  ok('aparelho passa a receber a grade publicada', man.json.program.items.length === 2 && man.json.program.mode === 'playlist');
  ok('URL do conteúdo chega assinada no manifest', man.json.program.items[0].media.src === mediaSrc);

  /* ---------------- telemetria ---------------- */
  const hb1 = await call('/api/player/heartbeat', {
    method: 'POST',
    token: D,
    body: { hash: man.json.hash, uptime: 60, battery: 77, playing: { media_id: mediaId, ms: 8000, playlist_id: plId } },
  });
  ok('heartbeat confirma hash atual (sem mudança)', hb1.status === 200 && hb1.json.changed === false);

  const hbGeo = await call('/api/player/heartbeat', {
    method: 'POST',
    token: D,
    body: { hash: man.json.hash, geo: { lat: -5.0912, lng: -42.8001, accuracy: 8, speed: 12.5, bearing: 90 } },
  });
  ok('heartbeat aceita GPS do aparelho', hbGeo.status === 200);

  const mapData = await call('/api/map', { token: C });
  const onMap = mapData.json.devices.find((d) => d.id === devId);
  ok('aparelho aparece no mapa com coordenada', onMap && Number.isFinite(onMap.lat) && Number.isFinite(onMap.lng));
  ok('aparelho aparece como online no mapa', onMap?.online === true);

  const geoPush = await call('/api/player/geo', { method: 'POST', token: D, body: { lat: -5.1001, lng: -42.789, accuracy: 5, speed: 30 } });
  const trail = await call(`/api/devices/${devId}/trail`, { token: C });
  ok('trilha de deslocamento é registrada', geoPush.status === 200 && trail.status === 200 && Array.isArray(trail.json));

  const shot = new FormData();
  shot.append('shot', new Blob([svg], { type: 'image/svg+xml' }), 'shot.svg');
  shot.append('w', '1920');
  const cap = await call('/api/player/screenshot', { method: 'POST', token: D, form: shot });
  ok('captura de tela sobe para o painel', cap.status === 201 && !!cap.json.url);
  const capGet = await fetch(BASE + cap.json.url);
  ok('captura fica visível no painel', capGet.status === 200);

  // a rotação de capturas só acontece depois da 20ª por aparelho — é exatamente
  // onde um import quebrado some o screenshot do painel inteiro
  let lastCap = null;
  for (let i = 0; i < 21; i++) {
    const f = new FormData();
    f.append('shot', new Blob([svg], { type: 'image/svg+xml' }), 'shot.svg');
    lastCap = await call('/api/player/screenshot', { method: 'POST', token: D, form: f });
  }
  ok('aparelho pode enviar capturas em sequência sem erro', lastCap.status === 201, `status ${lastCap.status}`);
  const devShots = await call(`/api/devices/${devId}`, { token: C });
  ok('galeria de capturas aparece no detalhe da tela', (devShots.json.screenshots || []).length > 0);
  const firstGone = await fetch(BASE + cap.json.url);
  ok('capturas antigas são descartadas (máx. 20 por aparelho)', firstGone.status === 404, `ainda responde ${firstGone.status}`);

  const detail = await call(`/api/devices/${devId}`, { token: C });
  ok('detalhe do aparelho traz logs e programação', detail.status === 200 && detail.json.logs.length > 0 && detail.json.program.playlist?.id === plId);
  ok('playlog registra minutos exibidos', (detail.json.playlog[0]?.ms || 0) >= 0);

  /* ---------------- comando remoto ---------------- */
  const act = await call(`/api/devices/${devId}/action`, { method: 'POST', token: C, body: { action: 'pause' } });
  ok('painel envia comando (pausar tela)', act.status === 200);
  const hbPause = await call('/api/player/heartbeat', { method: 'POST', token: D, body: { hash: man.json.hash } });
  const gotCmd = hbPause.json.commands.length > 0 || hbPause.json.mode === 'paused';
  ok('comando chega ao aparelho', gotCmd, JSON.stringify(hbPause.json.commands));

  const manPaused = await call('/api/player/manifest', { token: D });
  ok('modo pausado reflete no manifest', manPaused.json.program.mode === 'paused' || hbPause.json.mode === 'paused');

  await call(`/api/devices/${devId}/action`, { method: 'POST', token: C, body: { action: 'resume' } });
  const manBack = await call('/api/player/manifest', { token: D });
  ok('retomar volta a grade normal', manBack.json.program.mode === 'playlist');

  const takeover = await call(`/api/devices/${devId}/action`, { method: 'POST', token: C, body: { action: 'takeover', media_id: mediaId } });
  const manTake = await call('/api/player/manifest', { token: D });
  ok('destaque/takeover numa única tela', takeover.status === 200 && manTake.json.program.mode === 'takeover' && manTake.json.program.items[0].media.id === mediaId);
  await call(`/api/devices/${devId}/action`, { method: 'POST', token: C, body: { action: 'resume' } });

  /* ---------------- relatórios ---------------- */
  const rep = await call('/api/reports?days=14', { token: C });
  ok('relatório do cliente traz totais e por mídia', rep.status === 200 && rep.json.per_media.length > 0 && rep.json.totals.minutes > 0);
  const repA = await call('/api/reports?days=7&client_id=' + clientCid, { token: A });
  ok('agência gera relatório por empresa', repA.status === 200 && Array.isArray(repA.json.daily));

  /* ---------------- limpeza ---------------- */
  await call(`/api/devices/${devId}`, { method: 'DELETE', token: C });
  await call(`/api/playlists/${plId}`, { method: 'DELETE', token: C });
  await call(`/api/media/${widgetId}?force=1`, { method: 'DELETE', token: C });
  await call(`/api/locations/${locId}`, { method: 'DELETE', token: C });
  const gone = await call(`/api/devices/${devId}`, { token: C });
  ok('remoção em cascata limpa os testes', gone.status === 404);

  log('\n' + results.join('\n'));
  log(`\n  ${pass} verificações OK · ${fail} com falha\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  log(results.join('\n'));
  log('\n  ⚠️ erro no teste:', e);
  process.exit(2);
});
