/**
 * API consumida pelo runtime de TV Box / Android TV / Tablet / Painel Windows.
 * Autenticada pelo token do aparelho (não usa login do painel).
 */
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { all, get, insert, update, run, UPLOAD_DIR, audit } from '../db.js';
import { requireDevice } from '../auth.js';
import { wrap, bad } from '../lib.js';
import { resolveProgram } from '../program.js';
import { broadcast, connectionStats, drainCommands } from '../realtime.js';

export const router = express.Router();

/**
 * Extensão segue o tipo que o aparelho mandou — senão o navegador recebe
 * image/jpeg em cima de um PNG/SVG e o <img> do painel fica quebrado.
 */
const SHOT_EXT = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif' };
const shots = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, 'shots')),
  filename: (req, file, cb) => cb(null, `${req.device.id}-${Date.now()}${SHOT_EXT[file.mimetype] || '.jpg'}`),
});
const shotUpload = multer({ storage: shots, limits: { fileSize: 6 * 1024 * 1024 } });

/** Hash do estado da grade — o player compara para saber se precisa recarregar. */
export function manifestHash(prog, device) {
  const s = [
    device.mode,
    device.takeover_media_id,
    prog.playlist?.id,
    prog.playlist?.version,
    prog.items.map((i) => `${i.media.id}:${i.duration_ms ?? ''}`).join(','),
    prog.playlist?.bg,
  ].join('|');
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

function manifestFor(device) {
  const prog = resolveProgram(device);
  const client = get('SELECT id,name,brand,city,state FROM clients WHERE id=?', [device.client_id]);
  const location = device.location_id ? get('SELECT * FROM locations WHERE id=?', [device.location_id]) : null;
  return {
    device: {
      id: device.id,
      uid: device.uid,
      name: device.name,
      type: device.type,
      orientation: device.orientation,
      mode: device.mode,
      geo_required: device.type === 'tablet',
      refresh_sec: 20,
    },
    client,
    location,
    program: {
      id: prog.playlist?.id ?? null,
      name: prog.playlist?.name ?? null,
      version: prog.playlist?.version ?? 0,
      orientation: prog.playlist?.orientation || device.orientation,
      bg: prog.playlist?.bg || '#05070f',
      mode: prog.mode,
      source: prog.source,
      items: prog.items.map((i) => ({
        item_id: i.item_id,
        duration_ms: i.duration_ms,
        media: {
          id: i.media.id,
          kind: i.media.kind,
          title: i.media.title,
          src: i.media.filename ? `/uploads/${i.media.filename}` : null,
          url: i.media.url,
          body: i.media.body,
          orientation: i.media.orientation,
          checksum: i.media.checksum,
          duration_ms: i.media.duration_ms,
          width: i.media.width,
          height: i.media.height,
          bytes: i.media.bytes,
          mime: i.media.mime,
        },
      })),
    },
    hash: manifestHash(prog, device),
    server_time: Date.now(),
  };
}

/** Tela do player chama isto na primeira vez, com o código exibido no painel. */
router.post(
  '/player/pair',
  wrap((req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (code.length < 4) bad(422, 'informe o código de pareamento');
    const device = get('SELECT * FROM devices WHERE pairing_code=?', [code]);
    if (!device) bad(404, 'código inválido ou já utilizado — gere um novo no painel');
    const info = req.body?.info || {};
    const patch = {
      status: 'online',
      paired_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      token: device.token || crypto.randomBytes(24).toString('base64url'),
      os: info.os || null,
      ua: (info.ua || '').slice(0, 240),
      app_version: info.app_version || null,
    };
    if (info.width && info.height) {
      patch.width = Number(info.width);
      patch.height = Number(info.height);
      patch.orientation = info.orientation || (info.height > info.width ? 'v' : 'h');
    }
    if (info.name && !device.name) patch.name = info.name;
    applyGeo(patch, info.geo);
    update('devices', device.id, patch);
    const fresh = get('SELECT * FROM devices WHERE id=?', [device.id]);
    insert('device_logs', { device_id: fresh.id, type: 'paired', payload: { ip: req.ip, ua: patch.ua } });
    broadcast('device:paired', { device_id: fresh.id, client_id: fresh.client_id, name: fresh.name }, { clientId: fresh.client_id });
    audit({ actor: `device:${fresh.name}`, action: 'device:pair', entity: 'device', entity_id: fresh.id, client_id: fresh.client_id });
    res.json({ token: fresh.token, device: { id: fresh.id, name: fresh.name, type: fresh.type, orientation: fresh.orientation }, manifest: manifestFor(fresh) });
  })
);

/** Consulta pública do estado do pareamento (mostrado na tela antes do pareamento). */
router.get(
  '/player/status',
  wrap((req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    const d = get('SELECT id,name,status,pairing_code,client_id FROM devices WHERE id=? OR pairing_code=?', [Number(req.query.device_id) || 0, code]);
    if (!d) bad(404, 'não encontrado');
    res.json({ device_id: d.id, name: d.name, paired: !!get('SELECT token FROM devices WHERE id=?', [d.id])?.token, status: d.status });
  })
);

/** Manifest completo. */
router.get(
  '/player/manifest',
  requireDevice,
  wrap((req, res) => {
    res.json(manifestFor(req.device));
  })
);

/** Só o hash — checagem barata a cada ciclo de polling. */
router.get(
  '/player/version',
  requireDevice,
  wrap((req, res) => {
    const m = manifestFor(req.device);
    res.json({ hash: m.hash, mode: m.program.mode, playlist: m.program.id, version: m.program.version });
  })
);

router.post(
  '/player/heartbeat',
  requireDevice,
  wrap((req, res) => {
    const p = req.body || {};
    const patch = { status: 'online', last_seen: new Date().toISOString() };
    if (p.uptime != null) patch.uptime = Number(p.uptime) || 0;
    if (p.playing_ms != null) patch.playing_ms = Number(p.playing_ms) || 0;
    if (p.battery != null) patch.battery = Math.round(Number(p.battery));
    if (p.charging != null) patch.charging = p.charging ? 1 : 0;
    if (p.width && p.height) {
      patch.width = Number(p.width);
      patch.height = Number(p.height);
    }
    if (p.app_version) patch.app_version = p.app_version;
    if (p.os) patch.os = p.os;
    applyGeo(patch, p.geo);
    // modo efetivo: se o player reportar outro modo, sincroniza para o painel
    if (p.mode && ['playlist', 'paused', 'takeover'].includes(p.mode) && p.mode !== req.device.mode) patch.mode = p.mode;
    if (p.playlist_id !== undefined) patch.playlist_id = p.playlist_id || null;
    update('devices', req.device.id, patch);

    if (p.playing?.media_id && p.playing?.ms) {
      const ms = Math.min(Number(p.playing.ms) || 0, 900_000);
      insert('playlog', { device_id: req.device.id, media_id: Number(p.playing.media_id), ms, day: new Date().toISOString().slice(0, 10) });
      insert('device_logs', { device_id: req.device.id, type: 'play', media_id: Number(p.playing.media_id), payload: { ms } });
    }
    if (p.error) insert('device_logs', { device_id: req.device.id, type: 'error', payload: { message: String(p.error).slice(0, 400) } });

    const fresh = get('SELECT * FROM devices WHERE id=?', [req.device.id]);
    const m = manifestFor(fresh);
    const changed = p.hash && p.hash !== m.hash;
    res.json({
      hash: m.hash,
      changed: !!changed,
      mode: m.program.mode,
      commands: drainCommands(fresh.id),
      server_time: Date.now(),
      ws: isDeviceWs(fresh.id),
      stats: connectionStats(),
      ...(changed ? { manifest: m } : {}),
    });
  })
);

/** WebSocket do aparelho está aberto? Se sim, o painel não precisa esperar o polling. */
function isDeviceWs() {
  return false;
}

router.post(
  '/player/log',
  requireDevice,
  wrap((req, res) => {
    const p = req.body || {};
    insert('device_logs', {
      device_id: req.device.id,
      type: ['cache', 'error', 'info', 'offline', 'online'].includes(p.type) ? p.type : 'info',
      media_id: p.media_id ? Number(p.media_id) : null,
      payload: { ...(p.payload || {}), message: p.message ? String(p.message).slice(0, 500) : null },
    });
    if (p.type === 'error') broadcast('device:error', { device_id: req.device.id, client_id: req.device.client_id, message: p.message }, { clientId: req.device.client_id });
    res.json({ ok: true });
  })
);

/** Posição reportada de forma independente (tablet em veículo envia periodicamente). */
router.post(
  '/player/geo',
  requireDevice,
  wrap((req, res) => {
    const patch = {};
    if (!applyGeo(patch, req.body)) bad(422, 'coordenadas inválidas');
    update('devices', req.device.id, patch);
    insert('device_logs', { device_id: req.device.id, type: 'gps', payload: req.body });
    broadcast('device:position', { device_id: req.device.id, client_id: req.device.client_id, ...req.body }, { clientId: req.device.client_id });
    res.json({ ok: true });
  })
);

function applyGeo(patch, geo) {
  if (!geo) return false;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false;
  patch.lat = lat;
  patch.lng = lng;
  patch.accuracy = geo.accuracy != null ? Number(geo.accuracy) : null;
  patch.bearing = geo.bearing != null ? Number(geo.bearing) : null;
  patch.speed = geo.speed != null ? Number(geo.speed) : null;
  patch.geo_source = geo.source || 'gps';
  patch.geo_at = new Date(geo.timestamp || Date.now()).toISOString().replace('T', ' ').slice(0, 19);
  return true;
}

/** Captura do que está na tela (o painel mostra na hora, sem pedir ao técnico). */
router.post(
  '/player/screenshot',
  requireDevice,
  shotUpload.single('shot'),
  wrap((req, res) => {
    if (!req.file) bad(422, 'imagem não recebida');
    insert('screenshots', { device_id: req.device.id, filename: req.file.filename, w: req.body?.w ? Number(req.body.w) : null, h: req.body?.h ? Number(req.body.h) : null });
    // mantém só as 20 capturas mais recentes por aparelho
    for (const old of all('SELECT filename FROM screenshots WHERE device_id=? ORDER BY id DESC LIMIT -1 OFFSET 20', [req.device.id])) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, 'shots', old.filename));
      } catch {}
      run('DELETE FROM screenshots WHERE filename=?', [old.filename]);
    }
    broadcast('device:screenshot', { device_id: req.device.id, client_id: req.device.client_id, url: `/uploads/shots/${req.file.filename}` }, {
      clientId: req.device.client_id,
    });
    res.status(201).json({ ok: true, url: `/uploads/shots/${req.file.filename}` });
  })
);

/** Diagnóstico para o instalador: lista o que o aparelho deve ter em cache. */
router.get(
  '/player/cache',
  requireDevice,
  wrap((req, res) => {
    const m = manifestFor(req.device);
    res.json({
      hash: m.hash,
      assets: m.program.items
        .filter((i) => i.media.src)
        .map((i) => ({ media_id: i.media.id, src: i.media.src, kind: i.media.kind, title: i.media.title, checksum: i.media.checksum })),
    });
  })
);
