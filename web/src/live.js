/** Canal de tempo real do painel: presença, telemetria, feeds e invalidações. */
import { useEffect, useSyncExternalStore } from 'react';
import { getToken } from './api.js';

let ws = null;
let timer = null;
let attempts = 0;
const listeners = new Set();

export const live = {
  connected: false,
  online: new Set(),
  devices: {}, // id -> {status,last_seen,battery,playing,...}
  feed: [], // eventos recentes para o painel
  mode: {}, // id -> modo efetivo reportado
  screenshots: {}, // id -> url
  errors: {}, // id -> msg
  rev: 0,
};

function bump() {
  live.rev++;
  for (const l of listeners) l();
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const snapshot = () => live.rev;

export function connectLive() {
  const token = getToken();
  if (!token || ws) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  } catch {
    return;
  }
  ws.onopen = () => {
    live.connected = true;
    attempts = 0;
    bump();
  };
  ws.onclose = () => {
    live.connected = false;
    ws = null;
    bump();
    attempts++;
    clearTimeout(timer);
    timer = setTimeout(connectLive, Math.min(1000 * 2 ** attempts, 20000));
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const p = msg.payload || {};
    if (msg.type === 'hello') {
      live.online = new Set(p.devices || []);
      bump();
      return;
    }
    if (msg.type === 'device:status') {
      p.status === 'online' ? live.online.add(p.device_id) : live.online.delete(p.device_id);
      live.devices[p.device_id] = { ...(live.devices[p.device_id] || {}), status: p.status, name: p.name };
    } else if (msg.type === 'device:telemetry') {
      live.devices[p.device_id] = { ...(live.devices[p.device_id] || {}), ...p };
      if (p.last_seen) live.online.add(p.device_id);
      if (p.mode) live.mode[p.device_id] = p.mode;
    } else if (msg.type === 'device:screenshot') {
      live.screenshots[p.device_id] = p.url;
    } else if (msg.type === 'device:error') {
      live.errors[p.device_id] = p.message;
    } else if (msg.type === 'device:paired') {
      live.online.add(p.device_id);
    }
    live.feed = [{ type: msg.type, at: msg.at, ...p }, ...live.feed].slice(0, 80);
    bump();
  };
}

export function disconnectLive() {
  clearTimeout(timer);
  timer = null;
  attempts = 99;
  if (ws) {
    try {
      ws.onclose = null;
      ws.close();
    } catch {}
  }
  ws = null;
  live.connected = false;
  bump();
}

/** hook: estado vivo compartilhado + contador de revisões para re-render. */
export function useLive() {
  const rev = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    connectLive();
  }, [rev]);
  return { ...live, rev };
}

/** Notificações do navegador para o operador (tela caiu / tela voltou). */
export function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: undefined, silent: false });
  } catch {}
}

export async function askNotifyPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
