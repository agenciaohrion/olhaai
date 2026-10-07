/**
 * SIMULADOR DE APARELHOS — finge TVs e tablets reais para você ver o painel vivo,
 * sem hardware na mão. Cada aparelho simulado:
 *   • pareia pelo código (POST /api/player/pair) e guarda o token
 *   • abre o WebSocket de dispositivo e responde aos comandos do painel
 *   • envia heartbeat com bateria/uptime/peça em exibição
 *   • tablets andam pela cidade e reportam GPS (veja o mapa mexer sozinho)
 *   • reporta minutos de exibição (alimenta os relatórios)
 *   • devolve uma "captura de tela" quando o painel pede
 *
 *   node scripts/simulate.mjs                    # todos os códigos com aparelhos do seed
 *   node scripts/simulate.mjs OLHA101 OLHA201    # só estes
 *   BASE=http://localhost:4000 TELS=4 node scripts/simulate.mjs
 */

const BASE = process.env.BASE || 'http://localhost:4000';
const CODES = process.argv.slice(2);
const TICK_MS = Number(process.env.TICK || 5000);
const PLAY_SECONDS = Number(process.env.SECS || 9);

const api = async (path, { method = 'GET', body, token } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(j?.error || `${method} ${path} → ${r.status}`);
  return j;
};

class Device {
  constructor(code) {
    this.code = code;
    this.moving = false;
    this.bearing = Math.random() * 360;
    this.battery = 45 + Math.round(Math.random() * 45);
    this.playing = null;
    this.startedAt = Date.now();
  }

  async start() {
    const pair = await api('/api/player/pair', {
      method: 'POST',
      body: {
        code: this.code,
        info: {
          ua: 'OLHA.Simulator/1.0 (Linux; Android 13) AppleWebKit/537.36',
          os: 'Android 13 · simulador',
          app_version: '1.4.0-sim',
          width: 1920,
          height: 1080,
          orientation: 'h',
        },
      },
    });
    this.token = pair.token;
    this.device = pair.device;
    this.manifest = pair.manifest;
    this.moving = pair.manifest.device.type === 'tablet' && (pair.manifest.location?.kind === 'movel' || Math.random() < 0.5);
    this.apply(pair.manifest);
    this.connectWs();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.playTimer = setInterval(() => this.advance(), PLAY_SECONDS * 1000);
    console.log(`  ▶ ${this.code}  ${this.device.name.padEnd(22)} ${this.manifest.client?.name || ''} ${this.moving ? '· em movimento' : ''}`);
    this.tick();
    this.advance();
  }

  /** Recarrega a grade depois de um comando do painel e conta para o servidor o modo efetivo. */
  async sync(label) {
    const m = await api('/api/player/manifest', { token: this.token }).catch(() => null);
    if (!m) return;
    this.apply(m);
    this.idx = -1;
    console.log(`    ${label} → ${this.device.name}: ${m.program.mode} · ${m.program.name || 'sem grade'}`);
  }

  apply(manifest) {
    this.manifest = manifest;
    this.hash = manifest.hash;
    this.mode = manifest.program.mode;
  }

  connectWs(attempt = 0) {
    const again = (why) => {
      if (this.stopping) return;
      const wait = Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4));
      console.log(`    ⚠︎  ${this.device.name}: tempo real ${why} — nova tentativa em ${wait / 1000}s`);
      setTimeout(() => this.connectWs(attempt + 1), wait);
    };
    try {
      this.ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?kind=device&token=${encodeURIComponent(this.token)}`);
    } catch {
      again('não conectou');
      return;
    }
    this.ws.onopen = () => {
      this.wsFell = false;
      console.log(`    ⇄ ${this.device.name}: tempo real conectado`);
    };
    this.ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'manifest:changed') {
        const m = await api('/api/player/manifest', { token: this.token }).catch(() => null);
        if (m) {
          this.apply(m);
          console.log(`    ↻ ${this.device.name}: nova grade aplicada (${m.program.name || 'vazio'})`);
        }
      } else if (msg.type === 'mode') {
        this.mode = msg.payload.mode;
        console.log(`    ⏯  ${this.device.name}: modo → ${this.mode}`);
      } else if (msg.type === 'cmd') {
        await this.run(msg.payload.action, msg.payload);
      }
    };
    this.ws.onclose = () => again('caiu');
    this.ws.onerror = () => {};
  }

  async run(action, payload = {}) {
    try {
      if (action === 'reload') {
        const m = await api('/api/player/manifest', { token: this.token });
        this.apply(m);
        console.log(`    ↻ ${this.device.name}: recarregado`);
      } else if (action === 'screenshot') {
        await this.shoot();
      } else if (action === 'locate') {
        await api('/api/player/geo', { method: 'POST', token: this.token, body: this.geo() });
      } else if (action === 'clear') {
        await api('/api/player/log', { method: 'POST', token: this.token, body: { type: 'cache', message: 'cache limpo pelo aparelho (simulação)' } });
      } else if (action === 'pause' || action === 'resume' || action === 'takeover') {
        await this.sync(`⏯  ${action}`);
      } else if (action === 'identify') {
        console.log(`    👋 ${this.device.name}: piscando para identificação`);
      }
    } catch (e) {
      console.log(`    ! ${this.device.name}: ${e.message}`);
    }
  }

  geo() {
    const base = { lat: this.manifest.location?.lat ?? -5.09, lng: this.manifest.location?.lng ?? -42.8 };
    if (this.moving) {
      const r = 0.0009;
      base.lat += Math.cos((this.bearing * Math.PI) / 180) * r;
      base.lng += Math.sin((this.bearing * Math.PI) / 180) * r;
      this.bearing = (this.bearing + (Math.random() * 50 - 25) + 360) % 360;
    }
    return { lat: +base.lat.toFixed(6), lng: +base.lng.toFixed(6), accuracy: this.moving ? 6 + Math.random() * 12 : 14, speed: this.moving ? 4 + Math.random() * 14 : 0, bearing: Math.round(this.bearing), source: 'gps' };
  }

  async tick() {
    if (this.moving) {
      const g = this.geo();
      this.lastGeo = g;
      await api('/api/player/geo', { method: 'POST', token: this.token, body: g }).catch(() => {});
    }
    this.battery = Math.max(3, Math.min(100, this.battery + (Math.random() < 0.6 ? -0.4 : 0.9)));
    const body = {
      hash: this.hash,
      mode: this.mode,
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      battery: Math.round(this.battery),
      charging: this.battery > 60 ? 1 : 0,
      playing: this.playing,
      app_version: '1.4.0-sim',
      width: 1920,
      height: 1080,
    };
    if (this.lastGeo) body.geo = this.lastGeo;
    const r = await api('/api/player/heartbeat', { method: 'POST', token: this.token, body }).catch((e) => {
      console.log(`    ! ${this.device.name} heartbeat: ${e.message}`);
      return null;
    });
    if (!r) return;
    if (r.changed && r.manifest) this.apply(r.manifest);
    for (const c of r.commands || []) await this.run(c.payload?.action || c.type, c.payload || {});
  }

  async advance() {
    const items = this.manifest?.program?.items || [];
    if (!items.length || this.mode !== 'playlist') return;
    this.idx = ((this.idx || 0) + 1) % items.length;
    const it = items[this.idx];
    this.playing = { media_id: it.media.id, ms: PLAY_SECONDS * 1000, playlist_id: this.manifest.program.id };
    await api('/api/player/log', { method: 'POST', token: this.token, body: { type: 'info', media_id: it.media.id, message: `exibindo: ${it.media.title}` } }).catch(() => {});
    if (Math.random() < 0.28) await this.shoot();
  }

  /** "captura" desenhada como SVG do que a tela estaria mostrando */
  async shoot() {
    const it = this.manifest?.program?.items?.[this.idx || 0];
    const title = (it?.media?.title || this.manifest?.program?.name || 'tela em espera').replace(/[<>&]/g, '');
    const W = 800;
    const H = 450;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${this.mode === 'paused' ? '#3b2a10' : '#161d45'}"/><stop offset="1" stop-color="#05070f"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#7c5cff" stroke-opacity=".35" rx="14"/><text x="46" y="86" font-family="Inter,Arial" font-size="17" letter-spacing="4" fill="#22d3ee">${esc(this.manifest?.device?.name || '')}</text><text x="46" y="${H / 2}" font-family="Inter,Arial" font-size="42" font-weight="700" fill="#e9ecff">${esc(cut(title, 26))}</text><text x="46" y="${H / 2 + 46}" font-family="Inter,Arial" font-size="20" fill="#8d98c4">${esc(this.manifest?.client?.name || '')} · ${it?.media?.kind || 'idle'}</text><text x="46" y="${H - 52}" font-family="Inter,Arial" font-size="15" fill="#5c668f">${new Date().toLocaleString('pt-BR')} · modo ${this.mode} · simulador</text><circle cx="${W - 60}" cy="70" r="9" fill="${this.mode === 'paused' ? '#fbbf24' : '#34d399'}"/></svg>`;
    const buf = Buffer.from(svg);
    const fd = new FormData();
    fd.append('shot', new Blob([buf], { type: 'image/svg+xml' }), 'shot.svg');
    fd.append('w', String(W));
    fd.append('h', String(H));
    try {
      const r = await fetch(BASE + '/api/player/screenshot', { method: 'POST', headers: { authorization: `Bearer ${this.token}` }, body: fd });
      if (r.ok) console.log(`    📸 ${this.device.name}: captura enviada`);
    } catch {
      /* servidor fora do ar: tenta de novo no próximo ciclo */
    }
  }

  stop() {
    this.stopping = true;
    clearInterval(this.timer);
    clearInterval(this.playTimer);
    try {
      this.ws?.close();
    } catch {}
  }
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

process.on('unhandledRejection', (e) => console.log(`    ! simulação: ${(e && e.message) || e}`));

async function main() {
  console.log(`\n  OLHA.AI · simulador de aparelhos → ${BASE}\n`);
  let codes = CODES;
  if (!codes.length) {
    // pega todos os aparelhos criados pelo seed, com o código de pareamento
    const admin = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@olha.ai', password: 'olha12345' } });
    const devs = await api('/api/devices', { token: admin.token });
    codes = devs.map((d) => d.pairing_code);
  }
  const devices = codes.map((c) => new Device(c));
  for (const d of devices) {
    await d.start().catch((e) => console.log(`  ✗ ${d.code}: ${e.message}`));
  }
  console.log(`\n  ${devices.length} aparelho(s) simulados · heartbeat a cada ${TICK_MS / 1000}s · Ctrl+C para parar\n`);
  const stop = () => {
    devices.forEach((d) => d.stop());
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
