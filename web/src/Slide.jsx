/**
 * Renderizador de conteúdo — usado pelo runtime da TV/tablet e pela prévia do painel.
 * Cada tipo de mídia vira uma "peça" em tela cheia (ou na caixa de prévia), pronta para
 * funcionar offline: imagens/vídeos vêm de blob em cache quando a internet cai.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloudRain, CloudSun, Cloud, Sun, Snowflake, CloudFog, Newspaper, WifiOff } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');

export default function Slide({ media, src, ctx = {}, onEnded, preview = false }) {
  if (!media) return <Fallback title="Sem conteúdo" sub="Vincule uma playlist a esta tela no painel." />;
  const kind = media.kind;
  const common = { media, src: src || media.src, ctx, onEnded, preview };
  switch (kind) {
    case 'video':
      return <VideoSlide {...common} />;
    case 'image':
      return <ImageSlide {...common} />;
    case 'text':
      return <TextSlide {...common} />;
    case 'html':
      return <HtmlSlide {...common} />;
    case 'url':
      return <FrameSlide {...common} />;
    case 'youtube':
      return <YouTubeSlide {...common} />;
    case 'clock':
      return <ClockSlide {...common} />;
    case 'weather':
      return <WeatherSlide {...common} />;
    case 'news':
      return <NewsSlide {...common} />;
    default:
      return <Fallback title={media.title || 'Conteúdo'} sub={`tipo "${kind}" não suportado nesta versão do player`} />;
  }
}

/* --------------------------------- peças --------------------------------- */

function ImageSlide({ media, src, onEnded, preview }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [src]);
  const dur = media.duration_ms || 9000;
  useEffect(() => {
    if (!loaded || !onEnded) return;
    const t = setTimeout(onEnded, dur);
    return () => clearTimeout(t);
  }, [loaded, dur, onEnded]);
  if (!src) return <Fallback title={media.title} sub="arquivo indisponível" />;
  return (
    <div className="relative h-full w-full bg-black">
      <img src={src} alt={media.title || ''} onLoad={() => setLoaded(true)} className={cxp('h-full w-full object-contain transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0')} />
      {!preview && media.title && !loaded && <div className="absolute inset-0 grid place-items-center text-white/25">carregando peça…</div>}
    </div>
  );
}

function VideoSlide({ media, src, onEnded, preview }) {
  const ref = useRef(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.src = src;
    v.load();
    const p = v.play();
    p?.catch?.(() => {
      // alguns navegadores bloqueam autoplay sem gesto: tenta mudo novamente ao tocar
      const retry = () => v.play().catch(() => {});
      document.addEventListener('pointerdown', retry, { once: true });
      document.addEventListener('touchstart', retry, { once: true });
    });
  }, [src]);
  if (!src || err) return <Fallback title={media.title} sub="vídeo indisponível no aparelho" />;
  return (
    <video
      ref={ref}
      className="h-full w-full bg-black object-contain"
      muted
      autoPlay
      playsInline
      preload="auto"
      onError={() => setErr(true)}
      onEnded={() => onEnded?.()}
      controls={preview}
    />
  );
}

function TextSlide({ media }) {
  const text = media.body || media.title || '';
  const lines = text.split('\n').filter(Boolean);
  const [head, ...rest] = lines;
  return (
    <div className="flex h-full w-full flex-col justify-center gap-[2vh] bg-[radial-gradient(120%_100%_at_10%_0%,#1a1040,#05070f)] px-[6vw] py-[6vh]">
      {rest.length === 0 ? (
        <div className="ticker whitespace-nowrap text-[6.2vw] font-extrabold leading-[1.15] text-white" style={{ animationDuration: `${Math.max(12, head.length * 0.13)}s` }}>
          {head}
        </div>
      ) : (
        <>
          {media.title && <div className="text-[1.5vw] font-bold uppercase tracking-[0.32em] text-brand2">{media.title}</div>}
          <div className="max-w-[86%] text-[4.6vw] font-extrabold leading-[1.08] text-white">{head}</div>
          <div className="flex flex-col gap-[1.2vh] text-[1.9vw] font-medium leading-[1.4] text-white/70">
            {rest.map((l, i) => (
              <div key={i} className="flex gap-[1vw]">
                <span className="text-brand">▸</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HtmlSlide({ media }) {
  const doc = useMemo(
    () => `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:transparent;color:#fff;font-family:Inter,system-ui,sans-serif;overflow:hidden}
      *{box-sizing:border-box}img,video{max-width:100%;height:auto}
    </style>${media.body || ''}`,
    [media.body]
  );
  return <iframe title={media.title || 'peça html'} srcDoc={doc} sandbox="allow-scripts allow-same-origin allow-popups" className="h-full w-full border-0 bg-black" />;
}

function FrameSlide({ media, ctx }) {
  const [err, setErr] = useState(false);
  if (!media.url || err)
    return <Fallback title={media.title} sub={ctx.offline ? 'conteúdo online — sem internet no momento' : 'URL inválida'} />;
  return (
    <div className="h-full w-full bg-black">
      <iframe title={media.title || 'link'} src={media.url} onError={() => setErr(true)} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
    </div>
  );
}

const ytId = (url = '') => {
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
};

function YouTubeSlide({ media, ctx }) {
  const id = ytId(media.url);
  const [err, setErr] = useState(false);
  if (!id || err) return <Fallback title={media.title} sub={ctx.offline ? 'YouTube precisa de internet' : 'link do YouTube inválido'} />;
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=${id}`;
  return <iframe title={media.title || 'youtube'} src={src} className="h-full w-full border-0 bg-black" allow="autoplay; encrypted-media; picture-in-picture" onError={() => setErr(true)} />;
}

function ClockSlide({ media, ctx }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[2vh] bg-[linear-gradient(160deg,#040918,#0b1230_55%,#131a44)] px-[6vw] text-center">
      <div className="text-[16vw] font-black leading-[0.86] tracking-[-0.04em] text-white tabular-nums">
        {pad(now.getHours())}
        <span className="text-brand">:</span>
        {pad(now.getMinutes())}
        <span className="text-[5vw] font-bold text-white/45">{pad(now.getSeconds())}</span>
      </div>
      <div className="text-[2.4vw] font-semibold capitalize text-white/80">{date}</div>
      <div className="mt-[1vh] text-[1.3vw] font-bold uppercase tracking-[0.4em] text-brand2">
        {ctx.client?.name || media.title || 'OLHA.AI'}
      </div>
    </div>
  );
}

const WMO = {
  0: { i: Sun, l: 'Céu limpo' },
  1: { i: Sun, l: 'Maior parte limpo' },
  2: { i: CloudSun, l: 'Parcialmente nublado' },
  3: { i: Cloud, l: 'Nublado' },
  45: { i: CloudFog, l: 'Névoa' },
  48: { i: CloudFog, l: 'Névoa com geada' },
  51: { i: CloudRain, l: 'Garoa fraca' },
  53: { i: CloudRain, l: 'Garoa' },
  55: { i: CloudRain, l: 'Garoa intensa' },
  61: { i: CloudRain, l: 'Chuva fraca' },
  63: { i: CloudRain, l: 'Chuva' },
  65: { i: CloudRain, l: 'Chuva forte' },
  71: { i: Snowflake, l: 'Neve' },
  80: { i: CloudRain, l: 'Pancadas de chuva' },
  81: { i: CloudRain, l: 'Pancadas fortes' },
  95: { i: CloudRain, l: 'Tempestade' },
  99: { i: CloudRain, l: 'Tempestade com granizo' },
};

function WeatherSlide({ media, ctx }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const coords = ctx.coords || (ctx.location?.lat ? { lat: ctx.location.lat, lng: ctx.location.lng } : { lat: -5.09, lng: -42.8 });
  useEffect(() => {
    let alive = true;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;
    const load = async () => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (alive) {
          setData(j);
          setErr(false);
          ctx.onWidgetData?.({ kind: 'weather', ok: true });
        }
      } catch (e) {
        if (alive) {
          setErr(true);
          ctx.onWidgetData?.({ kind: 'weather', ok: false, error: String(e.message || e) });
        }
      }
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => ((alive = false), clearInterval(t));
  }, [coords.lat, coords.lng]);

  const cur = data?.current;
  const meta = WMO[cur?.weather_code] || { i: CloudSun, l: '—' };
  const Icon = meta.i;
  const city = [ctx.location?.city, ctx.location?.state].filter(Boolean).join(' · ') || 'sua cidade';
  return (
    <div className="flex h-full w-full flex-col justify-center gap-[3vh] bg-[radial-gradient(90%_90%_at_80%_10%,#0d2a3f,#05070f)] px-[6vw]">
      <div className="text-[1.4vw] font-bold uppercase tracking-[0.4em] text-brand2">{city}</div>
      {err && !cur ? (
        <div className="flex items-center gap-3 text-[2vw] text-white/70">
          <WifiOff size="1.8em" /> sem conexão para atualizar a previsão
          {data ? '' : ''}
        </div>
      ) : (
        <div className="flex items-center gap-[3vw]">
          <Icon className="text-white" style={{ width: '9vw', height: '9vw' }} strokeWidth={1.4} />
          <div>
            <div className="text-[10vw] font-black leading-none text-white">{cur ? Math.round(cur.temperature_2m) + '°' : '··°'}</div>
            <div className="mt-[0.6vh] text-[2.2vw] font-semibold text-white/75">{meta.l}</div>
          </div>
          <div className="ml-auto grid grid-cols-1 gap-[1.4vh] text-[1.5vw] text-white/70">
            <div>Sensação <b className="text-white">{cur ? Math.round(cur.apparent_temperature) + '°' : '—'}</b></div>
            <div>Umidade <b className="text-white">{cur ? cur.relative_humidity_2m + '%' : '—'}</b></div>
            <div>Vento <b className="text-white">{cur ? Math.round(cur.wind_speed_10m) + ' km/h' : '—'}</b></div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-5 gap-[1vw] border-t border-white/10 pt-[2.4vh]">
        {(data?.daily?.time || Array.from({ length: 5 }, () => '')).map((d, i) => {
          const dc = WMO[data?.daily?.weather_code?.[i]] || { i: CloudSun, l: '' };
          const DI = dc.i;
          return (
            <div key={i} className="flex flex-col items-center gap-[0.6vh] rounded-2xl bg-white/[0.04] px-[0.6vw] py-[1.4vh]">
              <span className="text-[1.2vw] font-bold uppercase tracking-widest text-white/60">
                {d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' }) : '—'}
              </span>
              <DI className="text-brand2" style={{ width: '2.6vw', height: '2.6vw' }} />
              <span className="text-[1.7vw] font-bold text-white">{data?.daily?.temperature_2m_max?.[i] != null ? Math.round(data.daily.temperature_2m_max[i]) + '°' : '··°'}</span>
              <span className="text-[1.2vw] text-white/50">{data?.daily?.temperature_2m_min?.[i] != null ? Math.round(data.daily.temperature_2m_min[i]) + '°' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewsSlide({ media, ctx }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState(false);
  const feed = media.url;
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!feed) return;
      try {
        const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(feed));
        const t = await r.text();
        const doc = new DOMParser().parseFromString(t, 'text/xml');
        const nodes = Array.from(doc.querySelectorAll('item')).slice(0, 12);
        const list = nodes.map((n) => ({
          title: n.querySelector('title')?.textContent?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '',
          date: n.querySelector('pubDate') ? new Date(n.querySelector('pubDate').textContent).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
        })).filter((x) => x.title);
        if (!alive) return;
        setItems(list);
        setErr(!list.length);
      } catch (e) {
        if (alive) {
          setErr(true);
          ctx.onWidgetData?.({ kind: 'news', ok: false, error: String(e.message || e) });
        }
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => ((alive = false), clearInterval(t));
  }, [feed]);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 5200);
    return () => clearInterval(t);
  }, [items.length]);
  const cur = items[idx];
  return (
    <div className="flex h-full w-full flex-col bg-[linear-gradient(180deg,#080d1e,#0d1330)]">
      <div className="flex items-center gap-[1vw] border-b border-white/10 px-[4vw] py-[2.4vh]">
        <Newspaper className="text-warn" style={{ width: '2.2vw', height: '2.2vw' }} />
        <span className="text-[1.6vw] font-black uppercase tracking-[0.3em] text-white">{media.title || 'Manchetes'}</span>
        <span className="ml-auto text-[1.2vw] text-white/50">{cur?.date || ''}</span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-[2vh] px-[4vw]">
        {err && !cur && <div className="flex items-center gap-3 text-[2vw] text-white/70"><WifiOff size="1.8em" /> não foi possível carregar o feed agora</div>}
        {cur && <div key={idx} className="fade-up max-w-[88%] text-[4vw] font-extrabold leading-[1.15] text-white">{cur.title}</div>}
        <div className="flex flex-col gap-[0.8vh] text-[1.5vw] text-white/45">
          {items.slice(idx + 1, idx + 4).map((x, i) => (
            <div key={i}>· {x.title}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Fallback({ title = 'Sem conteúdo', sub = '' }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[1.4vh] bg-[radial-gradient(80%_80%_at_50%_20%,#141a3d,#05070f)] px-[6vw] text-center">
      <div className="grid place-items-center rounded-full border border-white/10 p-[1.6vw]" style={{ width: '6vw', height: '6vw' }}>
        <span className="text-[2.4vw]">📺</span>
      </div>
      <div className="text-[2.6vw] font-extrabold text-white/90">{title}</div>
      {sub && <div className="max-w-[70%] text-[1.4vw] leading-relaxed text-white/50">{sub}</div>}
    </div>
  );
}

const cxp = (...a) => a.filter(Boolean).join(' ');
