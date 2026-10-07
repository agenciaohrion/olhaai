import express from 'express';
import { all, get, insert, update, del, run, audit, nowISO, tx } from '../db.js';
import { requireUser, guardRow, visible } from '../auth.js';
import { wrap, bad, pick } from '../lib.js';
import { itemsOf, dayTimeline, resolveProgram } from '../program.js';
import { invalidateClient } from '../realtime.js';

export const router = express.Router(); // exige login (montado dentro do bloco autenticado)

const FIELDS = ['client_id', 'name', 'notes', 'orientation', 'bg', 'status'];

function guardPlaylist(req, id) {
  const p = get('SELECT * FROM playlists WHERE id=?', [Number(id)]);
  if (!p) bad(404, 'playlist não encontrada');
  guardRow(req, p);
  return p;
}

function withCounts(p) {
  const items = all(
    `SELECT pi.id, pi.position, pi.duration_ms, m.id AS media_id, m.kind, m.title, m.filename, m.orientation, m.duration_ms AS media_duration, m.width, m.height
       FROM playlist_items pi JOIN media m ON m.id = pi.media_id WHERE pi.playlist_id=? ORDER BY pi.position, pi.id`,
    [p.id]
  );
  return {
    ...p,
    items: items.map((i) => ({
      id: i.id,
      media_id: i.media_id,
      position: i.position,
      duration_ms: i.duration_ms,
      kind: i.kind,
      title: i.title,
      orientation: i.orientation,
      thumb: i.kind === 'image' && i.filename ? `/uploads/${i.filename}` : `/api/media/${i.media_id}/thumb`,
      media_duration: i.media_duration,
      slot_ms: i.duration_ms || i.media_duration || defaultDur(i.kind),
    })),
    windows: all('SELECT * FROM schedules WHERE playlist_id=? ORDER BY priority DESC, id', [p.id]),
    assignments: all('SELECT * FROM assignments WHERE playlist_id=?', [p.id]),
    duration_total_ms: items.reduce((a, i) => a + (i.duration_ms || i.media_duration || defaultDur(i.kind)), 0),
    timeline: dayTimeline(p.id),
    devices: all(
      `SELECT d.id, d.name, d.type, d.status FROM devices d
        WHERE d.playlist_id=?
           OR d.location_id IN (SELECT scope_id FROM assignments WHERE playlist_id=? AND scope='location')
           OR (? IN (SELECT client_id FROM assignments WHERE playlist_id=? AND scope='client'))
        GROUP BY d.id`,
      [p.id, p.id, p.client_id, p.id]
    ),
  };
}

const defaultDur = (kind) => (kind === 'video' ? 0 : kind === 'text' ? 9000 : 10000);

router.get(
  '/playlists',
  wrap((req, res) => {
    const cid = visible(req, req.query.client_id);
    const rows = cid ? all('SELECT * FROM playlists WHERE client_id=? ORDER BY updated_at DESC', [cid]) : all('SELECT * FROM playlists ORDER BY updated_at DESC');
    res.json(
      rows.map((p) => ({
        ...p,
        items: get('SELECT COUNT(*) n FROM playlist_items WHERE playlist_id=?', [p.id]).n,
        bounds: get('SELECT COUNT(*) n FROM assignments WHERE playlist_id=?', [p.id]).n + get('SELECT COUNT(*) n FROM devices WHERE playlist_id=?', [p.id]).n,
        duration_total_ms: get('SELECT COALESCE(SUM(COALESCE(duration_ms,0)),0) s FROM playlist_items WHERE playlist_id=?', [p.id]).s,
      }))
    );
  })
);

router.get(
  '/playlists/:id',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    res.json(withCounts(p));
  })
);

router.post(
  '/playlists',
  wrap((req, res) => {
    const b = req.body || {};
    const client_id = req.user.role === 'agency' ? Number(b.client_id) || req.user.client_id : req.user.client_id;
    if (!b.name) bad(422, 'informe o nome da playlist');
    const id = insert('playlists', { ...pick(b, ['name', 'notes', 'orientation', 'bg']), client_id, created_by: req.user.id, status: 'rascunho' });
    if (Array.isArray(b.media_ids)) writeItems(id, b.media_ids);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'playlist:create', entity: 'playlist', entity_id: id, client_id, detail: b.name });
    res.status(201).json(withCounts(get('SELECT * FROM playlists WHERE id=?', [id])));
  })
);

router.patch(
  '/playlists/:id',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const b = { ...req.body };
    delete b.client_id;
    delete b.status;
    update('playlists', p.id, { ...pick(b, ['name', 'notes', 'orientation', 'bg']), updated_at: nowISO() });
    res.json(withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])));
  })
);

router.delete(
  '/playlists/:id',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    del('playlists', p.id);
    run('DELETE FROM assignments WHERE playlist_id=?', [p.id]);
    run('DELETE FROM devices WHERE playlist_id=?', [p.id]);
    invalidateClient(p.client_id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'playlist:delete', entity: 'playlist', entity_id: p.id, client_id: p.client_id, detail: p.name });
    res.json({ ok: true });
  })
);

router.post(
  '/playlists/:id/duplicate',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const id = insert('playlists', {
      client_id: p.client_id,
      name: `${p.name} (cópia)`,
      notes: p.notes,
      orientation: p.orientation,
      bg: p.bg,
      status: 'rascunho',
      created_by: req.user.id,
    });
    for (const it of all('SELECT * FROM playlist_items WHERE playlist_id=? ORDER BY position', [p.id]))
      insert('playlist_items', { playlist_id: id, media_id: it.media_id, position: it.position, duration_ms: it.duration_ms });
    for (const w of all('SELECT * FROM schedules WHERE playlist_id=?', [p.id]))
      insert('schedules', { playlist_id: id, client_id: p.client_id, name: w.name, days: w.days, start_time: w.start_time, end_time: w.end_time, priority: w.priority, enabled: w.enabled });
    res.status(201).json(withCounts(get('SELECT * FROM playlists WHERE id=?', [id])));
  })
);

/* --------------------------- itens (trilha) --------------------------- */

function writeItems(playlistId, mediaIds) {
  tx(() => {
    run('DELETE FROM playlist_items WHERE playlist_id=?', [playlistId]);
    (mediaIds || []).forEach((m, i) => {
      const mediaId = typeof m === 'object' ? m.media_id : m;
      const duration = typeof m === 'object' ? m.duration_ms : null;
      if (!mediaId) return;
      insert('playlist_items', { playlist_id: playlistId, media_id: mediaId, position: i, duration_ms: duration });
    });
  });
}

router.put(
  '/playlists/:id/items',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const list = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const it of list) {
      const m = get('SELECT * FROM media WHERE id=?', [Number(it.media_id)]);
      if (!m) bad(422, `conteúdo ${it.media_id} não existe`);
      if (!m.public) guardRow(req, m);
    }
    writeItems(p.id, list);
    update('playlists', p.id, { updated_at: nowISO() });
    invalidateClient(p.client_id);
    res.json(withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])));
  })
);

/* --------------------------- janelas de horário --------------------------- */

router.put(
  '/playlists/:id/windows',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    tx(() => {
      run('DELETE FROM schedules WHERE playlist_id=?', [p.id]);
      for (const w of req.body?.windows || []) {
        if (!w?.enabled && w?.enabled === false) continue;
        insert('schedules', {
          playlist_id: p.id,
          client_id: p.client_id,
          name: w.name || 'Janela',
          days: Array.isArray(w.days) ? w.days.join(',') : String(w.days || '0,1,2,3,4,5,6'),
          start_time: hhmmSafe(w.start_time),
          end_time: hhmmSafe(w.end_time),
          priority: Number(w.priority) || 0,
          enabled: w.enabled === false ? 0 : 1,
        });
      }
    });
    update('playlists', p.id, { updated_at: nowISO() });
    invalidateClient(p.client_id);
    res.json(withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])));
  })
);

const hhmmSafe = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : v ? String(v).padStart(5, '0').slice(0, 5) : '00:00');

/* --------------------------- vinculação (alcance) --------------------------- */

router.put(
  '/playlists/:id/assignments',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const b = req.body || {};
    const deviceIds = (b.device_ids || []).map(Number).filter(Boolean);
    const locationIds = (b.location_ids || []).map(Number).filter(Boolean);
    tx(() => {
      run('DELETE FROM assignments WHERE playlist_id=?', [p.id]);
      run('UPDATE devices SET playlist_id=NULL WHERE playlist_id=?', [p.id]);
      if (b.to_client) insert('assignments', { client_id: p.client_id, playlist_id: p.id, scope: 'client', scope_id: p.client_id });
      for (const lid of locationIds) {
        const loc = get('SELECT * FROM locations WHERE id=?', [lid]);
        if (!loc || Number(loc.client_id) !== Number(p.client_id)) bad(422, `ponto ${lid} fora da empresa`);
        insert('assignments', { client_id: p.client_id, playlist_id: p.id, scope: 'location', scope_id: lid });
      }
      for (const did of deviceIds) {
        const d = get('SELECT * FROM devices WHERE id=?', [did]);
        if (!d || Number(d.client_id) !== Number(p.client_id)) bad(422, `aparelho ${did} fora da empresa`);
        update('devices', did, { playlist_id: p.id });
      }
    });
    update('playlists', p.id, { updated_at: nowISO() });
    invalidateClient(p.client_id);
    res.json(withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])));
  })
);

/* --------------------------- publicação --------------------------- */

router.post(
  '/playlists/:id/publish',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const items = get('SELECT COUNT(*) n FROM playlist_items WHERE playlist_id=?', [p.id]).n;
    if (!items) bad(422, 'adicione ao menos um conteúdo antes de publicar');
    const bounds = withCounts(p).devices.length;
    if (!bounds) bad(422, 'vincule a playlist a pelo menos um ponto ou aparelho');
    update('playlists', p.id, { status: 'publicada', version: p.version + 1, published_at: nowISO(), updated_at: nowISO() });
    invalidateClient(p.client_id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'playlist:publish', entity: 'playlist', entity_id: p.id, client_id: p.client_id, detail: `${items} itens → ${bounds} telas` });
    res.json({ ...withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])), pushed_to: bounds });
  })
);

router.post(
  '/playlists/:id/unpublish',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    update('playlists', p.id, { status: 'rascunho', updated_at: nowISO() });
    invalidateClient(p.client_id);
    res.json(withCounts(get('SELECT * FROM playlists WHERE id=?', [p.id])));
  })
);

/** Prévia: o que cada aparelho vinculado deve exibir neste momento. */
router.get(
  '/playlists/:id/onair',
  wrap((req, res) => {
    const p = guardPlaylist(req, req.params.id);
    const devs = withCounts(p).devices;
    const at = new Date();
    res.json(
      devs.map((d) => {
        const dev = get('SELECT * FROM devices WHERE id=?', [d.id]);
        const prog = resolveProgram(dev, at);
        return {
          device_id: d.id,
          name: d.name,
          location: get('SELECT name FROM locations WHERE id=?', [dev.location_id])?.name || null,
          source: prog.source,
          matches: prog.playlist?.id === p.id,
          playing: prog.playlist?.name || null,
          windows: prog.windows,
        };
      })
    );
  })
);
