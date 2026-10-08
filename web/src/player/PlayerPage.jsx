/**
 * RUNTIME DE EXIBIÇÃO — roda no navegador da TV Box, Android TV, tablet ou painel LED.
 * Endereçado em /player. Responsável por: pareamento, receber a grade, baixar e guardar
 * as peças em cache local (funciona offline), exibir na sequência certa, aplicar janelas
 * de horário, responder comandos do painel e reportar telemetria + posição (GPS).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../store.js';
import { useSearchParams } from 'react-router-dom';
import Slide from '../Slide.jsx';
import { Fallback } from '../Slide.jsx';
import { Loader2, WifiOff, QrCode, Tv, MapPin, BatteryMedium, Info, X, Maximize2, Radio, HardDriveDownload, RefreshCw, ShieldCheck } from 'lucide-react';

const TKEY = 'olha.player.token';
const DKEY = 'olha.player.device';
const CACHE = 'olha-media-v1';
const HEARTBEAT_MS = 15000;
const VIDEO_BLOB_MAX = 28 * 1024 * 1024;

const api = async (path, { method = 'GET', body, form, token } = {}) => {
  const headers = {};
  const t = token || store.get(TKEY) || '';
  if (t) headers.authorization = `Bearer ${t}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch('/api' + path, { method, headers, body: form ? form : body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {}
  if (!r.ok) throw new Error(json?.error || `http ${r.status}`);
  return json;
};

export default function PlayerPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(() => store.get(TKEY) || '');
  const [phase, setPhase] = useState(token ? 'loading' : 'pair');
  const [manifest, setManifest] = useState(null);
  const [net, setNet] = useState(true);
  const [err, setErr] = useState('');
  const [diag, setDiag] = useState(false);
  const [flash, setFlash] = useState(false);
  const [cache, setCache] = useState({ items: 0, bytes: 0, pending: 0 });
  const [coords, setCoords] = useState(null);
  const startedAt = useRef(Date.now());
  const hashRef = useRef('');
  const log = useRef([]);
  const coordsRef = useRef(null);
  const battRef = useRef(null);
  const currentRef = useRef(null);
  const modeRef = useRef('playlist');
  const addLog = (m, t = 'info') => (log.current = [{ at: new Date().toLocaleTimeString('pt-BR'), type: t, m }, ...log.current].slice(0, 40));

  const push = useCallback((type, payload) => {
    api('/player/log', { method: 'POST', body: { type, ...payload } }).catch(() => {});
  }, []);

  /* ------------------------- pareamento ------------------------- */
  const pair = async (code, geo) => {
    setErr('');
    try {
      const info = {
        ua: navigator.userAgent,
        os: `${navigator.platform || 'web'} · ${navigator.hardwareConcurrency || '?'} threads`,
        app_version: '1.4.0',
        width: window.screen.width * (window.devicePixelRatio || 1) || window.innerWidth,
        height: window.screen.height * (window.devicePixelRatio || 1) || window.innerHeight,
        orientation: window.innerHeight > window.innerWidth ? 'v' : 'h',
        geo: geo || undefined,
      };
      const r = await api('/player/pair', { method: 'POST', body: { code: code.trim().toUpperCase(), info }, token: '' });
      store.set(TKEY, r.token);
      store.set(DKEY, JSON.stringify({ id: r.device.id, name: r.device.name, code }));
      setToken(r.token);
      setManifest(r.manifest);
      hashRef.current = r.manifest.hash;
      setPhase('ready');
      addLog(`pareado como ${r.device.name}`, 'ok');
      push('info', { message: `pareado (${code})` });
    } catch (e) {
      setErr(e.message);
    }
  };

  const forget = () => {
    store.del(TKEY);
    store.del(DKEY);
    setToken('');
    setPhase('pair');
    setManifest(null);
  };

  /* ------------------------- carregar grade ------------------------- */
  const loadManifest = useCallback(
    async (silent = false) => {
      try {
        const m = await api('/player/manifest');
        setManifest(m);
        hashRef.current = m.hash;
        setPhase(m.program.items.length ? 'ready' : m.program.mode === 'paused' ? 'paused' : 'empty');
        setNet(true);
        if (!silent) addLog('grade sincronizada', 'ok');
        return m;
      } catch (e) {
        if (/401|403|não pareado/i.test(String(e.message))) {
          store.del(TKEY);
          setToken('');
          setPhase('pair');
          addLog('pareamento revogado — informe o código novamente', 'erro');
        } else setNet(false);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (!token) return;
    loadManifest().then((m) => {
      if (!m) return;
      setPhase(m.program.items.length ? 'ready' : 'empty');
    });
  }, [token, loadManifest]);

  /* ------------------------- cache dos arquivos ------------------------- */
  const cacheOf = useMemo(() => {
    const map = {};
    for (const it of manifest?.program.items || []) {
      if (it.media.src) map[it.media.src] = it.media;
    }
    return map;
  }, [manifest]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!('caches' in window)) return;
      const c = await caches.open(CACHE);
      const list = Object.entries(cacheOf);
      setCache((s) => ({ ...s, pending: list.length }));
      let bytes = 0;
      let items = 0;
      for (const [src, media] of list) {
        try {
          const cached = await c.match(src);
          const fresh = cached && (await header(cached, 'x-olha-sum')) === (media.checksum || '');
          if (!fresh) {
            const r = await fetch(src, { cache: 'reload' });
            if (r.ok) {
              const blob = await r.blob();
              await c.put(
                src,
                new Response(blob, { headers: { 'content-type': blob.type, 'x-olha-sum': media.checksum || '', 'cache-control': 'public,max-age=31536000' } })
              );
              addLog(`cache: ${media.title} (${(blob.size / 1024).toFixed(0)} KB)`, 'cache');
            }
          }
          const b = await c.match(src);
          bytes += (await b?.blob?.())?.size || 0;
          items++;
        } catch (e) {
          addLog(`falha ao guardar ${media.title}: ${e.message}`, 'erro');
        }
        if (!alive) return;
        setCache({ items, bytes, pending: Math.max(0, list.length - items) });
      }
      if (alive) setCache((s) => ({ ...s, pending: 0 }));
    })();
    return () => {
      alive = false;
    };
  }, [cacheOf]);

  const blobFor = useCallback(
    async (src) => {
      if (!src) return src;
      if (!('caches' in window)) return src;
      try {
        const c = await caches.open(CACHE);
        const r = await c.match(src);
        if (!r) return src;
        const blob = await r.blob();
        return URL.createObjectURL(blob);
      } catch {
        return src;
      }
    },
    []
  );

  /* ------------------------- heartbeat + comandos ------------------------- */
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'empty' && phase !== 'paused') return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await api('/player/heartbeat', {
          method: 'POST',
          body: {
            hash: hashRef.current,
            uptime: Math.round((Date.now() - startedAt.current) / 1000),
            playing: currentRef.current || undefined,
            geo: coordsRef.current || undefined,
            battery: battRef.current?.level != null ? Math.round(battRef.current.level * 100) : undefined,
            charging: battRef.current?.charging,
            width: window.innerWidth,
            height: window.innerHeight,
            mode: modeRef.current,
            app_version: '1.4.0',
          },
        });
        setNet(true);
        if (r.changed && r.manifest) {
          setManifest(r.manifest);
          hashRef.current = r.manifest.hash;
          setPhase(r.manifest.program.items.length ? 'ready' : r.manifest.program.mode === 'paused' ? 'paused' : 'empty');
          addLog('grade alterada pelo painel — aplicada', 'ok');
        } else if (r.hash) hashRef.current = r.hash;
        for (const cmd of r.commands || []) applyCmd(cmd);
      } catch (e) {
        setNet(false);
      }
    };
    tick();
    const t = setInterval(tick, HEARTBEAT_MS);
    return () => ((stop = true), clearInterval(t));
  }, [phase]);

  /* ------------------------- websocket (empurrões instantâneos) ------------------------- */
  useEffect(() => {
    if (!token) return;
    let ws;
    let timer;
    const open = () => {
      try {
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?kind=device&token=${encodeURIComponent(token)}`);
      } catch {
        return;
      }
      ws.onopen = () => addLog('tempo real conectado', 'ok');
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === 'manifest:changed') loadManifest();
        else if (m.type === 'mode') {
          modeRef.current = m.payload.mode;
          setPhase(m.payload.mode === 'paused' ? 'paused' : 'ready');
          loadManifest();
        } else if (m.type === 'cmd') applyCmd(m);
      };
      ws.onclose = () => {
        if (!stop) timer = setTimeout(open, 8000);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    };
    let stop = false;
    open();
    return () => {
      stop = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
    };
  }, [token, loadManifest]);

  /* ------------------------- posição (tablet / veículo) ------------------------- */
  useEffect(() => {
    if (!manifest?.device?.geo_required && !('geolocation' in navigator)) return;
    let last = 0;
    const send = (pos) => {
      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        bearing: pos.coords.heading,
        speed: pos.coords.speed,
        source: 'gps',
        timestamp: pos.timestamp,
      };
      coordsRef.current = c;
      setCoords(c);
      if (Date.now() - last < 45000 && pos.timestamp === last) return;
      last = Date.now();
      api('/player/geo', { method: 'POST', body: c }).catch(() => {});
    };
    const id = navigator.geolocation?.watchPosition?.(
      (p) => send(p),
      (e) => addLog('GPS indisponível: ' + e.message, 'erro'),
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 20000 }
    );
    return () => navigator.geolocation?.clearWatch?.(id);
  }, [manifest?.device?.geo_required]);

  /* ------------------------- bateria + manter tela ativa ------------------------- */
  useEffect(() => {
    navigator.getBattery?.().then((b) => {
      battRef.current = b;
      b.onlevelchange = () => (battRef.current = b);
    });
    let lock;
    const wake = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {}
    };
    wake();
    const onVis = () => document.visibilityState === 'visible' && wake();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      try {
        lock?.release();
      } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* ------------------------- player da fila ------------------------- */
  const items = manifest?.program.items || [];
  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState(null);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    modeRef.current = manifest?.program.mode || 'playlist';
  }, [manifest]);

  const cur = items[idx % Math.max(1, items.length)];
  useEffect(() => {
    let alive = true;
    let url = null;
    (async () => {
      const media = cur?.media;
      const want = media?.src;
      if (!want) return setSrc(null);
      // vídeo grande: usa a rede (com cache do navegador) para não estourar memória
      const small = media.kind === 'image' || (media.bytes || 0) < VIDEO_BLOB_MAX;
      const u = small ? await blobFor(want) : want;
      if (!alive) {
        if (u !== want) URL.revokeObjectURL(u);
        return;
      }
      setSrc(u);
      url = u !== want ? u : null;
    })();
    return () => {
      alive = false;
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1500);
    };
  }, [cur?.media?.src, blobFor]);

  const slot = useMemo(() => {
    const d = cur?.duration_ms;
    if (cur?.media?.kind === 'video') return 0; // decidido pelo fim do vídeo
    return d || MEDIA_DEFAULT[cur?.media?.kind] || 9000;
  }, [cur]);

  useEffect(() => {
    if (!items.length || hold || slot === 0) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % items.length), slot);
    return () => clearTimeout(t);
  }, [idx, items.length, slot, hold, manifest?.hash]);

  // registro de exibição (peça mostrada → minutos no ar nos relatórios)
  useEffect(() => {
    if (!cur) return;
    currentRef.current = { media_id: cur.media.id, playlist_id: manifest?.program.id, ms: slot || cur.media.duration_ms || 9000 };
  }, [cur, slot, manifest]);

  /* ------------------------- comandos do painel ------------------------- */
  const applyCmd = useCallback(
    async (msg) => {
      const action = msg?.payload?.action || msg?.type;
      addLog(`comando: ${action}`, 'cmd');
      switch (action) {
        case 'reload':
          await loadManifest();
          break;
        case 'identify':
          setFlash(true);
          setTimeout(() => setFlash(false), 5000);
          break;
        case 'screenshot':
          await takeShot({ cur, manifest, addLog, push });
          break;
        case 'clear':
          if ('caches' in window) {
            await caches.delete(CACHE);
            setCache({ items: 0, bytes: 0, pending: 0 });
            loadManifest();
          }
          break;
        case 'locate':
          navigator.geolocation?.getCurrentPosition(
            (p) => {
              const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, bearing: p.coords.heading, source: 'gps', timestamp: p.timestamp };
              coordsRef.current = c;
              setCoords(c);
              api('/player/geo', { method: 'POST', body: c }).catch(() => {});
              addLog('posição enviada ao painel', 'ok');
            },
            (e) => addLog('não foi possível ler o GPS: ' + e.message, 'erro'),
            { enableHighAccuracy: true, timeout: 15000 }
          );
          break;
        default:
          break;
      }
    },
    [cur, manifest, src, loadManifest, push]
  );

  /* ------------------------- atalhos de operação ------------------------- */
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'i' || e.key === 'I') setDiag((d) => !d);
      if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.().catch(() => {});
      if (e.key === 'r' || e.key === 'R') location.reload();
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % Math.max(1, items.length));
      if (e.key === ' ') setHold((h) => !h);
      if (e.key === 'Escape') setDiag(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [items.length]);

  // watchdog: se travar em uma peça por muito tempo, recarrega a página
  useEffect(() => {
    if (!items.length || phase !== 'ready' || cur?.media?.kind === 'video') return;
    const limit = Math.max(90000, (slot || 10000) * 6);
    const t = setTimeout(() => {
      addLog('watchdog: sem avanço de peça, recarregando', 'erro');
      location.reload();
    }, limit);
    return () => clearTimeout(t);
  }, [idx, slot, items.length, phase, cur?.media?.kind]);

  const onEnded = useCallback(() => {
    if (cur?.media?.kind === 'video') setIdx((i) => (i + 1) % Math.max(1, items.length));
  }, [cur, items.length]);

  /* ------------------------- render ------------------------- */
  if (phase === 'pair' || phase === 'loading')
    return <PairScreen onPair={pair} busy={phase === 'loading'} err={err} params={params} onForget={forget} />;

  const paused = phase === 'paused' || manifest?.program.mode === 'paused';
  const empty = phase === 'empty' || !items.length;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
      {paused ? (
        <Fallback title="Tela pausada pelo painel" sub="A programação volta automaticamente quando a agência ou o cliente retomar a exibição." />
      ) : empty ? (
        <div className="relative h-full w-full">
          <Fallback
            title="Aguardando programação"
            sub={`${manifest?.device?.name || 'este aparelho'} está pareado${manifest?.client?.name ? ` com ${manifest.client.name}` : ''}. Assim que uma playlist for publicada, ela aparece aqui.`}
          />
          <DiagBadge net={net} code={manifest?.device?.uid} />
        </div>
      ) : (
        <Slide media={cur.media} src={src} ctx={{ client: manifest.client, location: manifest.location, coords, offline: !net, onWidgetData: (d) => addLog(`widget ${d.kind}: ${d.ok ? 'ok' : 'erro'} ${d.error || ''}`, d.ok ? 'ok' : 'erro') }} onEnded={onEnded} />
      )}

      {!net && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur">
          <WifiOff size={12} /> sem internet — exibindo do cache
        </div>
      )}
      {flash && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-brand/25 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/20 bg-black/70 px-6 py-4 text-center">
            <p className="text-[13px] uppercase tracking-[0.3em] text-white/70">esta é a tela</p>
            <p className="mt-1 font-black text-[34px] text-white">{manifest?.device?.name}</p>
            <p className="mt-1 text-[12px] text-white/60">{manifest?.client?.name} · {manifest?.location?.name || 'sem ponto'}</p>
          </div>
        </div>
      )}
      {diag && (
        <DiagOverlay
          manifest={manifest}
          cache={cache}
          net={net}
          coords={coords}
          logs={log.current}
          idx={idx}
          items={items}
          battery={battRef.current}
          onClose={() => setDiag(false)}
          onForget={forget}
          onReload={() => loadManifest()}
        />
      )}
      {!diag && <div className="pointer-events-none absolute bottom-1.5 left-2 font-mono text-[9px] text-white/12">OLHA.AI player · i = diagnóstico</div>}
    </div>
  );
}

const MEDIA_DEFAULT = { image: 9000, text: 9000, html: 15000, url: 30000, youtube: 60000, clock: 12000, weather: 12000, news: 20000, video: 0 };

const header = async (res, name) => res.headers.get(name) || '';

/* ------------------------------ tela de pareamento ------------------------------ */

function PairScreen({ onPair, busy, err, params, onForget }) {
  const [code, setCode] = useState((params.get('code') || '').toUpperCase());
  const [geo, setGeo] = useState(null);
  const [asked, setAsked] = useState(false);
  const url = `${location.origin}/player${code ? `?code=${code}` : ''}`;

  useEffect(() => {
    if (params.get('code') && params.get('auto') !== '0') onPair(params.get('code'));
  }, []);

  const ask = () => {
    setAsked(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, source: 'gps', timestamp: p.timestamp }),
      () => setGeo(null),
      { timeout: 8000 }
    );
  };

  const digits = code.replace(/[^A-Z0-9]/g, '').toUpperCase();

  return (
    <div className="fixed inset-0 grid place-items-center overflow-auto bg-[radial-gradient(120%_120%_at_50%_0%,#151b3d,#05070f_60%)] p-6 text-white">
      <div className="w-full max-w-[560px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/40 bg-violet-500/15">
            <Tv size={20} className="text-violet-300" />
          </span>
          <div>
            <p className="font-black text-[22px] leading-none tracking-tight">OLHA<span className="text-violet-400">.AI</span></p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-white/45">player de exibição</p>
          </div>
        </div>

        <h1 className="text-center text-[clamp(22px,3.2vw,34px)] font-extrabold leading-tight">Conecte esta tela ao seu painel</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-center text-[clamp(12px,1.2vw,14px)] leading-relaxed text-white/55">
          No painel, cadastre a tela e copie o código gerado. Depois informe aqui — o conteúdo chega na hora e continua no ar mesmo se a internet cair.
        </p>

        <div className="mt-7 flex items-center justify-center gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={cn(
                'grid h-[clamp(46px,7vw,66px)] w-[clamp(38px,6vw,54px)] place-items-center rounded-xl border text-[clamp(22px,3.4vw,32px)] font-black tabular-nums transition',
                digits[i] ? 'border-violet-400/70 bg-violet-500/20 text-white' : 'border-white/12 bg-white/[0.04] text-white/25'
              )}
            >
              {digits[i] || '·'}
            </span>
          ))}
        </div>

        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && digits.length >= 4 && onPair(digits)}
          placeholder="CÓDE DE PAREAMENTO"
          className="mt-5 w-full rounded-2xl border border-white/12 bg-white/[0.05] px-5 py-4 text-center text-[clamp(18px,2.6vw,26px)] font-bold uppercase tracking-[0.3em] outline-none transition focus:border-violet-400/70"
        />

        {err && <p className="mt-3 rounded-xl border border-red-400/40 bg-red-500/12 px-4 py-2.5 text-center text-[13px] text-red-200">{err}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={() => digits.length >= 4 && onPair(digits)}
            disabled={digits.length < 4 || busy}
            className="flex items-center gap-2 rounded-xl bg-violet-500 px-6 py-3.5 text-[15px] font-bold text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} parear esta tela
          </button>
          <button onClick={ask} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/10">
            <MapPin size={14} /> {asked ? (geo ? `GPS ok · ±${Math.round(geo.accuracy)} m` : 'sem GPS (permita a localização)') : 'usar GPS deste tablet'}
          </button>
          {onForget && store.get(TKEY) && (
            <button onClick={onForget} className="text-[12px] text-white/45 underline">trocar pareamento</button>
          )}
        </div>

        <div className="mt-9 grid gap-4 rounded-2xl border border-white/[0.08] bg-black/25 p-4 sm:grid-cols-[auto_1fr]">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${encodeURIComponent(url)}`} width="120" height="120" alt="QR" className="rounded-lg bg-white p-1" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white/45">
              <QrCode size={12} /> opção 2: apontar a câmera do tablet
            </p>
            <p className="mt-2 break-all font-mono text-[11.5px] leading-relaxed text-white/60">{url}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">
              Em TVs sem teclado, use o celular para abrir este endereço. O pareamento fica salvo: a próxima abertura já entra direto na programação.
            </p>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-4 text-[11px] text-white/35">
          <span className="flex items-center gap-1"><HardDriveDownload size={12} /> guarda as peças no aparelho</span>
          <span className="flex items-center gap-1"><Radio size={12} /> sincroniza sozinho</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ diagnóstico ------------------------------ */

function DiagOverlay({ manifest, cache, net, coords, logs, idx, items, battery, onClose, onForget, onReload }) {
  const m = manifest;
  return (
    <div className="absolute inset-0 z-[60] overflow-auto bg-[#05070f]/96 p-5 font-mono text-[12px] text-white/80 backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <div className="mx-auto max-w-[980px]">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[15px] font-bold text-white">diagnóstico do aparelho</h2>
          <button onClick={onReload} className="flex items-center gap-1 rounded border border-white/15 px-2 py-1 hover:bg-white/10"><RefreshCw size={12} /> sincronizar</button>
          <button onClick={onForget} className="flex items-center gap-1 rounded border border-red-400/40 px-2 py-1 text-red-200 hover:bg-red-500/15">desparear</button>
          <button onClick={onClose} className="ml-auto flex items-center gap-1 rounded border border-white/15 px-2 py-1 hover:bg-white/10"><X size={12} /> fechar (i)</button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Box title="aparelho">
            <Row k="nome" v={m?.device?.name} />
            <Row k="uid" v={m?.device?.uid} />
            <Row k="tipo" v={`${m?.device?.type} / ${m?.device?.orientation}`} />
            <Row k="viewport" v={`${window.innerWidth}×${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(1)}x`} />
            <Row k="bateria" v={battery ? `${Math.round(battery.level * 100)}% ${battery.charging ? '⚡ carregando' : ''}` : '—'} />
            <Row k="player" v="1.4.0 (web)" />
          </Box>
          <Box title="grade">
            <Row k="empresa" v={m?.client?.name} />
            <Row k="ponto" v={m?.location?.name || '—'} />
            <Row k="playlist" v={m?.program?.name || '—'} />
            <Row k="versão" v={`v${m?.program?.version} · hash ${m?.hash}`} />
            <Row k="modo" v={m?.program?.mode} />
            <Row k="origem" v={m?.program?.source} />
            <Row k="peça atual" v={`${idx + 1}/${items.length}: ${items[idx]?.media?.title || '—'}`} />
          </Box>
          <Box title="rede & cache">
            <Row k="internet" v={net ? 'ok' : 'SEM CONEXÃO (usando cache)'} tone={net ? 'ok' : 'warn'} />
            <Row k="peças em cache" v={`${cache.items}/${items.length}`} />
            <Row k="download" v={cache.pending ? `${cache.pending} em fila` : 'concluído'} />
            <Row k="espaço" v={`${(cache.bytes / 1024 / 1024).toFixed(1)} MB`} />
            <Row k="posição" v={coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${Math.round(coords.accuracy || 0)} m)` : 'não reportada'} />
            <Row k="endereço" v={m?.location?.address || '—'} />
          </Box>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Box title="fila de exibição">
            <ol className="space-y-0.5">
              {items.map((it, i) => (
                <li key={i} className={cn('flex justify-between gap-2', i === idx ? 'text-violet-300' : '')}>
                  <span className="truncate">{i + 1}. {it.media.title} <span className="text-white/30">[{it.media.kind}]</span></span>
                  <span className="shrink-0 text-white/40">{it.duration_ms ? Math.round(it.duration_ms / 1000) + 's' : it.media.kind === 'video' ? 'vídeo' : '9s'}</span>
                </li>
              ))}
            </ol>
          </Box>
          <Box title="eventos">
            <div className="max-h-[240px] space-y-0.5 overflow-auto">
              {logs.map((l, i) => (
                <p key={i} className={cn(l.type === 'erro' ? 'text-red-300' : l.type === 'ok' ? 'text-emerald-300' : 'text-white/60')}>
                  <span className="text-white/30">{l.at}</span> {l.m}
                </p>
              ))}
              {!logs.length && <p className="text-white/30">sem eventos</p>}
            </div>
          </Box>
        </div>
      </div>
    </div>
  );
}

const Box = ({ title, children }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{title}</p>
    <div className="space-y-1">{children}</div>
  </div>
);
const Row = ({ k, v, tone }) => (
  <p className="flex justify-between gap-3">
    <span className="shrink-0 text-white/40">{k}</span>
    <span className={cn('truncate text-right', tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/90')} title={String(v)}>{v ?? '—'}</span>
  </p>
);
const DiagBadge = ({ net, code }) => (
  <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded-lg bg-black/45 px-2 py-1 font-mono text-[9px] text-white/25 backdrop-blur">
    <span className={net ? 'text-emerald-400/60' : 'text-amber-400/70'}>{net ? 'online' : 'offline'}</span>
    {code && <span>{code.slice(-6)}</span>}
  </div>
);
const cn = (...a) => a.filter(Boolean).join(' ');

/* ------------------------------ captura de tela ------------------------------ */

async function takeShot({ cur, manifest, addLog, push }) {
  try {
    const W = 640;
    const H = Math.round((W * (window.innerHeight || 9)) / (window.innerWidth || 16));
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx2 = cv.getContext('2d');
    ctx2.fillStyle = manifest?.program?.bg || '#05070f';
    ctx2.fillRect(0, 0, W, H);
    const img = document.querySelector('img');
    const vid = document.querySelector('video');
    if (vid && vid.readyState >= 2) {
      const r = Math.min(W / vid.videoWidth, H / vid.videoHeight);
      ctx2.drawImage(vid, (W - vid.videoWidth * r) / 2, (H - vid.videoHeight * r) / 2, vid.videoWidth * r, vid.videoHeight * r);
    } else if (img && img.naturalWidth) {
      const r = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      ctx2.drawImage(img, (W - img.naturalWidth * r) / 2, (H - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r);
    } else {
      ctx2.fillStyle = 'rgba(255,255,255,.9)';
      ctx2.font = 'bold 26px sans-serif';
      ctx2.fillText((cur?.media?.title || 'tela').slice(0, 34), 28, H / 2);
      ctx2.fillStyle = 'rgba(255,255,255,.45)';
      ctx2.font = '15px sans-serif';
      ctx2.fillText(new Date().toLocaleString('pt-BR'), 28, H / 2 + 34);
      ctx2.fillText(`${manifest?.device?.name} · ${cur?.media?.kind}`, 28, H / 2 + 58);
    }
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.72));
    if (!blob) throw new Error('canvas vazio');
    const fd = new FormData();
    fd.append('shot', blob, 'shot.jpg');
    fd.append('w', String(W));
    fd.append('h', String(H));
    await api('/player/screenshot', { method: 'POST', form: fd });
    addLog('captura enviada ao painel', 'ok');
  } catch (e) {
    addLog('captura falhou: ' + e.message, 'erro');
    push('error', { message: 'screenshot: ' + e.message });
  }
}
