import express from 'express';
import { all, get, insert, update, del, audit } from '../db.js';
import { hashPass, checkPass, sign, requireUser, randomToken } from '../auth.js';
import { wrap, bad, pick } from '../lib.js';

export const router = express.Router();

router.post(
  '/auth/login',
  wrap((req, res) => {
    const { email = '', password = '' } = req.body || {};
    const user = get('SELECT * FROM users WHERE lower(email) = lower(?)', [String(email).trim()]);
    if (!user || !checkPass(String(password), user.pass_hash)) bad(401, 'e-mail ou senha inválidos');
    update('users', user.id, { last_login: new Date().toISOString() });
    audit({ user_id: user.id, actor: user.email, action: 'login', entity: 'user', entity_id: user.id, client_id: user.client_id });
    delete user.pass_hash;
    res.json({ token: sign({ uid: user.id, role: user.role }), user });
  })
);

router.get(
  '/auth/me',
  requireUser,
  wrap((req, res) => {
    const user = { ...req.user };
    delete user.pass_hash;
    const client = user.client_id ? get('SELECT * FROM clients WHERE id=?', [user.client_id]) : null;
    const clients = user.role === 'agency' ? all('SELECT id,name,brand,status,city,state FROM clients ORDER BY name') : client ? [client] : [];
    res.json({ user, client, clients });
  })
);

router.post(
  '/auth/password',
  requireUser,
  wrap((req, res) => {
    const { current = '', next = '' } = req.body || {};
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!checkPass(String(current), user.pass_hash)) bad(403, 'senha atual incorreta');
    if (String(next).length < 6) bad(422, 'a nova senha precisa de pelo menos 6 caracteres');
    update('users', user.id, { pass_hash: hashPass(String(next)) });
    res.json({ ok: true });
  })
);

/* ---------- gestão de usuários do painel ---------- */
router.get(
  '/users',
  requireUser,
  wrap((req, res) => {
    const rows =
      req.user.role === 'agency'
        ? all('SELECT u.*, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id=u.client_id ORDER BY u.role, u.name')
        : all('SELECT u.*, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.client_id=? ORDER BY u.name', [
            req.user.client_id,
          ]);
    res.json(rows.map(({ pass_hash, ...u }) => u));
  })
);

router.post(
  '/users',
  requireUser,
  wrap((req, res) => {
    const b = req.body || {};
    if (!b.email || !b.name) bad(422, 'informe nome e e-mail');
    if (get('SELECT id FROM users WHERE lower(email)=lower(?)', [b.email])) bad(409, 'e-mail já cadastrado');
    const role = req.user.role === 'agency' && b.role === 'agency' ? 'agency' : 'client';
    const client_id = role === 'agency' ? null : req.user.role === 'agency' ? Number(b.client_id) || null : req.user.client_id;
    if (role === 'client' && !client_id) bad(422, 'defina a empresa vinculada ao usuário');
    const id = insert('users', {
      email: String(b.email).trim().toLowerCase(),
      name: b.name,
      role,
      client_id,
      phone: b.phone || null,
      pass_hash: hashPass(String(b.password || 'olha12345')),
    });
    audit({ user_id: req.user.id, actor: req.user.email, action: 'user:create', entity: 'user', entity_id: id, client_id, detail: b.email });
    res.status(201).json(get('SELECT id,email,name,role,client_id,phone FROM users WHERE id=?', [id]));
  })
);

router.patch(
  '/users/:id',
  requireUser,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const target = get('SELECT * FROM users WHERE id=?', [id]);
    if (!target) bad(404, 'usuário não encontrado');
    if (req.user.role !== 'agency' && Number(target.client_id) !== Number(req.user.client_id)) bad(403, 'sem permissão');
    const patch = pick(req.body || {}, ['name', 'phone', 'client_id', 'role']);
    if (req.user.role !== 'agency') {
      delete patch.role;
      delete patch.client_id;
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 6) bad(422, 'senha muito curta');
      patch.pass_hash = hashPass(String(req.body.password));
    }
    update('users', id, patch);
    res.json(get('SELECT id,email,name,role,client_id,phone,last_login FROM users WHERE id=?', [id]));
  })
);

router.delete(
  '/users/:id',
  requireUser,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) bad(422, 'não é possível remover o próprio usuário');
    const target = get('SELECT * FROM users WHERE id=?', [id]);
    if (!target) bad(404, 'usuário não encontrado');
    if (req.user.role !== 'agency' && Number(target.client_id) !== Number(req.user.client_id)) bad(403, 'sem permissão');
    del('users', id);
    res.json({ ok: true });
  })
);

/** Token de convite/parceria (link de pareamento curto para o técnico instalar a TV). */
router.post(
  '/pairing-token',
  requireUser,
  wrap((req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const device = get('SELECT * FROM devices WHERE pairing_code=?', [code]);
    if (!device) bad(404, 'código de pareamento não encontrado');
    res.json({ device_id: device.id, name: device.name, client: get('SELECT name FROM clients WHERE id=?', [device.client_id])?.name });
  })
);

export const internal = { randomToken };
