import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, insert, update, del, audit, UPLOAD_DIR } from '../db.js';
import { requireUser, guardRow } from '../auth.js';
import { wrap, bad, pick, safeUnlink } from '../lib.js';

export const router = express.Router(); // exige login (montado dentro do bloco autenticado)

export const KINDS = ['image', 'video', 'url', 'youtube', 'html', 'text', 'clock', 'weather', 'news'];
const FIELDS = ['client_id', 'kind', 'title', 'url', 'body', 'orientation', 'tags', 'public', 'duration_ms', 'width', 'height'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || guessExt(file.mimetype)).toLowerCase();
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
function guessExt(mime) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' }[mime] || '.bin';
}
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.OLHA_MAX_MB || 400) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video)\//.test(file.mimetype) || /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif|svg)$/i.test(file.originalname);
    cb(ok ? null : new Error('formato não suportado (use vídeo MP4/WebM ou imagem JPG/PNG/WebP/GIF)'), ok);
  },
});

/** Metadados por arquivo (o painel envia largura/altura/duração detectados no upload). */
function metaFromField(field, index) {
  if (!field) return {};
  try {
    const parsed = typeof field === 'string' ? JSON.parse(field) : field;
    return Array.isArray(parsed) ? parsed[index] || {} : index === 0 ? parsed : {};
  } catch {
    return {};
  }
}

function kindOf(mimetype, originalname = '') {
  if (/^video\//.test(mimetype) || /\.(mp4|webm|mov|m4v)$/i.test(originalname)) return 'video';
  return 'image';
}

router.get(
  '/media',
  wrap((req, res) => {
    const cid = req.user.role === 'agency' ? (req.query.client_id ? Number(req.query.client_id) : null) : req.user.client_id;
    const params = [];
    // agência sem filtro vê a rede inteira; com filtro vê a empresa + biblioteca comum;
    // cliente sempre vê a própria empresa + biblioteca comum
    let where;
    if (req.query.scope === 'library') where = 'WHERE m.public=1';
    else if (req.user.role === 'agency' && (req.query.scope === 'all' || !cid)) where = 'WHERE 1=1';
    else where = 'WHERE (m.client_id=? OR m.public=1)';
    if (where.includes('m.client_id=?')) params.push(cid);
    if (req.query.kind) {
      where += ` AND m.kind = ?`;
      params.push(String(req.query.kind));
    }
    if (req.query.q) {
      where += ' AND (m.title LIKE ? OR m.tags LIKE ?)';
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const rows = all(
      `SELECT m.*, c.name AS client_name,
              (SELECT COUNT(*) FROM playlist_items i JOIN playlists p ON p.id=i.playlist_id
                WHERE i.media_id=m.id ${cid ? 'AND p.client_id=?' : ''}) AS used_in
         FROM media m LEFT JOIN clients c ON c.id=m.client_id ${where}
        ORDER BY m.created_at DESC, m.id DESC`,
      cid ? [cid, ...params] : params
    );
    res.json(rows.map(shapeMedia));
  })
);

function shapeMedia(m) {
  const src = m.filename ? `/uploads/${m.filename}` : null;
  const thumb = m.filename && (m.kind === 'image' || m.kind === 'video') ? (m.kind === 'image' ? src : `/api/media/${m.id}/thumb`) : `/api/media/${m.id}/thumb`;
  return {
    ...m,
    src,
    thumb,
    public: !!m.public,
    bytes_label: m.bytes ? `${(m.bytes / 1024 / 1024).toFixed(1)} MB` : null,
    is_library: !m.client_id,
  };
}

router.get(
  '/media/:id',
  wrap((req, res) => {
    const m = get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!m) bad(404, 'conteúdo não encontrado');
    if (!m.public) guardRow(req, m);
    res.json(shapeMedia(m));
  })
);

/** Upload em lote (imagens e vídeos). */
router.post(
  '/media/upload',
  upload.any(), // aceita "files" ou "files[]" (campo múltiplo)
  wrap((req, res) => {
    const files = (req.files || []).filter((f) => f.fieldname === 'files' || f.fieldname === 'files[]');
    if (!files.length) bad(422, 'nenhum arquivo recebido');
    const cid = req.user.role === 'agency' && req.body.client_id ? Number(req.body.client_id) : req.user.client_id;
    if (!cid && req.body.public !== '1') bad(422, 'defina a empresa');
    const created = [];
    files.forEach((f, i) => {
      const meta = metaFromField(req.body.meta, i);
      const kind = kindOf(f.mimetype, f.originalname);
      const rel = path.join('uploads', f.filename);
      const id = insert('media', {
        client_id: req.body.public === '1' && req.user.role === 'agency' ? null : cid,
        kind,
        title: cleanTitle(meta.title || f.originalname),
        filename: f.filename,
        mime: f.mimetype,
        bytes: f.size,
        duration_ms: Number(meta.duration_ms) || 0,
        width: Number(meta.width) || null,
        height: Number(meta.height) || null,
        orientation: meta.orientation || (meta.width && meta.height ? (meta.height > meta.width ? 'v' : 'h') : null),
        checksum: sha1of(rel),
        public: req.body.public === '1' && req.user.role === 'agency' ? 1 : 0,
        tags: req.body.tags || null,
        created_by: req.user.id,
      });
      created.push(shapeMedia(get('SELECT * FROM media WHERE id=?', [id])));
    });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'media:upload', entity: 'media', client_id: cid, detail: `${created.length} arquivo(s)` });
    res.status(201).json(created);
  })
);

/** Cria conteúdo dinâmico / link / texto / widget (sem arquivo). */
router.post(
  '/media',
  wrap((req, res) => {
    const b = req.body || {};
    if (!KINDS.includes(b.kind)) bad(422, 'tipo de conteúdo inválido');
    if (!b.title) bad(422, 'informe um título');
    if (['url', 'youtube', 'news'].includes(b.kind) && !b.url) bad(422, 'informe a URL');
    if (['html', 'text'].includes(b.kind) && !b.body) bad(422, 'informe o conteúdo');
    const cid = req.user.role === 'agency' && b.client_id ? Number(b.client_id) : req.user.client_id;
    const id = insert('media', {
      ...pick(b, FIELDS),
      client_id: b.public && req.user.role === 'agency' ? null : cid,
      public: b.public ? 1 : 0,
      created_by: req.user.id,
    });
    res.status(201).json(shapeMedia(get('SELECT * FROM media WHERE id=?', [id])));
  })
);

router.patch(
  '/media/:id',
  wrap((req, res) => {
    const m = get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!m) bad(404, 'conteúdo não encontrado');
    if (!m.public) guardRow(req, m);
    const b = { ...req.body };
    if (req.user.role !== 'agency') delete b.client_id;
    if (b.public !== undefined) b.public = b.public ? 1 : 0;
    update('media', m.id, pick(b, FIELDS));
    res.json(shapeMedia(get('SELECT * FROM media WHERE id=?', [m.id])));
  })
);

router.delete(
  '/media/:id',
  wrap((req, res) => {
    const m = get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!m) bad(404, 'conteúdo não encontrado');
    if (!m.public) guardRow(req, m);
    const used = get('SELECT COUNT(*) n FROM playlist_items WHERE media_id=?', [m.id]).n;
    if (used && req.query.force !== '1') bad(409, `conteúdo em ${used} item(ns) de playlist — remova das playlists ou use ?force=1`);
    if (m.filename) safeUnlink(path.join('uploads', m.filename));
    del('media', m.id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'media:delete', entity: 'media', entity_id: m.id, client_id: m.client_id, detail: m.title });
    res.json({ ok: true });
  })
);

/** Poster/thumbnail gerado no servidor (card legível para vídeos e widgets). */
router.get(
  '/media/:id/thumb',
  wrap((req, res) => {
    const m = get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!m) bad(404, 'conteúdo não encontrado');
    if (m.filename && m.kind === 'image') return res.redirect(302, `/uploads/${m.filename}`);
    res.type('image/svg+xml').send(cardSvg(m));
  })
);

/** Biblioteca de exemplos (o que a agência pode oferecer pronto para usar). */
router.get(
  '/media-starters',
  requireUser,
  wrap((req, res) => {
    res.json(all("SELECT id,kind,title,url,body,tags FROM media WHERE public=1 ORDER BY id"));
  })
);

/* ----------------------------- helpers de card ----------------------------- */

const ACCENT = { video: '#7c5cff', image: '#22d3ee', url: '#f59e0b', youtube: '#ef4444', html: '#34d399', text: '#f472b6', clock: '#60a5fa', weather: '#a3e635', news: '#fbbf24' };
const LABEL = {
  video: 'VÍDEO', image: 'IMAGEM', url: 'LINK / IFRAME', youtube: 'YOUTUBE', html: 'PEÇA HTML', text: 'AVISO ROLANTE',
  clock: 'RELÓGIO', weather: 'PREVISÃO DO TEMPO', news: 'MANCHETES',
};

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function cardSvg(m) {
  const vertical = (m.orientation || (m.height > m.width ? 'v' : 'h')) === 'v';
  const W = vertical ? 420 : 760;
  const H = vertical ? 740 : 430;
  const accent = ACCENT[m.kind] || '#7c5cff';
  const dur = m.duration_ms ? Math.round(m.duration_ms / 1000) + 's' : null;
  const lines = wrapText(m.title || '', vertical ? 22 : 34).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1024"/><stop offset="1" stop-color="#05070f"/>
    </linearGradient>
    <radialGradient id="r" cx="0.2" cy="0.1">
      <stop offset="0" stop-color="${accent}" stop-opacity=".45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#r)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${accent}" stroke-opacity=".35"/>
  <text x="34" y="58" font-family="Inter,Arial" font-size="19" letter-spacing="3" fill="${accent}">${LABEL[m.kind] || m.kind.toUpperCase()}</text>
  ${lines.map((l, i) => `<text x="34" y="${H / 2 + i * 40}" font-family="Inter,Arial" font-weight="700" font-size="38" fill="#e8ecff">${esc(l)}</text>`).join('')}
  <text x="34" y="${H - 38}" font-family="Inter,Arial" font-size="17" fill="#8f9ac4">${esc(
    [m.width && m.height ? `${m.width}×${m.height}` : null, dur, m.mime, m.url ? shortUrl(m.url) : null].filter(Boolean).join('  ·  ')
  )}</text>
  ${m.kind === 'video' ? `<g opacity=".9"><circle cx="${W - 74}" cy="${H - 74}" r="30" fill="${accent}" fill-opacity=".18" stroke="${accent}"/><path d="M${W - 82} ${H - 88} l20 14 -20 14z" fill="${accent}"/></g>` : ''}
</svg>`;
}
const shortUrl = (u) => (u.length > 40 ? u.slice(0, 40) + '…' : u);
function wrapText(text, size) {
  const words = String(text).split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > size) {
      out.push(cur.trim());
      cur = w;
    } else cur += ' ' + w;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function cleanTitle(name = '') {
  return String(name)
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 90) || 'Sem título';
}
function sha1of(rel) {
  try {
    const buf = fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(path.resolve(UPLOAD_DIR, '..'), rel));
    return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/** Curadoria de biblioteca: transforma arquivo em item público da agência (ou vice-versa). */
router.post(
  '/media/:id/promote',
  wrap((req, res) => {
    if (req.user.role !== 'agency') bad(403, 'apenas a agência publica na biblioteca comum');
    const m = get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!m) bad(404, 'conteúdo não encontrado');
    update('media', m.id, { public: 1 });
    res.json(shapeMedia(get('SELECT * FROM media WHERE id=?', [m.id])));
  })
);
