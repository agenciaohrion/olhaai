import express from 'express';
import { all, get, insert, update, audit } from '../db.js';
import { requireUser, visible } from '../auth.js';
import { wrap } from '../lib.js';
import { isOnline, connectionStats } from '../realtime.js';
import { resolveProgram } from '../program.js';

export const router = express.Router(); // exige login (montado dentro do bloco autenticado)

const OPEN_MINUTES_PER_DAY = 10 * 60; // janela comercial usada para estimar impressões

function scope(req) {
  const cid = visible(req, req.query.client_id);
  return cid;
}
const where = (cid, alias = '') => (cid ? `WHERE ${alias}client_id = ?` : '');
const wcond = (cid, alias = '') => (cid ? `AND ${alias}client_id = ?` : '');

router.get(
  '/overview',
  wrap((req, res) => {
    const cid = scope(req);
    const p = cid ? [cid] : [];
    const today = new Date().toISOString().slice(0, 10);

    const devices = all(`SELECT * FROM devices ${where(cid)}`, p);
    const online = devices.filter((d) => isOnline(d));
    const pending = devices.filter((d) => !d.token);
    const withGeo = devices.filter((d) => d.lat != null);
    const stale = devices
      .filter((d) => d.token && !isOnline(d))
      .map((d) => ({ ...d, minutes: d.last_seen ? Math.round((Date.now() - new Date(d.last_seen.replace(' ', 'T') + 'Z').getTime()) / 60000) : null }))
      .sort((a, b) => (b.minutes ?? 1e9) - (a.minutes ?? 1e9))
      .slice(0, 8);

    const dayAgg = get(
      `SELECT COALESCE(SUM(p.ms),0) ms, COUNT(*) plays, COUNT(DISTINCT p.device_id) screens
         FROM playlog p JOIN devices d ON d.id=p.device_id
        WHERE p.day = ? ${cid ? 'AND d.client_id=?' : ''}`,
      cid ? [today, cid] : [today]
    );
    const weekAgg = get(
      `SELECT COALESCE(SUM(p.ms),0) ms, COUNT(*) plays FROM playlog p JOIN devices d ON d.id=p.device_id
        WHERE p.day >= date('now','-6 days') ${wcond(cid, 'd.')}`,
      p
    );

    const hourBuckets = all(
      `SELECT CAST(strftime('%H', p.created_at) AS INTEGER) h, SUM(p.ms) ms
         FROM playlog p JOIN devices d ON d.id=p.device_id
        WHERE p.day = ? ${cid ? 'AND d.client_id=?' : ''} GROUP BY h ORDER BY h`,
      cid ? [today, cid] : [today]
    );

    res.json({
      role: req.user.role,
      client_id: cid,
      counts: {
        clients: get('SELECT COUNT(*) n FROM clients').n,
        locations: get(`SELECT COUNT(*) n FROM locations ${where(cid)}`, p).n,
        media: get(`SELECT COUNT(*) n FROM media ${cid ? 'WHERE client_id=? OR public=1' : 'WHERE 1=1'}`, cid ? [cid] : []).n,
        playlists: get(`SELECT COUNT(*) n FROM playlists ${where(cid)}`, p).n,
        published: get(
          cid ? "SELECT COUNT(*) n FROM playlists WHERE client_id=? AND status='publicada'" : "SELECT COUNT(*) n FROM playlists WHERE status='publicada'",
          cid ? [cid] : []
        ).n,
        users: get(cid ? 'SELECT COUNT(*) n FROM users WHERE client_id=?' : "SELECT COUNT(*) n FROM users WHERE role='agency'", p).n,
      },
      screens: {
        total: devices.length,
        online: online.length,
        offline: devices.length - online.length - pending.length,
        pending: pending.length,
        with_geo: withGeo.length,
        by_type: devices.reduce((acc, d) => ({ ...acc, [d.type]: (acc[d.type] || 0) + 1 }), {}),
      },
      playback: {
        today_minutes: Math.round(dayAgg.ms / 60000),
        today_plays: dayAgg.plays,
        today_screens: dayAgg.screens,
        week_minutes: Math.round(weekAgg.ms / 60000),
        week_plays: weekAgg.plays,
        hour_buckets: hourBuckets.map((b) => ({ h: b.h, minutes: Math.round(b.ms / 60000) })),
      },
      alerts: {
        offline_stale: stale.map((d) => ({
          device_id: d.id,
          name: d.name,
          client_id: d.client_id,
          client: get('SELECT name FROM clients WHERE id=?', [d.client_id])?.name,
          location: get('SELECT name FROM locations WHERE id=?', [d.location_id])?.name,
          minutes_offline: d.minutes,
        })),
        unpaired: pending.map((d) => ({ device_id: d.id, name: d.name, client: get('SELECT name FROM clients WHERE id=?', [d.client_id])?.name })),
        no_geo: devices.filter((d) => d.token && d.lat == null).map((d) => ({ device_id: d.id, name: d.name })),
        clients_without_publication:
          cid === null
            ? all("SELECT id,name FROM clients c WHERE NOT EXISTS (SELECT 1 FROM playlists p WHERE p.client_id=c.id AND p.status='publicada')")
            : [],
      },
      realtime: connectionStats(),
      server_time: Date.now(),
    });
  })
);

/** Mapa completo de exibição: o que está no ar em cada aparelho neste instante. */
router.get(
  '/network-state',
  wrap((req, res) => {
    const cid = scope(req);
    const devices = all(
      `SELECT d.*, c.name AS client_name, l.name AS location_name, l.city, l.state
         FROM devices d JOIN clients c ON c.id=d.client_id LEFT JOIN locations l ON l.id=d.location_id
        ${where(cid, 'd.')} ORDER BY c.name, l.name, d.name`,
      cid ? [cid] : []
    );
    const at = new Date();
    res.json(
      devices.map((d) => {
        const prog = resolveProgram(d, at);
        const last = get("SELECT media_id FROM device_logs WHERE device_id=? AND type='play' ORDER BY id DESC LIMIT 1", [d.id]);
        // em destaque (takeover) a peça no ar é a do destaque — o aparelho não fica girando a grade
        const onAir = prog.source === 'takeover' ? prog.items[0]?.media : null;
        const m = onAir
          ? { title: onAir.title, kind: onAir.kind, filename: onAir.filename }
          : last?.media_id
          ? get('SELECT id,title,kind,filename FROM media WHERE id=?', [last.media_id])
          : null;
        return {
          current: m ? { id: m.id, title: m.title, kind: m.kind, src: m.filename ? `/uploads/${m.filename}` : null } : null,
          id: d.id,
          name: d.name,
          type: d.type,
          orientation: d.orientation,
          client_id: d.client_id,
          client_name: d.client_name,
          location: d.location_name,
          city: [d.city, d.state].filter(Boolean).join('/'),
          lat: d.lat,
          lng: d.lng,
          online: isOnline(d),
          last_seen: d.last_seen,
          battery: d.battery,
          mode: prog.mode,
          source: prog.source,
          playlist: prog.playlist ? { id: prog.playlist.id, name: prog.playlist.name, items: prog.items.length, version: prog.playlist.version } : null,
          next: prog.items[0]?.media?.title || null,
          uptime: d.uptime,
          geo_source: d.geo_source,
          geo_at: d.geo_at,
          screenshot: get('SELECT filename, created_at FROM screenshots WHERE device_id=? ORDER BY id DESC LIMIT 1', [d.id]),
        };
      })
    );
  })
);

/** Relatórios de exibição + estimativa de alcance. */
router.get(
  '/reports',
  wrap((req, res) => {
    const cid = scope(req);
    const days = Math.min(Math.max(Number(req.query.days) || 14), 90);
    const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const p = cid ? [cid] : [];

    const daily = all(
      `SELECT p.day, SUM(p.ms) ms, COUNT(*) plays, COUNT(DISTINCT p.device_id) screens
         FROM playlog p JOIN devices d ON d.id=p.device_id
        WHERE p.day >= ? ${cid ? 'AND d.client_id=?' : ''} GROUP BY p.day ORDER BY p.day`,
      cid ? [from, cid] : [from]
    );

    const perDevice = all(
      `SELECT d.id, d.name, d.type, l.name AS location, l.footfall, c.name AS client_name, d.client_id,
              COALESCE(SUM(p.ms),0) ms, COUNT(p.id) plays, COUNT(DISTINCT p.day) active_days
         FROM devices d
         JOIN clients c ON c.id = d.client_id
         LEFT JOIN locations l ON l.id = d.location_id
         LEFT JOIN playlog p ON p.device_id = d.id AND p.day >= ?
        WHERE 1=1 ${wcond(cid, 'd.')} GROUP BY d.id ORDER BY ms DESC`,
      cid ? [from, cid] : [from]
    );

    const perMedia = all(
      `SELECT m.id, m.title, m.kind, SUM(p.ms) ms, COUNT(*) plays, COUNT(DISTINCT p.device_id) screens
         FROM playlog p JOIN devices d ON d.id=p.device_id JOIN media m ON m.id=p.media_id
        WHERE p.day >= ? ${wcond(cid, 'd.')} GROUP BY m.id ORDER BY ms DESC LIMIT 12`,
      cid ? [from, cid] : [from]
    );

    // Estimativa de impressões: público do ponto × fração do horário comercial com a tela no ar.
    const totals = perDevice.reduce(
      (acc, r) => {
        const minutes = Math.round(r.ms / 60000);
        const imp = Math.round((r.footfall || 0) * Math.min(1, minutes / (OPEN_MINUTES_PER_DAY * days) || 0) * days);
        acc.minutes += minutes;
        acc.plays += r.plays || 0;
        acc.impressions += imp;
        acc.screens_touched += minutes > 0 ? 1 : 0;
        return acc;
      },
      { minutes: 0, plays: 0, impressions: 0, screens_touched: 0 }
    );

    res.json({
      range: { from, days },
      daily: daily.map((d) => ({ ...d, minutes: Math.round(d.ms / 60000) })),
      per_device: perDevice.map((r) => ({
        ...r,
        minutes: Math.round(r.ms / 60000),
        avg_min_per_day: Math.round(r.ms / 60000 / days),
      })),
      per_media: perMedia.map((r) => ({ ...r, minutes: Math.round(r.ms / 60000) })),
      totals: { ...totals, hours: Math.round((totals.minutes / 60) * 10) / 10, open_minutes_per_day: OPEN_MINUTES_PER_DAY },
    });
  })
);

/** Atividade recente (auditoria + eventos de aparelho). */
router.get(
  '/activity',
  wrap((req, res) => {
    const cid = scope(req);
    const auditRows = all(`SELECT * FROM audit ${cid ? 'WHERE client_id=? OR client_id IS NULL' : ''} ORDER BY id DESC LIMIT 25`, cid ? [cid] : []);
    const logs = all(
      `SELECT l.*, d.name AS device_name, d.client_id, c.name AS client_name
         FROM device_logs l JOIN devices d ON d.id=l.device_id JOIN clients c ON c.id=d.client_id
        ${cid ? 'WHERE d.client_id=?' : ''} ORDER BY l.id DESC LIMIT 40`,
      cid ? [cid] : []
    );
    res.json({ audit: auditRows, logs: logs.map((l) => ({ ...l, payload: safeParse(l.payload) })) });
  })
);

const safeParse = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return s;
  }
};

/** Notas de operação do painel (o que a agência quer lembrar sobre a conta). */
router.get(
  '/notes',
  wrap((req, res) => {
    const cid = scope(req);
    res.json(all('SELECT * FROM audit WHERE action=? ' + (cid ? 'AND client_id=?' : ''), ['note', ...(cid ? [cid] : [])].filter((x) => x !== undefined)));
  })
);

router.post(
  '/notes',
  wrap((req, res) => {
    const cid = scope(req);
    const text = String(req.body?.text || '').trim();
    if (!text) return res.json({ ok: false });
    insert('audit', { user_id: req.user.id, actor: req.user.email, action: 'note', entity: 'client', entity_id: cid, client_id: cid, detail: text });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'note:new', entity: 'client', entity_id: cid, client_id: cid });
    res.json({ ok: true });
  })
);
