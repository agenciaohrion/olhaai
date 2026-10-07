import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Tv, Radio, AlertTriangle, MapPin, ListVideo, Activity, Eye, PlayCircle, Pause, Camera, ArrowUpRight,
  CheckCircle2, Clock3, Images, Building2, Signal, RefreshCw,
} from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, statusStyle, asset } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.js';
import { Card, Head, Badge, Dot, Btn, Bars, Donut, Empty, Loading, cx, Meter, SmartImg, toast } from '../ui.jsx';

export default function Dashboard() {
  const { isAgency, q, focusClient } = useAuth();
  const ov = useApi(q('/overview'));
  const net = useApi(q('/network-state'));
  const act = useApi(q('/activity'));
  const live = useLive();

  const screens = net.data || [];
  const devices = useMemo(() => screens.map((d) => ({ ...d, online: live.online.has(d.id) || d.online })), [screens, live.online, live.rev]);
  const alerts = ov.data?.alerts || {};
  const loading = ov.loading || net.loading;

  return (
    <div className="space-y-4">
      <Greeting client={focusClient} isAgency={isAgency} />

      {loading && !ov.data ? (
        <Card className="p-0">
          <Loading label="lendo a rede…" />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Signal}
              tone="ok"
              label="telas no ar"
              value={`${ov.data?.screens.online ?? 0}/${ov.data?.screens.total ?? 0}`}
              sub={`${ov.data?.screens.pending ?? 0} aguardando pareamento · ${ov.data?.screens.offline ?? 0} sem sinal`}
              ring={{ value: ov.data?.screens.online ?? 0, total: Math.max(1, ov.data?.screens.total ?? 1) }}
            />
            <Stat
              icon={MapPin}
              tone="cyan"
              label="localização conhecida"
              value={`${ov.data?.screens.with_geo ?? 0}/${ov.data?.screens.total ?? 0}`}
              sub={`${ov.data?.counts.locations ?? 0} pontos de exibição cadastrados`}
              meter={{ value: pct(ov.data?.screens.with_geo, ov.data?.screens.total), tone: 'cyan' }}
              to="/mapa"
            />
            <Stat
              icon={PlayCircle}
              tone="brand"
              label="tempo de exibição hoje"
              value={fmt.min(ov.data?.playback.today_minutes ?? 0)}
              sub={`${fmt.n(ov.data?.playback.today_plays)} peças · ${fmt.n(ov.data?.playback.today_screens)} telas ativas`}
              spark={ov.data?.playback.hour_buckets}
            />
            <Stat
              icon={ListVideo}
              tone="warn"
              label="conteúdo & grades"
              value={`${ov.data?.counts.published ?? 0} publicadas`}
              sub={`${ov.data?.counts.media ?? 0} peças na biblioteca · ${ov.data?.counts.playlists ?? 0} playlists`}
              to="/programacao"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            {/* grade ao vivo */}
            <Card className="overflow-hidden">
              <Head
                icon={Radio}
                title="O que está no ar agora"
                sub="estado reportado por cada aparelho em tempo real"
                right={
                  <>
                    <Badge tone={live.connected ? 'ok' : 'err'}>{live.connected ? 'ao vivo' : 'reconectando'}</Badge>
                    <Btn size="xs" icon={RefreshCw} onClick={() => (ov.reload(), net.reload())}>
                      atualizar
                    </Btn>
                  </>
                }
              />
              {devices.length === 0 ? (
                <Empty
                  icon={Tv}
                  title="nenhuma tela cadastrada"
                  hint={isAgency ? 'Cadastre uma empresa, um ponto e instale o player na TV para vê-la aqui.' : 'Peça à agência para vincular uma tela à sua conta, ou cadastre você mesmo o aparelho.'}
                  action={<Btn size="sm" variant="primary" className="mt-3" icon={Plus2} onClick={() => (window.location.href = '/telas?new=1')}>cadastrar primeira tela</Btn>}
                />
              ) : (
                <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {devices.map((d) => (
                    <ScreenCard key={d.id} d={d} live={live} isAgency={isAgency} />
                  ))}
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="overflow-hidden">
                <Head icon={AlertTriangle} title="Precisam da sua atenção" sub="alertas automáticos da operação" />
                <div className="divide-y divide-line">
                  {(alerts.offline_stale || []).slice(0, 3).map((a) => (
                    <Alert key={'o' + a.device_id} tone="err" icon={AlertTriangle} to={`/telas/${a.device_id}`} title={`${a.name} está fora do ar`} sub={`${a.client}${a.location ? ' · ' + a.location : ''} · sem contato há ${fmt.min(a.minutes_offline)}`} />
                  ))}
                  {(alerts.unpaired || []).slice(0, 2).map((a) => (
                    <Alert key={'p' + a.device_id} tone="warn" icon={Radio} to="/instalacao" title={`${a.name} ainda não pareou`} sub={`gere o link de instalação${a.client ? ' para ' + a.client : ''}`} />
                  ))}
                  {(alerts.no_geo || []).slice(0, 2).map((a) => (
                    <Alert key={'g' + a.device_id} tone="cyan" icon={MapPin} to={`/telas/${a.device_id}`} title={`${a.name} sem localização`} sub="ative o GPS no tablet ou defina o ponto no mapa" />
                  ))}
                  {(alerts.clients_without_publication || []).slice(0, 2).map((a) => (
                    <Alert key={'c' + a.id} tone="brand" icon={ListVideo} to={`/programacao?client_id=${a.id}`} title={`${a.name} sem grade publicada`} sub="as telas ficam na tela de espera" />
                  ))}
                  {!totalAlerts(alerts) && (
                    <div className="flex items-center gap-2.5 px-4 py-6 text-[13px] text-mute">
                      <CheckCircle2 size={17} className="text-ok" /> tudo funcionando na rede
                    </div>
                  )}
                </div>
              </Card>

              <Card className="overflow-hidden">
                <Head icon={Activity} title="Atividade da rede" sub="eventos dos aparelhos e ações do painel" />
                <div className="max-h-[260px] overflow-y-auto">
                  {feedItems(act.data, live.feed).map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5 border-b border-line/60 px-4 py-2.5 last:border-0">
                      <Dot color={f.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] text-fg/90">{f.title}</p>
                        <p className="truncate text-[11px] text-mute">{f.sub}</p>
                      </div>
                      <span className="shrink-0 text-[10.5px] text-mute/70">{fmt.ago(f.at)}</span>
                    </div>
                  ))}
                  {!feedItems(act.data, live.feed).length && <Empty icon={Activity} title="sem eventos ainda" hint="assim que uma tela mandar heartbeat, aparece aqui." />}
                </div>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card className="overflow-hidden">
              <Head icon={Clock3} title="Exibição por hora (hoje)" sub="minutos de conteúdo no ar, agregados por aparelho" right={<Badge tone="mute">{fmt.min(ov.data?.playback.week_minutes)} na semana</Badge>} />
              <div className="p-4">
                <HourChart buckets={ov.data?.playback.hour_buckets || []} />
              </div>
            </Card>

            {isAgency ? <CoverageAgency data={ov.data} /> : <CoverageClient q={q} />}
          </div>
        </>
      )}
    </div>
  );
}

const Plus2 = ({ size = 16 }) => <span style={{ fontSize: size }}>+</span>;
const pct = (a, b) => (b ? Math.round(((a || 0) / b) * 100) : 0);
const totalAlerts = (a) => (a.offline_stale?.length || 0) + (a.unpaired?.length || 0) + (a.no_geo?.length || 0) + (a.clients_without_publication?.length || 0);

function Greeting({ client, isAgency }) {
  const h = new Date().getHours();
  const hi = h < 6 ? 'boa madrugada' : h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-[var(--font-display)] text-[20px] font-extrabold tracking-tight sm:text-[23px]">
          {hi} · {isAgency ? 'visão da operação' : client?.name || 'sua rede'}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-mute">
          {isAgency ? 'todas as empresas, telas e grades em um só lugar' : 'você mesmo publica e libera conteúdo pelas telas'}
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/instalacao">
          <Btn size="sm" icon={PlayCircle}>instalar numa TV</Btn>
        </Link>
        <Link to="/programacao">
          <Btn size="sm" variant="primary" icon={ListVideo}>montar programação</Btn>
        </Link>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone = 'brand', ring, meter, spark, to }) {
  const c = { brand: '#7c5cff', cyan: '#22d3ee', ok: '#34d399', warn: '#fbbf24', err: '#f87171' }[tone];
  const body = (
    <Card className="group relative h-full overflow-hidden p-4 transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-mute">
            <Icon size={13} style={{ color: c }} /> {label}
          </div>
          <div className="mt-2 font-[var(--font-display)] text-[25px] font-extrabold leading-none tracking-tight">{value}</div>
          {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-mute">{sub}</div>}
        </div>
        {ring && <Donut value={ring.value} total={ring.total} color={c} size={50} />}
      </div>
      {meter && <Meter className="mt-3" value={meter.value} tone={meter.tone} />}
      {spark && <Spark buckets={spark} color={c} />}
      {to && <ArrowUpRight size={15} className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100" />}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Spark({ buckets, color }) {
  const max = Math.max(1, ...buckets.map((b) => b.minutes));
  return (
    <div className="mt-3 flex h-9 items-end gap-[3px]">
      {Array.from({ length: 15 }, (_, i) => {
        const b = buckets.find((x) => x.h === 8 + i);
        return (
          <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, ((b?.minutes || 0) / max) * 100)}%`, background: b ? color : '#1c2447', opacity: b ? 0.85 : 0.5 }} title={b ? `${8 + i}h · ${b.minutes} min` : `${8 + i}h`} />
        );
      })}
    </div>
  );
}

function HourChart({ buckets }) {
  const data = Array.from({ length: 15 }, (_, i) => {
    const h = 8 + i;
    const b = buckets.find((x) => x.h === h);
    return { label: `${h}h`, value: b?.minutes || 0 };
  });
  return (
    <>
      <Bars data={data} unit=" min" height={132} />
      <p className="mt-3 text-[11.5px] text-mute">
        Janela comercial 8h–22h. Cada minuto é a soma do tempo de exibição reportado pelos aparelhos — use os relatórios para o detalhamento por tela e por conteúdo.
      </p>
    </>
  );
}

function ScreenCard({ d, live, isAgency }) {
  const nav = useNavigate();
  const style = statusStyle(d.online, true);
  const shot = live.screenshots[d.id] || (d.screenshot?.filename ? `/uploads/shots/${d.screenshot.filename}` : null);
  const modeBadge = { paused: ['pausada', 'warn'], takeover: ['destaque', 'brand'], vazio: ['sem grade', 'err'] }[d.mode];
  const [busy, setBusy] = useState('');

  const act = async (action, e) => {
    e.stopPropagation();
    setBusy(action);
    try {
      const r = await api(`/devices/${d.id}/action`, { method: 'POST', body: { action } });
      toast(r.delivered_now ? `comando enviado para ${d.name}` : `${d.name} está offline — comando na fila`, r.delivered_now ? 'ok' : 'warn');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy('');
    }
  };

  return (
    <div
      onClick={() => nav(`/telas/${d.id}`)}
      className="card-flat group cursor-pointer overflow-hidden transition hover:border-brand/50 hover:bg-white/[0.05]"
    >
      <div className={cx('relative aspect-video bg-black', !d.online && 'grayscale-[.45]')}>
        {shot ? (
          <img src={shot} alt="última captura" className="h-full w-full object-cover" />
        ) : d.current?.src ? (
          <SmartImg src={asset(d.current.src)} className="h-full w-full object-cover" />
        ) : d.playlist ? (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(70%_70%_at_30%_20%,rgba(124,92,255,.35),transparent)] px-3 text-center">
            <div>
              <PlayCircle size={22} className="mx-auto mb-1.5 text-brand" />
              <p className="line-clamp-2 text-[12px] font-semibold">{d.playlist.name}</p>
            </div>
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center gap-1 px-3 text-center text-mute">
            <Images size={20} />
            <p className="text-[11.5px]">sem grade publicada</p>
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/55 px-1.5 py-1 backdrop-blur">
          <Dot color={style.dot} live={d.online} />
          <span className="text-[10px] font-bold uppercase tracking-wide text-white/90">{style.label}</span>
        </div>
        {modeBadge && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 backdrop-blur">
            {modeBadge[0]}
          </span>
        )}
        {d.type === 'tablet' && d.battery != null && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white/85 backdrop-blur">🔋 {d.battery}%</span>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-gradient-to-t from-black/85 to-black/0 px-2 py-2 transition group-hover:translate-y-0">
          <Btn size="xs" variant="line" icon={Pause} loading={busy === 'pause'} onClick={(e) => act('pause', e)}>
            pausar
          </Btn>
          <Btn size="xs" variant="line" icon={RefreshCw} loading={busy === 'reload'} onClick={(e) => act('reload', e)}>
            recarregar
          </Btn>
          <Btn size="xs" variant="line" icon={Camera} loading={busy === 'screenshot'} onClick={(e) => act('screenshot', e)}>
            capturar
          </Btn>
        </div>
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold">{d.name}</p>
          <span className="shrink-0 rounded border border-line px-1 py-0.5 text-[9.5px] font-bold uppercase text-mute">{DEVICE_TYPES[d.type]?.short || d.type}</span>
        </div>
        <p className="truncate text-[11.5px] text-mute">
          {isAgency && d.client_name ? <span className="font-semibold text-brand2">{d.client_name} · </span> : null}
          {d.location || 'ponto não definido'} {d.city && <span className="text-mute/70">· {d.city}</span>}
        </p>
        <p className="truncate text-[11px] text-mute/80">
          {d.playlist ? `${d.playlist.items} peças · ${d.source === 'device' ? 'vínculo direto' : d.source === 'location' ? 'via ponto' : d.source === 'fallback' ? 'grade padrão da empresa' : 'via empresa'}` : 'nenhuma playlist vinculada'}
          {d.last_seen ? ` · visto ${fmt.ago(d.last_seen)}` : ''}
        </p>
      </div>
    </div>
  );
}

function Alert({ tone, icon: Icon, title, sub, to }) {
  const inner = (
    <div className="flex items-start gap-2.5 px-4 py-3 transition hover:bg-white/[0.03]">
      <Icon size={15} className={cx('mt-0.5 shrink-0', { err: 'text-err', warn: 'text-warn', cyan: 'text-brand2', brand: 'text-brand' }[tone])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-fg/90">{title}</p>
        <p className="truncate text-[11.5px] text-mute">{sub}</p>
      </div>
      {to && <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-mute" />}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : <div>{inner}</div>;
}

const TONE = { 'device:status': '#8d98c4', 'device:telemetry': '#34d399', 'device:paired': '#22d3ee', 'device:error': '#f87171', 'device:cmd': '#7c5cff', 'device:screenshot': '#fbbf24', log: '#8d98c4', audit: '#7c5cff' };

function feedItems(act, liveFeed) {
  const ws = (liveFeed || [])
    .slice(0, 6)
    .map((f) => ({
      title: feedTitle(f),
      sub: f.name || f.client_id ? `aparelho ${f.name || '#' + f.device_id}` : 'rede',
      at: f.at,
      color: TONE[f.type] || '#8d98c4',
    }));
  const logs = (act?.logs || []).slice(0, 10).map((l) => ({
    title: logTitle(l),
    sub: `${l.device_name}${l.client_name ? ' · ' + l.client_name : ''}`,
    at: l.created_at,
    color: l.type === 'error' ? '#f87171' : l.type === 'play' ? '#34d399' : '#8d98c4',
  }));
  const audits = (act?.audit || []).slice(0, 6).map((a) => ({
    title: `${a.actor || 'sistema'} · ${a.action}`,
    sub: a.detail || a.entity || '',
    at: a.created_at,
    color: '#7c5cff',
  }));
  return [...ws, ...logs, ...audits].slice(0, 14);
}
const feedTitle = (f) =>
  ({
    'device:status': `${f.name || 'tela'} ${f.status === 'online' ? 'voltou a responder' : 'parou de responder'}`,
    'device:telemetry': `${f.name || 'tela'} enviando telemetria`,
    'device:paired': `${f.name || 'aparelho'} pareado com sucesso`,
    'device:error': `erro reportado por ${f.name || 'tela'}`,
    'device:cmd': `comando ${f.action} enviado`,
    'device:screenshot': `nova captura de ${f.device_id ? '#' + f.device_id : 'tela'}`,
  }[f.type] || f.type);
const logTitle = (l) =>
  ({
    paired: 'pareamento concluído',
    play: `exibição registrada (${fmt.ms(l.payload?.ms)})`,
    cmd: `comando remoto: ${l.payload?.action}`,
    error: `erro: ${l.payload?.message || 'sem detalhe'}`,
    cache: `cache: ${l.payload?.message || 'atualizado'}`,
    gps: 'posição atualizada',
    info: l.payload?.message || 'evento do aparelho',
  }[l.type] || l.type);

function CoverageAgency({ data }) {
  const { data: clients } = useApi('/clients');
  if (!clients?.length) return null;
  return (
    <Card className="overflow-hidden">
      <Head icon={Building2} title="Cobertura por empresa" sub="telas ativas e pontos de cada conta" right={<Badge tone="mute">{clients.length} contas</Badge>} />
      <div className="divide-y divide-line">
        {clients.map((c) => (
          <Link key={c.id} to={`/telas?client_id=${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold">{c.brand || c.name}</p>
              <p className="truncate text-[11px] text-mute">
                {c.stats.locations} pontos · {c.stats.published} grades · {c.stats.media} peças · {c.plan}
              </p>
            </div>
            <div className="w-24 shrink-0">
              <div className="mb-1 flex justify-between text-[10px] text-mute">
                <span>{c.stats.online}/{c.stats.devices} telas</span>
                <span>{pct(c.stats.online, c.stats.devices)}%</span>
              </div>
              <Meter value={pct(c.stats.online, c.stats.devices)} tone={c.stats.online ? 'ok' : 'err'} />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function CoverageClient({ q }) {
  const { data } = useApi(q('/locations'));
  if (!data?.length) return <Card className="overflow-hidden"><Head icon={MapPin} title="Pontos de exibição" /><Empty icon={MapPin} title="nenhum ponto cadastrado" hint="Cadastre onde as telas ficam — o mapa e os relatórios usam essa informação." /></Card>;
  return (
    <Card className="overflow-hidden">
      <Head icon={MapPin} title="Meus pontos" sub="telas por local e público estimado" right={<Link to="/mapa"><Btn size="xs" icon={Eye}>no mapa</Btn></Link>} />
      <div className="divide-y divide-line">
        {data.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold">{l.name}</p>
              <p className="truncate text-[11px] text-mute">{l.address || 'sem endereço'} {l.city ? `· ${l.city}/${l.state}` : ''}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-bold">{l.online}/{l.device_count}</p>
              <p className="text-[10px] text-mute">{fmt.n(l.footfall)} pessoas/dia</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
