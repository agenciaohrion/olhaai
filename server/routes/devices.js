import express from 'express';
import path from 'node:path';
import { all, get, insert, update, del, audit, nowISO } from '../db.js';
import { requireUser, guardRow, randomCode, randomToken } from '../auth.js';
import { wrap, bad, pick, safeUnlink } from '../lib.js';
import { resolveProgram, dayTimeline } from '../program.js';
import { isOnline, remoteAction } from '../realtime.js';

export const router = express.Router(); // exige login (montado dentro do bloco autenticado)

const FIELDS = ['client_id', 'location_id', 'name', 'type', 'orientation', 'width', 'height', 'notes', 'mode', 'playlist_id', 'takeover_media_id', 'lat', 'lng'];

const shape = (d) => ({ ...d, online: isOnline(d), token: undefined });

/** Lista de aparelhos (com ponto, empresa e o que está no ar agora). */
router.get(
  '/devices',
  wrap((req, res) => {
    const where = [];
    const params = [];
    if (req.user.role !== 'agency') {
      where.push('d.client_id = ?');
      params.push(req.user.client_id);
    } else if (req.query.client_id) {
      where.push('d.client_id = ?');
      params.push(Number(req.query.client_id));
    }
    if (req.query.location_id) {
      where.push('d.location_id = ?');
      params.push(Number(req.query.location_id));
    }
    const rows = all(
      `SELECT d.*, c.name AS client_name, l.name AS location_name, l.address AS location_address, p.name AS playlist_name
         FROM devices d
         JOIN clients c ON c.id = d.client_id
         LEFT JOIN locations l ON l.id = d.location_id
         LEFT JOIN playlists p ON p.id = d.playlist_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.name, l.name, d.name`,
      params
    );
    const now = new Date();
    res.json(
      rows.map((d) => {
        const out = shape(d);
        const prog = resolveProgram(d, now);
        return {
          ...out,
          on_air: prog.playlist ? { id: prog.playlist.id, name: prog.playlist.name, items: prog.items.length } : null,
          mode: prog.mode,
          program_source: prog.source,
          current: reportedNow(d.id),
          screenshot: get('SELECT filename FROM screenshots WHERE device_id=? ORDER BY id DESC LIMIT 1', [d.id])?.filename || null,
        };
      })
    );
  })
);

/** Último conteúdo efetivamente exibido (reportado pelo próprio aparelho). */
function reportedNow(deviceId) {
  const log = get("SELECT media_id, created_at FROM device_logs WHERE device_id=? AND type='play' ORDER BY id DESC LIMIT 1", [deviceId]);
  if (!log?.media_id) return null;
  const m = get('SELECT id,title,kind FROM media WHERE id=?', [log.media_id]);
  return m ? { ...m, at: log.created_at } : null;
}

router.get(
  '/devices/:id',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    const prog = resolveProgram(d);
    res.json({
      ...shape(d),
      program: prog,
      timeline: prog.playlist ? dayTimeline(prog.playlist.id) : [],
      logs: all('SELECT * FROM device_logs WHERE device_id=? ORDER BY id DESC LIMIT 60', [d.id]),
      screenshots: all('SELECT * FROM screenshots WHERE device_id=? ORDER BY id DESC LIMIT 12', [d.id]),
      playlog: all('SELECT day, SUM(ms) ms, COUNT(*) plays FROM playlog WHERE device_id=? GROUP BY day ORDER BY day DESC LIMIT 14', [d.id]),
    });
  })
);

/** Cadastro manual pelo painel → gera código de pareamento para instalar na TV/tablet. */
router.post(
  '/devices',
  wrap((req, res) => {
    const b = req.body || {};
    const client_id = req.user.role === 'agency' ? Number(b.client_id) : req.user.client_id;
    if (!client_id) bad(422, 'informe a empresa');
    if (!b.name) bad(422, 'informe o nome do aparelho');
    if (b.location_id) {
      const loc = get('SELECT * FROM locations WHERE id=?', [b.location_id]);
      if (!loc || Number(loc.client_id) !== client_id) bad(422, 'ponto inválido para esta empresa');
    }
    let code = randomCode(6);
    while (get('SELECT id FROM devices WHERE pairing_code=?', [code])) code = randomCode(6);
    const id = insert('devices', {
      ...pick({ ...b, client_id }, FIELDS),
      uid: 'dev_' + randomCode(10).toLowerCase() + Date.now().toString(36),
      pairing_code: code,
      status: 'pendente',
    });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'device:create', entity: 'device', entity_id: id, client_id, detail: b.name });
    res.status(201).json(get('SELECT * FROM devices WHERE id=?', [id]));
  })
);

router.patch(
  '/devices/:id',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    const b = { ...req.body };
    if (req.user.role !== 'agency') delete b.client_id;
    const patch = pick(b, FIELDS.filter((f) => f !== 'lat' && f !== 'lng'));
    // posição definida manualmente no painel = origem "painel"
    if (b.lat !== undefined || b.lng !== undefined) {
      if (b.lat === '' || b.lng === '' || b.lat === null) {
        update('devices', d.id, { lat: null, lng: null });
      } else {
        patch.lat = Number(b.lat);
        patch.lng = Number(b.lng);
        patch.geo_source = 'painel';
        patch.geo_at = nowISO();
      }
    }
    if (patch.mode && patch.mode !== 'takeover') patch.takeover_media_id = null;
    const changedProgram = ['mode', 'playlist_id', 'takeover_media_id'].some((k) => patch[k] !== undefined);
    update('devices', d.id, patch);
    if (changedProgram) {
      const fresh = get('SELECT * FROM devices WHERE id=?', [d.id]);
      remoteAction(fresh, 'reload');
    }
    res.json(get('SELECT * FROM devices WHERE id=?', [d.id]));
  })
);

router.delete(
  '/devices/:id',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    for (const s of all('SELECT filename FROM screenshots WHERE device_id=?', [d.id])) safeUnlink(path.join('uploads', 'shots', s.filename));
    del('devices', d.id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'device:delete', entity: 'device', entity_id: d.id, client_id: d.client_id, detail: d.name });
    res.json({ ok: true });
  })
);

/** Gera novo código de pareamento (revoga o token atual). */
router.post(
  '/devices/:id/rotate-code',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    let code = randomCode(6);
    while (get('SELECT id FROM devices WHERE pairing_code=?', [code])) code = randomCode(6);
    update('devices', d.id, { pairing_code: code, token: null, status: 'pendente', paired_at: null });
    res.json(get('SELECT * FROM devices WHERE id=?', [d.id]));
  })
);

/** Desvincular (o aparelho volta para a tela de pareamento). */
router.post(
  '/devices/:id/unpair',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    update('devices', d.id, { token: null, status: 'pendente', paired_at: null });
    res.json({ ok: true, pairing_code: get('SELECT pairing_code FROM devices WHERE id=?', [d.id]).pairing_code });
  })
);

/** Comando remoto: recarregar, pausar, retomar, takeover, captura de tela, identificar. */
router.post(
  '/devices/:id/action',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    const { action, ...payload } = req.body || {};
    if (action === 'takeover') {
      const media = get('SELECT * FROM media WHERE id=?', [Number(payload.media_id)]);
      if (!media) bad(422, 'conteúdo do destaque não encontrado');
      guardRow(req, media);
      update('devices', d.id, { mode: 'takeover', takeover_media_id: media.id });
    }
    const delivered = remoteAction(d, action, payload);
    if (action === 'resume') update('devices', d.id, { mode: 'playlist', takeover_media_id: null });
    res.json({ ok: true, delivered_now: delivered, message: delivered ? 'enviado ao aparelho' : 'aparelho offline — comando na fila para o próximo contato' });
  })
);

router.get(
  '/devices/:id/program',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    const prog = resolveProgram(d);
    res.json({ ...prog, timeline: prog.playlist ? dayTimeline(prog.playlist.id) : [], device: shape(d) });
  })
);

router.get(
  '/devices/:id/qr',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    res.json({ code: d.pairing_code, url: `player?code=${d.pairing_code}` });
  })
);

/* ---------------------------- mapa / localização ---------------------------- */

router.get(
  '/map',
  wrap((req, res) => {
    const cid = req.user.role === 'agency' ? (req.query.client_id ? Number(req.query.client_id) : null) : req.user.client_id;
    const params = cid ? [cid] : [];
    const devices = all(
      `SELECT d.*, c.name AS client_name, l.name AS location_name, l.kind AS location_kind, l.footfall
         FROM devices d JOIN clients c ON c.id=d.client_id
         LEFT JOIN locations l ON l.id=d.location_id
        ${cid ? 'WHERE d.client_id=?' : ''} ORDER BY d.name`,
      params
    );
    const locations = all(
      `SELECT * FROM locations ${cid ? 'WHERE client_id=?' : ''} ORDER BY name`,
      params
    );
    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        uid: d.uid,
        name: d.name,
        type: d.type,
        orientation: d.orientation,
        status: d.status,
        online: isOnline(d),
        last_seen: d.last_seen,
        client_id: d.client_id,
        client_name: d.client_name,
        location_id: d.location_id,
        location_name: d.location_name,
        lat: d.lat,
        lng: d.lng,
        accuracy: d.accuracy,
        geo_source: d.geo_source,
        geo_at: d.geo_at,
        battery: d.battery,
        playlist_name: null,
        mode: d.mode,
      })),
      locations: locations.map((l) => ({
        ...l,
        device_count: get('SELECT COUNT(*) n FROM devices WHERE location_id=?', [l.id]).n,
        online: get("SELECT COUNT(*) n FROM devices WHERE location_id=? AND status='online'", [l.id]).n,
      })),
    });
  })
);

/** Histórico de posições (rastreamento de tablets em veículos). */
router.get(
  '/devices/:id/trail',
  wrap((req, res) => {
    const d = guardRow(req, get('SELECT * FROM devices WHERE id=?', [req.params.id]));
    const rows = all("SELECT created_at, payload FROM device_logs WHERE device_id=? AND type='gps' ORDER BY id DESC LIMIT 300", [d.id]);
    res.json(
      rows
        .map((r) => {
          try {
            const p = JSON.parse(r.payload || '{}');
            return { at: r.created_at, lat: p.lat, lng: p.lng, speed: p.speed ?? null, accuracy: p.accuracy ?? null };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse()
    );
  })
);

/** Presença agregada para o painel. */
router.get(
  '/devices-meta',
  wrap((req, res) => {
    const cid = req.user.role === 'agency' ? (req.query.client_id ? Number(req.query.client_id) : null) : req.user.client_id;
    const params = cid ? [cid] : [];
    const rows = all(
      `SELECT d.*, l.name AS location_name FROM devices d LEFT JOIN locations l ON l.id=d.location_id ${cid ? 'WHERE d.client_id=?' : ''}`,
      params
    );
    const byType = {};
    const byStatus = { online: 0, offline: 0, pendente: 0 };
    let withGeo = 0;
    for (const d of rows) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      byStatus[isOnline(d) ? 'online' : d.token ? 'offline' : 'pendente']++;
      if (d.lat != null) withGeo++;
    }
    res.json({ total: rows.length, byType, byStatus, withGeo, locations: get('SELECT COUNT(*) n FROM locations' + (cid ? ' WHERE client_id=?' : ''), params).n });
  })
);
