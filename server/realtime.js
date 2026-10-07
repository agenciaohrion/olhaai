/**
 * Tempo real: WebSocket compartilhado entre painel (agência/cliente) e aparelhos (TV/tablet).
 * - Painel recebe presença, logs, GPS e confirmações de publicação ao vivo.
 * - Aparelho recebe empurrões de "recarregar grade", comandos remotos (pausar, takeover, screenshot)
 *   e envia heartbeat com telemetria. Comandos para aparelhos offline ficam em fila e são
 *   entregues no próximo heartbeat (garante operação mesmo com internet instável).
 */
import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { verify } from './auth.js';
import { get, all, insert, update, run, nowISO } from './db.js';

const admins = new Set(); // {ws, user}
const deviceSockets = new Map(); // deviceId -> Set<ws>
const commandQueue = new Map(); // deviceId -> [msg]
const ONLINE_WINDOW_MS = Number(process.env.OLHA_ONLINE_WINDOW || 40_000);

export function isOnline(device) {
  if (deviceSockets.has(device.id) && deviceSockets.get(device.id).size) return true;
  if (!device.last_seen) return false;
  const last = new Date(device.last_seen.includes('T') ? device.last_seen : device.last_seen.replace(' ', 'T') + 'Z').getTime();
  return Date.now() - last < ONLINE_WINDOW_MS;
}

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, payload, at: new Date().toISOString() }));
}

export function broadcast(type, payload = {}, { clientId = null } = {}) {
  for (const { ws, user } of admins) {
    if (clientId && user.role === 'client' && Number(user.client_id) !== Number(clientId)) continue;
    send(ws, type, payload);
  }
}

export function pushToDevice(deviceId, msg) {
  const socks = deviceSockets.get(deviceId);
  if (socks?.size) {
    for (const ws of socks) send(ws, msg.type, msg.payload ?? {});
    return true;
  }
  const q = commandQueue.get(deviceId) || [];
  q.push(msg);
  commandQueue.set(deviceId, q.slice(-25));
  return false;
}

/** O aparelho está com WebSocket aberto agora? (painel usa para empurrar em vez de esperar polling) */
export function hasDeviceSocket(deviceId) {
  const set = deviceSockets.get(Number(deviceId));
  return !!set && set.size > 0;
}

export function drainCommands(deviceId) {
  const q = commandQueue.get(deviceId) || [];
  commandQueue.set(deviceId, []);
  return q;
}

/** Registra um comando remoto vindo do painel. */
export const REMOTE_ACTIONS = new Set(['reload', 'screenshot', 'pause', 'resume', 'takeover', 'clear', 'identify', 'locate']);

export function remoteAction(device, action, payload = {}) {
  if (!REMOTE_ACTIONS.has(action)) {
    const err = new Error('ação inválida');
    err.status = 422;
    throw err;
  }
  let delivered = false;
  if (action === 'pause') {
    update('devices', device.id, { mode: 'paused' });
    delivered = pushToDevice(device.id, { type: 'mode', payload: { mode: 'paused' } });
  } else if (action === 'resume') {
    update('devices', device.id, { mode: 'playlist', takeover_media_id: null });
    delivered = pushToDevice(device.id, { type: 'mode', payload: { mode: 'playlist' } });
  } else delivered = pushToDevice(device.id, { type: 'cmd', payload: { action, ...payload } });

  insert('device_logs', { device_id: device.id, type: 'cmd', payload: { action, ...payload, entregue: delivered } });
  broadcast('device:cmd', { device_id: device.id, action, entregue: delivered }, { clientId: device.client_id });
  return delivered;
}

/** Avisa todos os aparelhos de um cliente que a grade mudou (invalidação por versão). */
export function invalidateClient(clientId) {
  const devices = all('SELECT id FROM devices WHERE client_id=?', [clientId]);
  for (const d of devices) pushToDevice(d.id, { type: 'manifest:changed', payload: { reason: 'publicacao' } });
  broadcast('network:changed', { clientId });
}

export function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/ws')) return; // deixa outros upgrades passarem (HMR etc.)
    const token = url.searchParams.get('token');
    const kind = url.searchParams.get('kind') || 'admin';

    if (kind === 'device') {
      const device = get('SELECT * FROM devices WHERE token=?', [token]);
      if (!device) return socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => bindDevice(ws, device));
      return;
    }

    const payload = verify(token);
    const user = payload?.uid ? get('SELECT * FROM users WHERE id=?', [payload.uid]) : null;
    if (!user) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => bindAdmin(ws, user));
  });

  function bindAdmin(ws, user) {
    const entry = { ws, user };
    admins.add(entry);
    send(ws, 'hello', { role: user.role, name: user.name, devices: onlineSnapshot(user) });
    ws.on('close', () => admins.delete(entry));
    ws.on('error', () => admins.delete(entry));
  }

  function bindDevice(ws, device) {
    let set = deviceSockets.get(device.id);
    if (!set) deviceSockets.set(device.id, (set = new Set()));
    set.add(ws);
    markOnline(device);
    send(ws, 'hello', { device_id: device.id, name: device.name });
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      handleDeviceMessage(device, msg, ws);
    });
    ws.on('close', () => {
      set.delete(ws);
      if (!set.size) deviceSockets.delete(device.id);
      markOffline(device);
    });
    ws.on('error', () => {});
  }

  // ping/pong para limpar conexões mortas
  setInterval(() => {
    for (const set of deviceSockets.values())
      for (const ws of set) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {}
      }
  }, 20_000);

  // varredura de presença para o painel
  setInterval(() => {
    const devices = all("SELECT * FROM devices WHERE token IS NOT NULL");
    for (const d of devices) {
      const online = isOnline(d);
      const flag = online ? 'online' : 'offline';
      if (d.status !== flag) {
        update('devices', d.id, { status: flag });
        broadcast('device:status', { device_id: d.id, client_id: d.client_id, status: flag, name: d.name });
      }
    }
  }, 15_000);

  return { wss, stats: () => ({ admins: admins.size, sockets: deviceSockets.size }) };
}

function onlineSnapshot(user) {
  const rows =
    user.role === 'agency'
      ? all('SELECT id,status,client_id,name FROM devices')
      : all('SELECT id,status,client_id,name FROM devices WHERE client_id=?', [user.client_id]);
  return rows.filter((r) => isOnline(r)).map((r) => r.id);
}

function markOnline(device) {
  update('devices', device.id, { status: 'online', last_seen: nowISO() });
  broadcast('device:status', { device_id: device.id, client_id: device.client_id, status: 'online', name: device.name }, {
    clientId: device.client_id,
  });
}
function markOffline(device) {
  if (deviceSockets.has(device.id)) return;
  update('devices', device.id, { status: 'offline' });
  broadcast('device:status', { device_id: device.id, client_id: device.client_id, status: 'offline', name: device.name }, {
    clientId: device.client_id,
  });
}

function handleDeviceMessage(device, msg, ws) {
  const clientId = device.client_id;
  switch (msg.type) {
    case 'heartbeat':
    case 'telemetry': {
      const p = msg.payload || {};
      const patch = { last_seen: nowISO(), status: 'online' };
      for (const k of ['battery', 'charging', 'uptime', 'width', 'height', 'app_version', 'os']) if (p[k] !== undefined) patch[k] = p[k];
      if (p.geo && Number.isFinite(p.geo.lat) && Number.isFinite(p.geo.lng)) {
        patch.lat = p.geo.lat;
        patch.lng = p.geo.lng;
        patch.accuracy = p.geo.accuracy ?? null;
        patch.bearing = p.geo.bearing ?? null;
        patch.speed = p.geo.speed ?? null;
        patch.geo_source = p.geo.source || 'gps';
        patch.geo_at = nowISO();
      }
      if (p.playing) patch.playlist_id = p.playing.playlist_id ?? device.playlist_id;
      update('devices', device.id, patch);
      if (p.playing?.media_id && p.playing?.ms) {
        insert('playlog', {
          device_id: device.id,
          media_id: p.playing.media_id,
          ms: Math.min(Number(p.playing.ms) || 0, 600_000),
          day: new Date().toISOString().slice(0, 10),
        });
      }
      const cmds = drainCommands(device.id);
      send(ws, 'ack', { server_time: Date.now(), manifest_version: device.version ?? null, commands: cmds });
      broadcast('device:telemetry', { device_id: device.id, client_id: clientId, ...patch, playing: p.playing || null }, { clientId });
      break;
    }
    case 'log': {
      const p = msg.payload || {};
      insert('device_logs', { device_id: device.id, type: p.type || 'info', media_id: p.media_id ?? null, payload: p });
      broadcast('device:log', { device_id: device.id, client_id: clientId, ...p }, { clientId });
      break;
    }
    case 'position': {
      const p = msg.payload || {};
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
      update('devices', device.id, {
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
        bearing: p.bearing ?? null,
        speed: p.speed ?? null,
        geo_source: p.source || 'gps',
        geo_at: nowISO(),
      });
      run('INSERT INTO device_logs(device_id,type,payload) VALUES(?,?,?)', [device.id, 'gps', JSON.stringify(p)]);
      broadcast('device:position', { device_id: device.id, client_id: clientId, ...p }, { clientId });
      break;
    }
    default:
      send(ws, 'error', { error: 'tipo não suportado' });
  }
}

export function connectionStats() {
  return { admins: admins.size, device_sockets: deviceSockets.size, queued: [...commandQueue.values()].reduce((a, b) => a + b.length, 0) };
}
