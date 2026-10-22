/**
 * Motor de programação: decide "o que deve estar no ar" em um aparelho, agora.
 * Escopos de vinculação (mais específico vence): aparelho > ponto/local > cliente.
 * Dentro de um escopo, janelas de horário (schedules) com prioridade definem a playlist ativa.
 */
import { all, get } from './db.js';

const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export { DAY_NAMES };

export function hhmm(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function windowMatches(row, at) {
  const days = String(row.days || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (days.length && !days.includes(at.getDay())) return false;
  const now = hhmm(at);
  const a = row.start_time || '00:00';
  const b = row.end_time || '23:59';
  return a <= b ? now >= a && now <= b : now >= a || now <= b; // janela cruzando a meia-noite
}

/** Escopo efetivo (playlist_id) do aparelho, se houver vinculação direta. */
function boundPlaylists(device) {
  const out = [];
  if (device.playlist_id) out.push({ scope: 'device', id: device.playlist_id });
  if (device.location_id) {
    for (const r of all('SELECT playlist_id FROM assignments WHERE scope=? AND scope_id=?', ['location', device.location_id]))
      out.push({ scope: 'location', id: r.playlist_id });
  }
  for (const r of all('SELECT playlist_id FROM assignments WHERE scope=? AND scope_id=?', ['client', device.client_id]))
    out.push({ scope: 'client', id: r.playlist_id });
  return out;
}

function loadPlaylist(id) {
  return get('SELECT * FROM playlists WHERE id=?', [Number(id)]);
}

export function itemsOf(playlistId) {
  const rows = all(
    `SELECT pi.id AS slot_id, pi.position AS pos, pi.duration_ms AS slot_ms,
            m.id AS mid, m.kind AS kind, m.title AS title, m.filename AS filename, m.mime AS mime,
            m.url AS url, m.body AS body, m.orientation AS morient, m.width AS mwidth, m.height AS mheight,
            m.duration_ms AS media_ms, m.bytes AS bytes, m.public AS public
       FROM playlist_items pi JOIN media m ON m.id = pi.media_id
      WHERE pi.playlist_id = ? ORDER BY pi.position, pi.id`,
    [playlistId]
  );
  return rows.map((r) => ({
    item_id: r.slot_id,
    position: r.pos,
    duration_ms: r.slot_ms,
    media: {
      id: r.mid,
      kind: r.kind,
      title: r.title,
      filename: r.filename,
      mime: r.mime,
      url: r.url,
      body: r.body,
      orientation: r.morient,
      width: r.mwidth,
      height: r.mheight,
      bytes: r.bytes,
      public: r.public,
      duration_ms: r.slot_ms || r.media_ms || 0,
    },
  }));
}

/**
 * Resolve a grade do aparelho.
 * @returns {{mode:string, playlist:object|null, items:array, windows:array, source:string}}
 */
export function resolveProgram(device, at = new Date()) {
  if (device.mode === 'paused') return { mode: 'paused', playlist: null, items: [], windows: [], source: 'manual' };

  if (device.mode === 'takeover' && device.takeover_media_id) {
    const m = get('SELECT * FROM media WHERE id=?', [device.takeover_media_id]);
    if (m)
      return {
        mode: 'takeover',
        playlist: null,
        items: [{ item_id: -1, media: { ...m, duration_ms: m.duration_ms || 20000 }, position: 0 }],
        windows: [],
        source: 'takeover',
      };
  }

  const bound = boundPlaylists(device);
  const order = { device: 0, location: 1, client: 2 };
  bound.sort((a, b) => order[a.scope] - order[b.scope]);

  // dedup preservando escopo mais específico
  const seen = new Set();
  const cands = bound.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));

  for (const cand of cands) {
    const pl = loadPlaylist(cand.id);
    if (!pl || pl.status !== 'publicada') continue;
    const wins = all('SELECT * FROM schedules WHERE playlist_id=? AND enabled=1', [pl.id]).sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );
    const matching = wins.filter((w) => windowMatches(w, at));
    if (wins.length === 0 || matching.length) {
      return {
        mode: device.mode || 'playlist',
        playlist: pl,
        items: itemsOf(pl.id),
        windows: wins.map((w) => ({ ...w, active: matching.includes(w) })),
        source: cand.scope,
      };
    }
  }

  // fallback: última playlist publicada do cliente
  const any = get(
    `SELECT * FROM playlists WHERE client_id=? AND status='publicada' ORDER BY published_at DESC LIMIT 1`,
    [device.client_id]
  );
  if (any) return { mode: 'playlist', playlist: any, items: itemsOf(any.id), windows: [], source: 'fallback' };
  return { mode: 'vazio', playlist: null, items: [], windows: [], source: 'none' };
}

/** Pré-visualização da grade do dia para o painel (quem entra no ar e quando). */
export function dayTimeline(playlistId, at = new Date()) {
  const wins = all('SELECT * FROM schedules WHERE playlist_id=? ORDER BY priority DESC', [playlistId]);
  return DAY_NAMES.map((label, dow) => {
    const ok = wins.filter((w) => String(w.days || '').split(',').map(Number).includes(dow));
    return {
      dow,
      label,
      active: wins.length === 0 || ok.length > 0,
      windows: (ok.length ? ok : wins).map((w) => ({ name: w.name, start: w.start_time, end: w.end_time, priority: w.priority })),
    };
  });
}

/** Estatísticas de exibição acumuladas (para relatórios). */
export function playSummary(clientId, days = 7) {
  const params = [];
  let where = 'WHERE 1=1';
  if (clientId) {
    where += ' AND d.client_id = ?';
    params.push(clientId);
  }
  return all(
    `SELECT p.day, SUM(p.ms) AS ms, COUNT(*) AS plays, d.client_id
       FROM playlog p JOIN devices d ON d.id = p.device_id ${where}
      GROUP BY p.day, d.client_id ORDER BY p.day DESC LIMIT ?`,
    [...params, days * 40]
  );
}
