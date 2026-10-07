import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Tv, Tablet, Lightbulb, Monitor, Plus, Search, Grid3x3, List, MapPin, Radio, Camera, Pause, Play, RefreshCw,
  Trash2, Pencil, QrCode, Copy, CheckCircle2, AlertCircle, Loader2, RotateCcw,
} from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, statusStyle } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.js';
import { Card, Head, Badge, Dot, Btn, IconBtn, Input, Select, Field, Modal, Empty, Loading, cx, toast, Segmented, useAsk, Th, Td, Copy as CopyBox, Meter } from '../ui.jsx';

const ICONS = { tv: Tv, tablet: Tablet, led: Lightbulb, monitor: Monitor };

export default function Devices() {
  const { isAgency, q, body } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => localStorage.getItem('olha.view') || 'grid');
  const [term, setTerm] = useState('');
  const [fType, setFType] = useState('todos');
  const [fStatus, setFStatus] = useState('todos');
  const [fLoc, setFLoc] = useState('todos');
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [pair, setPair] = useState(null);
  const live = useLive();
  const list = useApi(q('/devices'));
  const locs = useApi(q('/locations'));
  const [ask, askNode] = useAsk();

  useEffect(() => localStorage.setItem('olha.view', view), [view]);
  useEffect(() => {
    if (params.get('new') === '1') setShowNew(true);
  }, [params]);

  const rows = useMemo(() => {
    let out = list.data || [];
    out = out.map((d) => ({ ...d, online: live.online.has(d.id) || d.online }));
    if (term) {
      const t = term.toLowerCase();
      out = out.filter((d) => [d.name, d.client_name, d.location_name, d.pairing_code].filter(Boolean).join(' ').toLowerCase().includes(t));
    }
    if (fType !== 'todos') out = out.filter((d) => d.type === fType);
    if (fStatus === 'online') out = out.filter((d) => d.online);
    if (fStatus === 'offline') out = out.filter((d) => !d.online && d.token);
    if (fStatus === 'pendente') out = out.filter((d) => !d.token);
    if (fLoc !== 'todos') out = out.filter((d) => String(d.location_id || 'none') === fLoc);
    return out;
  }, [list.data, term, fType, fStatus, fLoc, live.online, live.rev]);

  const save = async (data, id) => {
    const fn = id ? api(`/devices/${id}`, { method: 'PATCH', body: data }) : api('/devices', { method: 'POST', body: body(data) });
    const d = await fn;
    toast(id ? 'tela atualizada' : `tela criada — código de pareamento ${d.pairing_code}`, 'ok');
    list.reload();
    if (!id) {
      setShowNew(false);
      setPair(d);
    }
    return d;
  };

  const remove = async (d) => {
    if (!(await ask({ title: `Remover ${d.name}?`, body: 'O aparelho perde o pareamento e some da rede. Os registros de exibição são apagados junto.', danger: true, okLabel: 'remover tela' }))) return;
    await api(`/devices/${d.id}`, { method: 'DELETE' });
    toast('tela removida', 'ok');
    list.reload();
  };

  const stats = useMemo(() => {
    const all = (list.data || []).map((d) => ({ ...d, online: live.online.has(d.id) || d.online }));
    return {
      total: all.length,
      online: all.filter((d) => d.online).length,
      pend: all.filter((d) => !d.token).length,
      geo: all.filter((d) => d.lat != null).length,
    };
  }, [list.data, live.online, live.rev]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: 'telas cadastradas', v: stats.total, i: Tv, t: 'text-fg' },
          { l: 'respondendo agora', v: stats.online, i: Radio, t: 'text-ok' },
          { l: 'aguardando pareamento', v: stats.pend, i: QrCode, t: 'text-warn' },
          { l: 'com localização', v: stats.geo, i: MapPin, t: 'text-brand2' },
        ].map((s, i) => (
          <Card key={i} className="flex items-center gap-3 p-3.5">
            <span className={cx('grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/[0.03]', s.t)}>
              <s.i size={16} />
            </span>
            <div>
              <div className="font-[var(--font-display)] text-[19px] font-extrabold leading-none">{s.v}</div>
              <div className="mt-1 text-[10.5px] uppercase tracking-wider text-mute">{s.l}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <Head
          icon={Tv}
          title="Parque de telas"
          sub="TV Box, Android TV, tablets, painéis de LED e monitores vinculados à sua conta"
          right={
            <>
              <Segmented size="sm" options={[{ value: 'grid', label: <Grid3x3 size={13} /> }, { value: 'list', label: <List size={13} /> }]} value={view} onChange={setView} />
              <Btn size="sm" variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
                nova tela
              </Btn>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[190px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar por nome, empresa, ponto ou código" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
          </div>
          <Select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9 w-[150px] py-1 text-[12.5px]">
            <option value="todos">todos os tipos</option>
            {Object.entries(DEVICE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 w-[170px] py-1 text-[12.5px]">
            <option value="todos">qualquer estado</option>
            <option value="online">no ar</option>
            <option value="offline">sem sinal</option>
            <option value="pendente">aguardando pareamento</option>
          </Select>
          <Select value={fLoc} onChange={(e) => setFLoc(e.target.value)} className="h-9 w-[190px] py-1 text-[12.5px]">
            <option value="todos">todos os pontos</option>
            {(locs.data || []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
          {(term || fType !== 'todos' || fStatus !== 'todos' || fLoc !== 'todos') && (
            <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={() => (setTerm(''), setFType('todos'), setFStatus('todos'), setFLoc('todos'))}>
              limpar
            </Btn>
          )}
        </div>

        {list.loading && !list.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty
            icon={Tv}
            title={list.data?.length ? 'nenhuma tela com esses filtros' : 'nenhuma tela cadastrada'}
            hint={list.data?.length ? 'ajuste a busca ou limpe os filtros.' : 'Cadastre o aparelho, instale o player na TV/tablet e informe o código de pareamento que o painel gerar.'}
            action={<Btn size="sm" variant="primary" className="mt-3" icon={Plus} onClick={() => setShowNew(true)}>cadastrar tela</Btn>}
          />
        ) : view === 'grid' ? (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((d) => (
              <DeviceCard key={d.id} d={d} live={live} isAgency={isAgency} onEdit={() => setEditing(d)} onPair={() => setPair(d)} onRemove={() => remove(d)} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-white/[0.02]">
                <tr>
                  <Th>tela</Th>
                  {isAgency && <Th>empresa</Th>}
                  <Th>ponto</Th>
                  <Th>tipo</Th>
                  <Th>estado</Th>
                  <Th>no ar</Th>
                  <Th>localização</Th>
                  <Th className="text-right">ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => {
                  const style = statusStyle(d.online, !!d.token);
                  const Icon = ICONS[d.type] || Tv;
                  return (
                    <tr key={d.id} className="group transition hover:bg-white/[0.025]">
                      <Td>
                        <Link to={`/telas/${d.id}`} className="flex items-center gap-2">
                          <Icon size={15} className="text-mute" />
                          <span className="font-semibold text-fg group-hover:text-brand">{d.name}</span>
                        </Link>
                      </Td>
                      {isAgency && <Td className="text-mute">{d.client_name}</Td>}
                      <Td className="text-mute">{d.location_name || '—'}</Td>
                      <Td>
                        <Badge tone="mute">{DEVICE_TYPES[d.type]?.short || d.type} {d.orientation === 'v' ? '· V' : '· H'}</Badge>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5 text-[12px]">
                          <Dot color={style.dot} live={d.online} /> {style.label}
                        </span>
                      </Td>
                      <Td className="max-w-[190px] truncate">{d.on_air ? d.on_air.name : <span className="text-mute">sem grade</span>}</Td>
                      <Td className="text-mute">{d.lat != null ? <Link to={`/mapa?device=${d.id}`} className="text-brand2 hover:underline">{d.lat.toFixed(3)}, {d.lng.toFixed(3)}</Link> : <span className="text-warn">—</span>}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <IconBtn icon={QrCode} title="código de pareamento" onClick={() => setPair(d)} />
                          <IconBtn icon={Pencil} title="editar" onClick={() => setEditing(d)} />
                          <IconBtn icon={Trash2} title="remover" onClick={() => remove(d)} className="hover:border-err/50 hover:text-err" />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DeviceForm open={showNew || !!editing} onClose={() => (setShowNew(false), setEditing(null))} onSave={save} device={editing} locations={locs.data || []} />
      <PairModal device={pair} onClose={() => setPair(null)} />
      {askNode}
    </div>
  );
}

function DeviceCard({ d, live, isAgency, onEdit, onPair, onRemove }) {
  const nav = useNavigate();
  const Icon = ICONS[d.type] || Tv;
  const style = statusStyle(d.online, !!d.token);
  const [busy, setBusy] = useState('');
  const act = async (action, e) => {
    e.stopPropagation();
    setBusy(action);
    try {
      const r = await api(`/devices/${d.id}/action`, { method: 'POST', body: { action } });
      toast(r.delivered_now ? `${action} enviado para ${d.name}` : `${d.name} offline — comando na fila`, r.delivered_now ? 'ok' : 'warn');
    } catch (err) {
      toast(err.message, 'err');
    } finally { setBusy(''); }
  };

  return (
    <div className="card-flat group cursor-pointer overflow-hidden transition hover:border-brand/50" onClick={() => nav(`/telas/${d.id}`)}>
      <div className="flex items-start gap-2.5 p-3">
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl border', d.online ? 'border-ok/40 bg-ok/12 text-ok' : d.token ? 'border-line bg-white/[0.03] text-mute' : 'border-warn/40 bg-warn/10 text-warn')}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{d.name}</p>
            <Dot color={style.dot} live={d.online} />
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-mute">
            {isAgency && <span className="font-semibold text-brand2">{d.client_name} · </span>}
            {d.location_name || 'sem ponto'}
          </p>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={d.online ? 'ok' : d.token ? 'err' : 'warn'}>{style.label}</Badge>
          {d.mode === 'paused' && <Badge tone="warn">pausada</Badge>}
          {d.mode === 'takeover' && <Badge tone="brand">destaque</Badge>}
          <Badge tone="mute">{DEVICE_TYPES[d.type]?.short} {d.orientation === 'v' ? 'vertical' : 'horizontal'}</Badge>
          {d.battery != null && <Badge tone={d.battery < 20 ? 'err' : 'mute'}>🔋 {d.battery}%</Badge>}
          {d.current && <Badge tone="cyan" title="última peça exibida">{d.current.title}</Badge>}
        </div>

        <div className="rounded-lg border border-line bg-ink2/60 px-2.5 py-2">
          {d.on_air ? (
            <>
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="truncate font-semibold">{d.on_air.name}</span>
                <span className="shrink-0 text-mute">{d.on_air.items} peças</span>
              </div>
              <Meter className="mt-1.5" value={d.online ? 100 : 20} tone={d.online ? 'ok' : 'warn'} />
              <p className="mt-1.5 text-[10.5px] text-mute">
                {d.program_source === 'device' ? 'vínculo direto nesta tela' : d.program_source === 'location' ? 'herdada do ponto' : d.program_source === 'fallback' ? 'grade padrão da empresa' : 'toda a empresa'}
                {d.last_seen ? ` · visto ${fmt.ago(d.last_seen)}` : ' · nunca conectou'}
              </p>
            </>
          ) : (
            <p className="text-[11.5px] text-warn">nenhuma playlist publicada para esta tela</p>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Btn size="xs" variant="line" icon={RefreshCw} loading={busy === 'reload'} onClick={(e) => act('reload', e)}>recarregar</Btn>
          {d.mode === 'paused' ? (
            <Btn size="xs" variant="line" icon={Play} loading={busy === 'resume'} onClick={(e) => act('resume', e)}>retomar</Btn>
          ) : (
            <Btn size="xs" variant="line" icon={Pause} loading={busy === 'pause'} onClick={(e) => act('pause', e)}>pausar</Btn>
          )}
          <Btn size="xs" variant="line" icon={Camera} loading={busy === 'screenshot'} onClick={(e) => act('screenshot', e)}>capturar</Btn>
          <div className="ml-auto flex gap-1">
            <IconBtn icon={QrCode} title="pareamento" onClick={onPair} />
            <IconBtn icon={Pencil} title="editar" onClick={onEdit} />
            <IconBtn icon={Trash2} title="remover" onClick={onRemove} className="hover:border-err/50 hover:text-err" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceForm({ open, onClose, device, onSave, locations }) {
  const { isAgency, clients, focusId } = useAuth();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setErr('');
      setForm(
        device
          ? { name: device.name, type: device.type, orientation: device.orientation, location_id: device.location_id || '', notes: device.notes || '', client_id: device.client_id, lat: device.lat ?? '', lng: device.lng ?? '' }
          : { name: '', type: 'tv', orientation: 'h', location_id: '', notes: '', client_id: focusId || clients?.[0]?.id || '', lat: '', lng: '' }
      );
    }
  }, [open, device]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const payload = { ...form, location_id: form.location_id ? Number(form.location_id) : null, lat: form.lat === '' ? undefined : Number(form.lat), lng: form.lng === '' ? undefined : Number(form.lng) };
      if (device) delete payload.client_id;
      await onSave(payload, device?.id);
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally { setBusy(false); }
  };
  const locOf = (id) => locations.find((l) => l.id === Number(id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={device ? `Editar ${device.name}` : 'Cadastrar tela / tablet'}
      sub="o painel gera um código de pareamento; você instala o player no aparelho e informa esse código."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>cancelar</Btn>
          <Btn variant="primary" loading={busy} onClick={submit}>{device ? 'salvar alterações' : 'criar e gerar código'}</Btn>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err">{err}</p>}
        <Field label="nome da tela" hint="ex.: TV Recepção, Tablet Carro 01">
          <Input value={form.name || ''} onChange={set('name')} placeholder="TV Sala de Espera" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="tipo de aparelho">
            <Select value={form.type} onChange={set('type')}>
              {Object.entries(DEVICE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="orientação">
            <Select value={form.orientation} onChange={set('orientation')}>
              <option value="h">horizontal (paisagem)</option>
              <option value="v">vertical (retrato)</option>
            </Select>
          </Field>
        </div>
        {isAgency && !device && (
          <Field label="empresa">
            <Select value={form.client_id || ''} onChange={set('client_id')} required>
              <option value="">selecione…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ponto de exibição" hint={locOf(form.location_id) ? `${locOf(form.location_id)?.city}/${locOf(form.location_id)?.state}` : 'opcional'}>
            <Select value={form.location_id || ''} onChange={set('location_id')}>
              <option value="">sem ponto fixo</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="lat" hint="manual">
              <Input value={form.lat ?? ''} onChange={set('lat')} placeholder="-5.0912" inputMode="decimal" />
            </Field>
            <Field label="lng">
              <Input value={form.lng ?? ''} onChange={set('lng')} placeholder="-42.8001" inputMode="decimal" />
            </Field>
          </div>
        </div>
        {form.location_id && locOf(form.location_id)?.lat != null && (
          <p className="flex items-center gap-1.5 rounded-lg border border-line bg-ink2/60 px-3 py-2 text-[11.5px] text-mute">
            <MapPin size={13} className="text-brand2" /> sem coordenadas manuais, a tela usa a posição do ponto {locOf(form.location_id)?.name} no mapa.
          </p>
        )}
        <Field label="observações" hint="ex.: TV da sala de espera, volume mudo, 1080p">
          <Input value={form.notes || ''} onChange={set('notes')} placeholder="anotações da instalação" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function PairModal({ device, onClose }) {
  const url = `${location.origin}/player?code=${device?.pairing_code || ''}`;
  const [qrOk, setQrOk] = useState(true);
  if (!device) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Parear ${device.name}`}
      sub="abra o player no aparelho (TV Box, navegador da Smart TV, tablet) e informe o código abaixo."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>fechar</Btn>
          <Link to={url} target="_blank">
            <Btn variant="line" icon={CheckCircle2}>abrir player aqui</Btn>
          </Link>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="grid place-items-center rounded-2xl border border-line bg-white p-3">
          {qrOk ? (
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=6&data=${encodeURIComponent(url)}`} width="170" height="170" alt="QR de pareamento" onError={() => setQrOk(false)} />
          ) : (
            <div className="grid h-[170px] w-[170px] place-items-center text-center text-[11px] text-mute">QR indisponível<br />use o link ao lado</div>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-mute">código de pareamento</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-mono text-[30px] font-black tracking-[0.18em] text-brand">{device.pairing_code}</span>
              <CopyBox text={device.pairing_code} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-mute">o código é único por tela e pode ser regenerado sem danificar a programação.</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-mute">endereço do player</p>
            <div className="mt-1.5"><CopyBox text={url} className="w-full" /></div>
          </div>
          {device.token ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">
              <CheckCircle2 size={14} /> já pareado — o aparelho está vinculado e recebendo a grade.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
              <AlertCircle size={14} /> aguardando o primeiro contato do aparelho.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export { PairModal };
