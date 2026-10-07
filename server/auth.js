/**
 * Autenticação: hash de senha com scrypt + token assinado (HMAC) sem estado.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, DATA_DIR } from './db.js';

const SECRET_FILE = path.join(DATA_DIR, '.secret');

function loadSecret() {
  if (process.env.OLHA_SECRET) return process.env.OLHA_SECRET;
  // segredo estável por instalação (persistido) para não invalidar tokens ao reiniciar
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, s);
    return s;
  }
}
const SECRET = loadSecret();

export function hashPass(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `s1$${salt}$${h}`;
}
export function checkPass(pass, stored) {
  if (!stored) return false;
  const [, salt, h] = stored.split('$');
  const cand = crypto.scryptSync(pass, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(cand, 'hex'));
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

export function sign(payload, ttlSec = 60 * 60 * 24 * 30) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const payload = JSON.parse(unb64u(body).toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function tokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.query?.token || req.query?.access_token || null;
}

/** Middleware de rota para usuários logados. */
export function requireUser(req, res, next) {
  const payload = verify(tokenFromReq(req));
  if (!payload?.uid) return res.status(401).json({ error: 'não autenticado' });
  const user = get('SELECT * FROM users WHERE id=?', [payload.uid]);
  if (!user) return res.status(401).json({ error: 'usuário inválido' });
  req.user = user;
  next();
}

/** Middleware para o runtime de player (TV / tablet) autenticado pelo token do aparelho. */
export function requireDevice(req, res, next) {
  const token = tokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'token do aparelho ausente' });
  const device = get('SELECT * FROM devices WHERE token=?', [token]);
  if (!device) return res.status(403).json({ error: 'aparelho não pareado' });
  req.device = device;
  next();
}

export const randomCode = (n = 6) =>
  crypto
    .randomBytes(n * 2)
    .toString('hex')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, n);

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

/**
 * Escopo por papel: agência enxerga todos os clientes; cliente só enxerga o próprio.
 * Retorna null quando o acesso é negado.
 */
export function scopeClientId(req, requested) {
  if (req.user.role === 'agency') {
    if (requested === undefined || requested === null || requested === '') return null;
    return Number(requested);
  }
  const own = req.user.client_id;
  if (requested && Number(requested) !== own) return -1;
  return own;
}

export function assertScope(req, clientId) {
  if (req.user.role === 'agency') return true;
  return Number(clientId) === Number(req.user.client_id);
}

/**
 * Filtro de visibilidade para listagens.
 * @returns {number|null} client_id forçado (cliente) ou null (agência vendo a rede toda)
 */
export function visible(req, requested) {
  if (req.user.role === 'agency') {
    const n = numish(requested);
    if (n === null) return null;
    if (!get('SELECT id FROM clients WHERE id=?', [n])) bad404();
    return n;
  }
  if (numish(requested) !== null && Number(requested) !== Number(req.user.client_id)) forbidden();
  if (!req.user.client_id) forbidden();
  return req.user.client_id;
}

/** Garante que o registro pertence ao cliente do usuário (agência passa direto). */
export function guardRow(req, row) {
  if (!row) bad404();
  if (req.user.role !== 'agency' && Number(row.client_id) !== Number(req.user.client_id)) forbidden();
  return row;
}

const numish = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
function bad404() {
  const e = new Error('registro não encontrado');
  e.status = 404;
  throw e;
}
function forbidden() {
  const e = new Error('acesso negado para esta empresa');
  e.status = 403;
  throw e;
}
