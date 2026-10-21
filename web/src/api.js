/** Cliente HTTP do painel: token, escopo por papel, hooks de dados e tempo real. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { store } from './store.js';

const KEY = 'olha.token';
export const getToken = () => store.get(KEY) || '';
export const setToken = (t) => {
  if (t) store.set(KEY, t);
  else store.del(KEY);
  store.del(TKEY);
  viaQuery = false;
};

export class ApiError extends Error {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }
}

/**
 * Há um modo de falhar que não é do servidor nem do navegador: o caminho entre eles.
 * Proxy/corpo de preview que descarta `Authorization` faz o login ser aceito e a chamada
 * seguinte chegar sem credencial nenhuma — "não autenticado", sem explicação. O servidor
 * também aceita o token por `?token=` (usado em <img> e <iframe>); se o cabeçalho falhou,
 * repetimos por lá e lembramos o transporte desta aba, para não perder um 401 por chamada.
 */
const TKEY = 'olha.transport';
// a aba lembra o transporte: só o primeiro pedido depois do boot paga um 401, não um por recarga
let viaQuery = false;
try { viaQuery = store.get(TKEY) === 'query'; } catch {}
export const usesQueryTransport = () => viaQuery;

export async function api(path, { method = 'GET', body, form, quiet } = {}) {
  const t = getToken();
  const send = (query) => {
    const headers = {};
    if (t && !query) headers.authorization = `Bearer ${t}`;
    if (body) headers['content-type'] = 'application/json';
    let url = '/api' + path;
    if (t && query) url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
    return fetch(url, { method, headers, body: form ? form : body ? JSON.stringify(body) : undefined });
  };
  let res = await send(viaQuery);
  if (res.status === 401 && t && !viaQuery) {
    const again = await send(true);
    if (again.ok) {
      viaQuery = true;
      try { store.set(TKEY, 'query'); } catch {}
      console.warn('[olha] o caminho descartou o cabeçalho Authorization — seguindo com o token na query');
      res = again;
    }
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.error) || `falha ${res.status}`;
    if (res.status === 401 && !quiet) {
      setToken('');
      window.dispatchEvent(new Event('olha:logout'));
    }
    throw new ApiError(msg, res.status);
  }
  return data;
}

/** URL de asset que precisa de token na query (usado em <img>/<iframe>). */
export function asset(url) {
  if (!url) return '';
  if (/^https?:/i.test(url)) return url;
  const t = getToken();
  if (!url.startsWith('/api/') || !t) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
}

/** hook de requisição com recarga manual */
export function useApi(path, { deps = [], keep = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const load = useCallback(
    async (silent) => {
      const my = ++seq.current;
      if (!silent) setState((s) => ({ ...s, loading: true }));
      try {
        const data = await api(path);
        if (my === seq.current) setState({ data, error: null, loading: false });
      } catch (e) {
        if (my === seq.current) setState((s) => ({ data: keep ? s.data : null, error: e.message || 'erro', loading: false }));
      }
    },
    [path]
  );
  useEffect(() => {
    if (path === null) return setState({ data: null, error: null, loading: false });
    load();
  }, [path, load]);
  return { ...state, reload: () => load(true) };
}

export const fmt = {
  dt: (s) => (s ? new Date(str2date(s)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'),
  time: (s) => (s ? new Date(str2date(s)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'),
  ago: (s) => {
    if (!s) return 'nunca';
    const ms = Date.now() - str2date(s);
    const m = Math.round(ms / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 36) return `há ${h} h`;
    return `há ${Math.round(h / 24)} d`;
  },
  min: (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`),
  ms: (m) => (m == null ? '—' : m < 1000 ? `${m}ms` : m < 60000 ? `${(m / 1000).toFixed(1)}s` : `${Math.floor(m / 60000)}:${String(Math.round(m / 1000) % 60).padStart(2, '0')}`),
  bytes: (b) => (b ? `${(b / 1024 / 1024).toFixed(b > 1024 * 1024 ? 1 : 2)} MB` : '—'),
  money: (v) => (v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'),
  n: (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR')),
};

/** SQLite devolve "2026-10-07 16:04:24" (UTC) — normaliza para Date. */
export function str2date(s) {
  if (typeof s === 'number') return s;
  if (!s) return Date.now();
  return /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !s.includes('T') ? s.replace(' ', 'T') + 'Z' : s;
}

export const DEVICE_TYPES = {
  tv: { label: 'TV / TV Box', short: 'TV', hint: 'TV Box Android, Android TV, Smart TV com navegador' },
  tablet: { label: 'Tablet', short: 'TAB', hint: 'Tablet Android/iPad em suporte, balcão ou veículo' },
  led: { label: 'Painel de LED', short: 'LED', hint: 'Painel de LED com controlador Windows/Linux' },
  monitor: { label: 'Monitor / Kiosk', short: 'MON', hint: 'Monitor de chão, totem ou autoatendimento' },
};
export const MEDIA_KINDS = {
  image: { label: 'Imagem', color: '#22d3ee', dur: 9000, icon: 'image' },
  video: { label: 'Vídeo', color: '#7c5cff', dur: 0, icon: 'video' },
  text: { label: 'Aviso rolante', color: '#f472b6', dur: 9000, icon: 'text' },
  html: { label: 'Peça HTML', color: '#34d399', dur: 15000, icon: 'code' },
  url: { label: 'Link / site', color: '#f59e0b', dur: 30000, icon: 'link' },
  youtube: { label: 'YouTube', color: '#ef4444', dur: 60000, icon: 'play' },
  clock: { label: 'Relógio e data', color: '#60a5fa', dur: 12000, icon: 'clock' },
  weather: { label: 'Previsão do tempo', color: '#a3e635', dur: 12000, icon: 'cloud' },
  news: { label: 'Manchetes', color: '#fbbf24', dur: 20000, icon: 'news' },
};
export const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const statusStyle = (online, paired = true) =>
  !paired
    ? { label: 'Aguardando pareamento', tone: 'warn', dot: '#fbbf24' }
    : online
    ? { label: 'No ar', tone: 'ok', dot: '#34d399' }
    : { label: 'Sem sinal', tone: 'err', dot: '#f87171' };

/** Contexto de dados leves (sem biblioteca de estado). */
export function useClientSwitch(clients, role, selected, setSelected) {
  const params = useMemo(() => {
    if (role !== 'agency') return '';
    return selected ? `?client_id=${selected}` : '';
  }, [role, selected]);
  const withClient = useCallback(
    (path) => {
      if (role !== 'agency' || !selected) return path;
      return path + (path.includes('?') ? '&' : '?') + 'client_id=' + selected;
    },
    [role, selected]
  );
  return { params, withClient };
}
