import { ROOT } from './db.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

/** Wrapper async para rotas Express. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const bad = (status, msg) => {
  const e = new Error(msg);
  e.status = status;
  throw e;
};

export const abs = (rel) => path.join(ROOT, rel);

export function safeUnlink(relPath) {
  if (!relPath) return;
  const p = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  if (!p.startsWith(path.join(ROOT, 'uploads'))) return;
  try {
    fs.unlinkSync(p);
  } catch {}
}

export function publicUrl(filename) {
  return filename ? `/uploads/${filename}` : null;
}

export const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

/** Aceita '1'/'0'/true/false/1/0 → 1|0 */
export const bool01 = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

/** Só inteiros/strings numéricas, sem SQL injection: usado para filtros de query. */
export const numOrNull = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function pick(obj, keys) {
  const o = {};
  for (const k of keys) if (obj?.[k] !== undefined) o[k] = obj[k];
  return o;
}
