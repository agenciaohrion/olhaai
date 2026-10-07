import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Tv, RefreshCw, Pause, Play, Camera, MapPin, Navigation, Radio, Zap, QrCode, Trash2, Save, Clock3, BatteryCharging, Monitor, Activity, AlertTriangle, CheckCircle2, Layers, Crosshair, Star, Link2, RotateCcw,
} from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, MEDIA_KINDS, DAY_LABELS, statusStyle, asset, str2date } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.js';
import { Card, Head, Badge, Dot, Btn, IconBtn, Input, Select, Field, Modal, Empty, Loading, cx, toast, Bars, Meter, SmartImg, Copy, useAsk } from '../ui.jsx';

export default function DeviceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAgency } = useAuth();
  const live = useLive();
  const [tab, setTab] = useState('programacao');
  const [busy, setBusy] = useState('');
  const [takeover, setTakeover] = useState(false);
  const [pair, setPair] = useState(false);
  const [form, setForm] = useState(null);
  const [ask, askNode] = useAsk();
  const { data: d, loading, reload } = useApi(`/devices/${id}`);
  const media = useApi('/media');
  const locs = useApi('/locations');

  useEffect(() => setForm(d ? { name: d.name, location_id: d.location_id || '', orientation: d.orientation, type: d.type, notes: d.notes || '' } : null), [d?.id]);

  if (loading && !d) return <Loading label="abrindo a tela…" />;
  if (!d) return <Empty icon={AlertTriangle} title="tela não encontrada" hint="Ela pode ter sido removida ou você não tem acesso a ela." action={<Link to="/telas"><Btn size="sm" className="mt-3">voltar para a lista</Btn></Link>} />;

  const online = live.online.has(d.id) || d.online;
  const st = statusStyle(online, !!d.token);
  const program = d.program || { items: [], playlist: null, windows: [], mode: d.mode };

  const cmd = async (action, payload = {}) => {
    setBusy(action);
    try {
      const r = await api(`/devices/${d.id}/action`, { method: 'POST', body: { action, ...payload } });
      toast(
        r.delivered_now ? `${labelFor(action)} entregue à tela` : `${labelFor(action)} na fila — ${d.name} está sem sinal`,
        r.delivered_now ? 'ok' : 'warn',
        3600
      );
      setTimeout(reload, 1400);
      reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  const save = async () => {
    setBusy('save');
    try {
      await api(`/devices/${d.id}`, { method: 'PATCH', body: { ...form, location_id: form.location_id ? Number(form.location_id) : null } });
      toast('tela atualizada', 'ok', 1800);
      reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  const remove = async () => {
    if (!(await ask({ title: `Remover ${d.name}?`, body: 'O aparelho perde o vínculo e para de receber conteúdo. Guarde antes o que ele exibe.', danger: true, okLabel: 'remover tela' }))) return;
    await api(`/devices/${d.id}`, { method: 'DELETE' });
    nav('/telas');
  };

  return (
    <div className="space-y-3">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/telas"><IconBtn icon={ArrowLeft} title="voltar" /></Link>
        <h2 className="font-[var(--font-display)] text-[19px] font-extrabold tracking-tight">{d.name}</h2>
        <Badge tone={online ? 'ok' : d.token ? 'err' : 'warn'}>{st.label}</Badge>
        {d.mode === 'paused' && <Badge tone="warn">pausada</Badge>}
        {d.mode === 'takeover' && <Badge tone="brand">destaque ativo</Badge>}
        {isAgency && <Badge tone="mute">{d.client_name}</Badge>}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Btn size="sm" icon={QrCode} onClick={() => setPair(true)}>pareamento</Btn>
          <Btn size="sm" icon={RefreshCw} loading={busy === 'reload'} onClick={() => cmd('reload')}>recarregar</Btn>
          <Btn size="sm" icon={Camera} loading={busy === 'screenshot'} onClick={() => cmd('screenshot')}>capturar tela</Btn>
          {d.mode === 'paused' ? (
            <Btn size="sm" icon={Play} loading={busy === 'resume'} onClick={() => cmd('resume')}>retomar</Btn>
          ) : (
            <Btn size="sm" icon={Pause} loading={busy === 'pause'} onClick={() => cmd('pause')}>pausar</Btn>
          )}
          <Btn size="sm" variant="primary" icon={Star} onClick={() => setTakeover(true)}>destaque agora</Btn>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-3">
          {/* tabs */}
          <Card className="overflow-hidden">
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-1.5">
              {[
                { k: 'programacao', l: 'programação', i: Layers },
                { k: 'telemetria', l: 'telemetria', i: Activity },
                { k: 'capturas', l: 'capturas', i: Camera, n: d.screenshots?.length },
                { k: 'eventos', l: 'eventos', i: Radio, n: d.logs?.length },
                { k: 'config', l: 'configuração', i: Save },
              ].map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} className={cx('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-semibold transition', tab === t.k ? 'border-brand text-fg' : 'border-transparent text-mute hover:text-fg')}>
                  <t.i size={13} /> {t.l} {t.n != null && <span className="rounded bg-white/[0.06] px-1 text-[10px]">{t.n}</span>}
                </button>
              ))}
            </div>

            {tab === 'programacao' && (
              <div>
                <Head
                  icon={Radio}
                  title={program.playlist ? program.playlist.name : 'nenhuma playlist resolvida'}
                  sub={
                    program.playlist
                      ? `v${program.playlist.version} · origem: ${srcLabel(program.source)} · ${program.items.length} peça(s) · modo ${program.mode}`
                      : 'vincule uma playlist no editor de programação ou defina uma para esta tela'
                  }
                  right={<Link to={program.playlist ? `/programacao/${program.playlist.id}` : '/programacao'}><Btn size="xs" icon={Layers}>abrir grade</Btn></Link>}
                />
                <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="overflow-hidden rounded-xl border border-line">
                    {program.items.length === 0 ? (
                      <div className="grid aspect-video place-items-center bg-black/40 text-[12.5px] text-mute">a tela mostra a mensagem “aguardando programação”</div>
                    ) : (
                      <div className="relative aspect-video bg-black">
                        {d.screenshots?.[0] ? (
                          <>
                            <img src={`/uploads/shots/${d.screenshots[0].filename}`} alt="última captura" className="h-full w-full object-cover" />
                            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/80">última captura</span>
                          </>
                        ) : (
                          <SmartImg src={asset(program.items[0].thumb)} className="h-full w-full object-contain opacity-90" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-mute">grade do dia</p>
                    {d.timeline?.length ? (
                      <div className="space-y-1">
                        {d.timeline.map((t) => (
                          <div key={t.dow} className={cx('flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11.5px]', t.active ? 'border-ok/30 bg-ok/[0.06]' : 'border-line bg-ink2/40')}>
                            <span className="w-8 shrink-0 font-bold">{t.label}</span>
                            <span className="truncate text-mute">
                              {t.windows?.length ? t.windows.map((w) => `${w.start}–${w.end}`).join(', ') : t.active ? 'o dia todo' : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-mute">sem janelas: a playlist roda o dia inteiro.</p>
                    )}
                  </div>
                </div>

                {program.items.length > 0 && (
                  <div className="border-t border-line px-3 py-2.5">
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-mute">fila desta tela</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {program.items.map((it, i) => (
                        <div key={i} className="w-[132px] shrink-0 overflow-hidden rounded-lg border border-line bg-ink2/60">
                          <SmartImg src={asset(it.thumb)} className="aspect-video w-full object-cover" />
                          <div className="px-2 py-1.5">
                            <p className="truncate text-[11px] font-semibold" title={it.title}>{i + 1}. {it.title}</p>
                            <p className="text-[10px] text-mute">{MEDIA_KINDS[it.kind]?.label} · {fmt.ms(it.slot_ms)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'telemetria' && (
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <Info2 title="conexão" icon={Radio}>
                  <Row2 k="último contato" v={d.last_seen ? `${fmt.ago(d.last_seen)} (${fmt.dt(d.last_seen)})` : 'nunca conectou'} />
                  <Row2 k="estado" v={online ? 'respondendo agora' : 'sem resposta'} tone={online ? 'ok' : 'err'} />
                  <Row2 k="uptime" v={d.uptime ? `${Math.floor(d.uptime / 3600)}h ${Math.round((d.uptime % 3600) / 60)}min` : '—'} />
                  <Row2 k="aparelho" v={`${d.os || '—'} · player ${d.app_version || '—'}`} />
                  <Row2 k="resolução" v={d.width ? `${d.width}×${d.height} (${d.orientation === 'v' ? 'vertical' : 'horizontal'})` : '—'} />
                </Info2>
                <Info2 title="energia" icon={BatteryCharging}>
                  {d.battery != null ? (
                    <>
                      <div className="mb-2 flex items-end gap-2">
                        <span className="font-[var(--font-display)] text-[28px] font-extrabold">{d.battery}%</span>
                        {d.charging ? <Badge tone="ok">carregando</Badge> : <Badge tone="warn">na bateria</Badge>}
                      </div>
                      <Meter value={d.battery} tone={d.battery < 20 ? 'err' : d.battery < 45 ? 'warn' : 'ok'} />
                      <p className="mt-2 text-[11.5px] leading-relaxed text-mute">
                        Tablets em veículo devem ficar no carregador: abaixo de 20% o painel avisa e a tela pode entrar em economia de energia.
                      </p>
                    </>
                  ) : (
                    <p className="text-[12px] text-mute">aparelho sem leitura de bateria (TV/monitor na tomada).</p>
                  )}
                </Info2>
                <Info2 title="localização" icon={MapPin}>
                  <Row2 k="coordenada" v={d.lat != null ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : 'não informada'} />
                  <Row2 k="precisão" v={d.accuracy ? `±${Math.round(d.accuracy)} m` : '—'} />
                  <Row2 k="origem" v={d.geo_source || '—'} />
                  <Row2 k="atualizada" v={d.geo_at ? fmt.ago(d.geo_at) : '—'} />
                  <Row2 k="velocidade" v={d.speed != null ? `${(d.speed * 3.6).toFixed(0)} km/h` : '—'} />
                  <div className="mt-2 flex gap-1.5">
                    <Btn size="xs" icon={Crosshair} loading={busy === 'locate'} onClick={() => cmd('locate')}>GPS agora</Btn>
                    <Link to={`/mapa?device=${d.id}`}><Btn size="xs" icon={Navigation}>no mapa</Btn></Link>
                  </div>
                </Info2>
                <Info2 title="exibição nos últimos dias" icon={Clock3}>
                  {d.playlog?.length ? (
                    <>
                      <Bars height={92} data={[...d.playlog].reverse().map((p) => ({ label: p.day.slice(8), value: Math.round(p.ms / 60000) }))} unit=" min" />
                      <p className="mt-2 text-[11.5px] text-mute">{d.playlog.reduce((a, p) => a + p.plays, 0)} peças exibidas · {fmt.min(Math.round(d.playlog.reduce((a, p) => a + p.ms, 0) / 60000))} no ar</p>
                    </>
                  ) : (
                    <p className="text-[12px] text-mute">sem registros ainda — aparecem depois do primeiro ciclo de exibição.</p>
                  )}
                </Info2>
              </div>
            )}

            {tab === 'capturas' && (
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11.5px] text-mute">imagens enviadas pelo próprio aparelho quando o painel pede</p>
                  <Btn size="xs" icon={Camera} loading={busy === 'screenshot'} onClick={() => cmd('screenshot')}>capturar agora</Btn>
                </div>
                {!d.screenshots?.length ? (
                  <Empty icon={Camera} title="nenhuma captura" hint="Peça uma captura para conferir o que está na tela sem depender de foto de celular." />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {d.screenshots.map((s) => (
                      <figure key={s.id} className="overflow-hidden rounded-xl border border-line">
                        <img src={`/uploads/shots/${s.filename}`} alt="captura" className="aspect-video w-full bg-black object-cover" />
                        <figcaption className="bg-ink2/70 px-2 py-1.5 text-[10.5px] text-mute">{fmt.dt(s.created_at)} · {s.w || '?'}×{s.h || '?'}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'eventos' && (
              <div className="max-h-[520px] divide-y divide-line overflow-y-auto">
                {!d.logs?.length && <Empty icon={Activity} title="sem eventos" />}
                {(d.logs || []).map((l) => (
                  <div key={l.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <Dot color={{ paired: '#22d3ee', play: '#34d399', cmd: '#7c5cff', error: '#f87171', gps: '#fbbf24', info: '#8d98c4' }[l.type] || '#8d98c4'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold">{l.type}</p>
                      <p className="truncate text-[11px] text-mute" title={JSON.stringify(l.payload)}>{describe(l.payload)}</p>
                    </div>
                    <span className="shrink-0 text-[10.5px] text-mute/70">{fmt.dt(l.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'config' && (
              <div className="space-y-3 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="nome"><Input value={form?.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
                  <Field label="tipo">
                    <Select value={form?.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                      {Object.entries(DEVICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="orientação">
                    <Select value={form?.orientation} onChange={(e) => setForm((f) => ({ ...f, orientation: e.target.value }))}>
                      <option value="h">horizontal</option>
                      <option value="v">vertical</option>
                    </Select>
                  </Field>
                  <Field label="ponto de exibição">
                    <Select value={form?.location_id || ''} onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}>
                      <option value="">sem ponto</option>
                      {(locs.data || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="observações"><Input value={form?.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
                <div className="flex gap-2">
                  <Btn variant="primary" icon={Save} loading={busy === 'save'} onClick={save}>salvar</Btn>
                  <Btn variant="ghost" icon={RotateCcw} onClick={() => setForm({ name: d.name, location_id: d.location_id || '', orientation: d.orientation, type: d.type, notes: d.notes || '' })}>descartar</Btn>
                </div>
                <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">identificação</p>
                    <div className="space-y-1.5">
                      <Row2 k="uid" v={d.uid} mono />
                      <Row2 k="código atual" v={d.pairing_code} mono />
                      <Row2 k="pareado em" v={d.paired_at ? fmt.dt(d.paired_at) : '—'} />
                      <Row2 k="user agent" v={d.ua || '—'} mono />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Btn size="xs" icon={Zap} onClick={async () => { const r = await api(`/devices/${d.id}/rotate-code`, { method: 'POST' }); toast('novo código gerado: ' + r.pairing_code, 'ok'); reload(); }}>gerar novo código</Btn>
                      <Btn size="xs" icon={Trash2} onClick={async () => { if (!(await ask({ title: 'Desvincular aparelho?', body: 'A tela volta para a tela de pareamento e só recebe conteúdo de novo depois de informar um código.', danger: true, okLabel: 'desvincular' }))) return; const r = await api(`/devices/${d.id}/unpair`, { method: 'POST' }); toast('aparelho desvinculado — novo código ' + r.pairing_code, 'ok'); reload(); }}>desvincular</Btn>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">zona de risco</p>
                    <Btn size="sm" variant="danger" icon={Trash2} onClick={remove}>remover esta tela da rede</Btn>
                    <p className="mt-2 text-[11px] leading-relaxed text-mute">
                      Remover não apaga o conteúdo da biblioteca nem a programação — só desfaz o vínculo deste aparelho.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* lateral */}
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <Head icon={Tv} title="resumo do aparelho" />
            <div className="space-y-2.5 p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/[0.03]">
                  {DEVICE_TYPES[d.type]?.short === 'TAB' ? <Monitor size={17} className="text-brand2" /> : <Tv size={17} className="text-brand" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold">{DEVICE_TYPES[d.type]?.label || d.type}</p>
                  <p className="truncate text-[11px] text-mute">{d.orientation === 'v' ? 'modo vertical' : 'modo horizontal'}</p>
                </div>
              </div>
              <dl className="space-y-1.5">
                <Row2 k="ponto" v={d.location_name || '—'} />
                <Row2 k="playlist" v={d.on_air?.name || 'sem grade'} />
                <Row2 k="origem do vínculo" v={srcLabel(d.program_source)} />
                <Row2 k="última peça exibida" v={d.current?.title || '—'} />
                <Row2 k="peça atual (estimada)" v={d.current?.title || '—'} />
              </dl>
              {d.notes && <p className="rounded-lg border border-line bg-ink2/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-mute">{d.notes}</p>}
              <div className="flex gap-1.5 pt-1">
                <Btn size="xs" icon={CheckCircle2} onClick={() => cmd('identify')}>pisca na tela</Btn>
                <Btn size="xs" icon={Link2} onClick={() => setPair(true)}>link de instalação</Btn>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <Head icon={Zap} title="comandos avançados" />
            <div className="grid gap-1.5 p-3">
              <Btn size="sm" icon={Star} onClick={() => setTakeover(true)}>colocar um destaque só nesta tela</Btn>
              {d.mode === 'takeover' && <Btn size="sm" icon={Layers} loading={busy === 'resume'} onClick={() => cmd('resume')}>encerrar destaque e voltar à grade</Btn>}
              <Btn size="sm" icon={RefreshCw} loading={busy === 'clear'} onClick={() => cmd('clear')}>limpar cache de mídia do aparelho</Btn>
              <p className="text-[11px] leading-relaxed text-mute">
                Comandos para tela sem sinal entram em fila e são executados no próximo contato — nada se perde se a internet do ponto cair.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <TakeoverModal open={takeover} onClose={() => setTakeover(false)} media={media.data || []} onRun={(id2) => { cmd('takeover', { media_id: id2 }); setTakeover(false); }} />
      <PairInfo open={pair} onClose={() => setPair(false)} device={d} />
      {askNode}
    </div>
  );
}

const labelFor = (a) => ({ reload: 'recarregar', screenshot: 'captura', pause: 'pausar', resume: 'retomar', identify: 'identificar', locate: 'posição', clear: 'limpeza de cache', takeover: 'destaque' }[a] || a);
const srcLabel = (s) => ({ device: 'desta tela', location: 'do ponto', client: 'da empresa', fallback: 'padrão da empresa', takeover: 'destaque manual', manual: 'modo manual', none: 'nenhum vínculo' }[s] || s || '—');
const describe = (p) => {
  if (!p) return '';
  try {
    const o = typeof p === 'string' ? JSON.parse(p) : p;
    return Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  } catch {
    return String(p);
  }
};

const Row2 = ({ k, v, tone, mono }) => (
  <div className="flex items-baseline justify-between gap-3 text-[12px]">
    <span className="shrink-0 text-mute">{k}</span>
    <span className={cx('min-w-0 truncate text-right', mono && 'font-mono text-[11px]', tone === 'ok' ? 'text-ok' : tone === 'err' ? 'text-err' : 'text-fg/90')} title={String(v)}>
      {v ?? '—'}
    </span>
  </div>
);

const Info2 = ({ title, icon: Icon, children }) => (
  <div className="rounded-xl border border-line bg-ink2/40 p-3">
    <p className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">
      <Icon size={13} className="text-brand" /> {title}
    </p>
    {children}
  </div>
);

function TakeoverModal({ open, onClose, media, onRun }) {
  const [pick, setPick] = useState(null);
  const [pos, setPos] = useState(20);
  const list = media.filter((m) => ['image', 'video', 'html', 'text', 'url', 'youtube', 'clock', 'weather'].includes(m.kind));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Destaque nesta tela"
      sub="interrompe a grade naquele aparelho por um tempo determinado — ótimo para aviso imediato sem mexer na programação dos outros"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>cancelar</Btn>
          <Btn variant="primary" disabled={!pick} onClick={() => onRun(pick)}>colocar no ar</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {list.map((m) => (
            <button key={m.id} onClick={() => setPick(m.id)} className={cx('overflow-hidden rounded-xl border text-left transition', pick === m.id ? 'border-brand ring-1 ring-brand/40' : 'border-line hover:border-brand/40')}>
              <SmartImg src={asset(m.thumb)} className="aspect-video w-full object-cover" />
              <span className="block truncate px-2 py-1.5 text-[11.5px] font-semibold">{m.title}</span>
            </button>
          ))}
        </div>
        <Field label={`duração do destaque: ${pos >= 100 ? 'até ser encerrado' : pos + ' min'}`}>
          <input type="range" min={5} max={120} step={5} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full accent-[#7c5cff]" />
        </Field>
        <p className="text-[11.5px] text-mute">O retorno à grade acontece ao encerrar o destaque ou ao clicar em “retomar” na tela.</p>
      </div>
    </Modal>
  );
}

function PairInfo({ open, onClose, device }) {
  const url = `${location.origin}/player?code=${device?.pairing_code || ''}`;
  if (!open || !device) return null;
  return (
    <Modal open onClose={onClose} size="sm" title="Instalar / reinstalar esta tela" sub="abra este endereço no aparelho e informe o código">
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-4">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(url)}`} width="140" height="140" alt="QR" className="rounded-xl bg-white p-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="text-center">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-mute">código</p>
            <p className="mt-1 font-mono text-[26px] font-black tracking-[0.16em] text-brand">{device.pairing_code}</p>
            <p className="mt-1 text-[11px] text-mute">{device.token ? 'pareado e recebendo conteúdo' : 'aguardando primeiro contato'}</p>
          </div>
        </div>
        <Copy text={url} />
        <Link to="/instalacao"><Btn size="sm" className="w-full">ver guia completo de instalação</Btn></Link>
      </div>
    </Modal>
  );
}
