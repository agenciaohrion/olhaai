import express from 'express';
import { all, get, insert, update, del, audit } from '../db.js';
import { requireUser, visible, guardRow, hashPass } from '../auth.js';
import { wrap, bad, pick } from '../lib.js';

/** Cliente só acessa a própria empresa. */
function guardClient(req, c) {
  if (!c) bad(404, 'empresa não encontrada');
  if (req.user.role !== 'agency' && Number(c.id) !== Number(req.user.client_id)) bad(403, 'acesso negado para esta empresa');
  return c;
}

export const router = express.Router(); // exige login (montado dentro do bloco autenticado)

const CLIENT_FIELDS = [
  'name', 'brand', 'segment', 'cnpj', 'contact_name', 'contact_email', 'phone',
  'city', 'state', 'plan', 'status', 'monthly_value', 'seats', 'notes',
];

/** Lista empresas (agência) ou a própria empresa (cliente). */
router.get(
  '/clients',
  wrap((req, res) => {
    const cid = visible(req, req.query.client_id);
    const rows = cid
      ? all('SELECT * FROM clients WHERE id=?', [cid])
      : all('SELECT * FROM clients ORDER BY status DESC, name');
    const out = rows.map((c) => ({
      ...c,
      stats: {
        devices: get(`SELECT COUNT(*) n FROM devices WHERE client_id=?`, [c.id]).n,
        online: get(`SELECT COUNT(*) n FROM devices WHERE client_id=? AND status='online'`, [c.id]).n,
        locations: get(`SELECT COUNT(*) n FROM locations WHERE client_id=?`, [c.id]).n,
        media: get(`SELECT COUNT(*) n FROM media WHERE client_id=?`, [c.id]).n,
        published: get(`SELECT COUNT(*) n FROM playlists WHERE client_id=? AND status='publicada'`, [c.id]).n,
        users: get(`SELECT COUNT(*) n FROM users WHERE client_id=?`, [c.id]).n,
      },
    }));
    res.json(out);
  })
);

router.post(
  '/clients',
  wrap((req, res) => {
    if (req.user.role !== 'agency') bad(403, 'apenas a agência cria empresas');
    const b = req.body || {};
    if (!b.name) bad(422, 'informe o nome da empresa');
    const id = insert('clients', { ...pick(b, CLIENT_FIELDS), seats: b.seats ?? 0 });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'client:create', entity: 'client', entity_id: id, client_id: id, detail: b.name });
    res.status(201).json(get('SELECT * FROM clients WHERE id=?', [id]));
  })
);

router.get(
  '/clients/:id',
  wrap((req, res) => {
    const c = guardClient(req, get('SELECT * FROM clients WHERE id=?', [req.params.id]));
    const locations = all('SELECT * FROM locations WHERE client_id=? ORDER BY name', [c.id]).map((l) => ({
      ...l,
      devices: all('SELECT id,name,type,orientation,status,last_seen,lat,lng FROM devices WHERE location_id=? ORDER BY name', [l.id]),
    }));
    const devices = all('SELECT * FROM devices WHERE client_id=? ORDER BY name', [c.id]);
    res.json({
      ...c,
      locations,
      devices: devices.map(({ token, ...d }) => ({ ...d, paired: !!token })),
      users: all('SELECT id,email,name,role,last_login FROM users WHERE client_id=? ORDER BY name', [c.id]),
      playlists: all(
        `SELECT p.*, (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id=p.id) AS items,
                (SELECT COUNT(*) FROM assignments a WHERE a.playlist_id=p.id) AS bounds
         FROM playlists p WHERE p.client_id=? ORDER BY p.updated_at DESC`,
        [c.id]
      ),
    });
  })
);

router.patch(
  '/clients/:id',
  wrap((req, res) => {
    const c = guardClient(req, get('SELECT * FROM clients WHERE id=?', [req.params.id]));
    if (req.user.role !== 'agency') bad(403, 'apenas a agência edita dados da empresa');
    update('clients', c.id, pick(req.body || {}, CLIENT_FIELDS));
    audit({ user_id: req.user.id, actor: req.user.email, action: 'client:update', entity: 'client', entity_id: c.id, client_id: c.id });
    res.json(get('SELECT * FROM clients WHERE id=?', [c.id]));
  })
);

router.delete(
  '/clients/:id',
  wrap((req, res) => {
    const c = guardClient(req, get('SELECT * FROM clients WHERE id=?', [req.params.id]));
    if (req.user.role !== 'agency') bad(403, 'apenas a agência remove empresas');
    del('clients', c.id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'client:delete', entity: 'client', entity_id: c.id, detail: c.name });
    res.json({ ok: true });
  })
);

/** Cria/ajusta o acesso do cliente no painel. */
router.post(
  '/clients/:id/access',
  wrap((req, res) => {
    const c = guardClient(req, get('SELECT * FROM clients WHERE id=?', [req.params.id]));
    if (req.user.role !== 'agency') bad(403, 'apenas a agência cria acessos');
    const { email, name, password } = req.body || {};
    if (!email || !name) bad(422, 'informe nome e e-mail');
    if (get('SELECT id FROM users WHERE lower(email)=lower(?)', [email])) bad(409, 'e-mail já cadastrado');
    const id = insert('users', {
      email: String(email).toLowerCase(),
      name,
      role: 'client',
      client_id: c.id,
      pass_hash: hashPass(String(password || 'olha12345')),
    });
    res.status(201).json({ id, email, name, temp_password: password || 'olha12345' });
  })
);

/* ------------------------- pontos / locais ------------------------- */

const LOC_FIELDS = ['client_id', 'name', 'address', 'district', 'city', 'state', 'zip', 'lat', 'lng', 'kind', 'footfall', 'notes'];

router.get(
  '/locations',
  wrap((req, res) => {
    const cid = visible(req, req.query.client_id);
    const rows = cid ? all('SELECT * FROM locations WHERE client_id=? ORDER BY name', [cid]) : all('SELECT * FROM locations ORDER BY city, name');
    res.json(
      rows.map((l) => {
        const devices = all('SELECT id,name,type,orientation,status,last_seen FROM devices WHERE location_id=? ORDER BY name', [l.id]);
        return { ...l, devices, device_count: devices.length, online: devices.filter((d) => d.status === 'online').length };
      })
    );
  })
);

router.post(
  '/locations',
  wrap((req, res) => {
    const b = req.body || {};
    const client_id = req.user.role === 'agency' ? Number(b.client_id) : req.user.client_id;
    if (!client_id) bad(422, 'informe a empresa');
    if (!b.name) bad(422, 'informe o nome do ponto');
    guardClient(req, get('SELECT * FROM clients WHERE id=?', [client_id]));
    const id = insert('locations', { ...pick({ ...b, client_id }, LOC_FIELDS) });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'location:create', entity: 'location', entity_id: id, client_id, detail: b.name });
    res.status(201).json(get('SELECT * FROM locations WHERE id=?', [id]));
  })
);

router.patch(
  '/locations/:id',
  wrap((req, res) => {
    const row = guardRow(req, get('SELECT * FROM locations WHERE id=?', [req.params.id]));
    const b = { ...req.body };
    delete b.client_id;
    update('locations', row.id, pick(b, LOC_FIELDS.filter((f) => f !== 'client_id')));
    res.json(get('SELECT * FROM locations WHERE id=?', [row.id]));
  })
);

router.delete(
  '/locations/:id',
  wrap((req, res) => {
    const row = guardRow(req, get('SELECT * FROM locations WHERE id=?', [req.params.id]));
    del('locations', row.id);
    audit({ user_id: req.user.id, actor: req.user.email, action: 'location:delete', entity: 'location', entity_id: row.id });
    res.json({ ok: true });
  })
);
