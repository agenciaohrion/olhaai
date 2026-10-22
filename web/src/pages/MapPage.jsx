import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Navigation, Crosshair, Camera, Pause, Play, Radio, Layers, AlertTriangle, Search, Pencil, Save, Tv, Tablet, Lightbulb, Monitor, Gauge } from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, statusStyle } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.js';
import { Card, Head, Badge, Dot, Btn, Input, Select, Field, Modal, Empty, Loading, cx, toast, Segmented, Meter, SmartImg } from '../ui.jsx';

const ICONS = { tv: Tv, tablet: Tablet, led: Lightbulb, monitor: Monitor };
const COLOR = { online: '#34d399', offline: '#f87171', pendente: '#fbbf24' };

export default function MapPage() {
  const { isAgency, q, body } = useAuth();
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const mapData = useApi(q('/map'));
  const net = useApi(q('/network-state'));
  const [mode, setMode] = useState('telas'); // telas | pontos
  const [term, setTerm] = useState('');
  const [fStatus, setFStatus] = useState('todos');
  const [sel, setSel] = useState(params.get('device') ? Number(params.get('device')) : null);
  const [edit, setEdit] = useState(null);

  const devices = useMemo(() => {
    let out = (mapData.data?.devices || []).map((d) => ({ ...d, online: live.online.has(d.id) || d.online }));
    if (term) {
      const t = term.toLowerCase();
      out = out.filter((d) => [d.name, d.location_name, d.client_name].filter(Boolean).join(' ').toLowerCase().includes(t));
    }
    if (fStatus === 'online') out = out.filter((d) => d.online);
    if (fStatus === 'offline') out = out.filter((d) => !d.online && d.status !== 'pendente');
    if (fStatus === 'geo') out = out.filter((d) => d.lat == null);
    return out;
  }, [mapData.data, term, fStatus, live.online, live.rev]);

  const located = devices.filter((d) => d.lat != null);
  const missing = devices.filter((d) => d.lat == null);
  const state = useMemo(() => Object.fromEntries((net.data || []).map((d) => [d.id, d])), [net.data]);
  const selected = devices.find((d) => d.id === sel) || null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_356px]">
        <Card className="overflow-hidden">
          <Head
            icon={MapPin}
            title="Onde cada tela está"
            sub="posição recebida do próprio aparelho (GPS/rede) ou definida pelo ponto de exibição"
            right={
              <>
                <Segmented size="sm" options={[{ value: 'telas', label: 'telas' }, { value: 'pontos', label: 'pontos' }]} value={mode} onChange={setMode} />
                <Btn size="sm" icon={Radio} onClick={() => mapData.reload()}>atualizar</Btn>
              </>
            }
          />
          <div className="grid gap-2 border-b border-line px-3 py-2.5 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar tela, ponto ou empresa" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
            </div>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 w-full py-1 text-[12.5px] sm:w-[180px]">
              <option value="todos">todas</option>
              <option value="online">somente no ar</option>
              <option value="offline">somente sem sinal</option>
              <option value="geo">sem localização</option>
            </Select>
            <div className="flex items-center gap-2.5 px-1 text-[11px] text-mute">
              {['online', 'offline', 'pendente'].map((k) => (
                <span key={k} className="flex items-center gap-1"><Dot color={COLOR[k]} /> {k}</span>
              ))}
            </div>
          </div>

          {mapData.loading && !mapData.data ? (
            <Loading label="carregando coordenadas…" />
          ) : (
            <MapView
              devices={located}
              mode={mode}
              locations={mapData.data?.locations || []}
              state={state}
              sel={sel}
              onPick={(id) => {
                setSel(id);
                setParams(id ? { device: String(id) } : {}, { replace: true });
              }}
              isAgency={isAgency}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11.5px] text-mute">
            <span>
              <b className="text-fg">{located.length}</b> de <b className="text-fg">{devices.length}</b> telas com coordenada · {mapData.data?.locations?.length || 0} pontos · {missing.length} sem localização
            </span>
            <span className="flex items-center gap-1.5">
              <Gauge size={13} className="text-brand2" /> precisão média exibida no painel lateral
            </span>
          </div>
        </Card>

        {/* painel lateral */}
        <div className="space-y-4">
          {selected ? (
            <DevicePanel d={selected} extra={state[selected.id]} onEdit={() => setEdit(selected)} onClose={() => setSel(null)} isAgency={isAgency} />
          ) : (
            <Card className="overflow-hidden">
              <Head icon={Tv} title="Detalhes da tela" sub="clique em um pino do mapa ou na lista abaixo" />
              <Empty icon={MapPin} title="nenhuma tela selecionada" hint="selecione um ponto no mapa para ver status, telemetria, precisão do GPS e comandos remotos." />
            </Card>
          )}

          <Card className="overflow-hidden">
            <Head icon={Layers} title="Telas da rede" sub="ordenadas por empresa e ponto" right={<Badge tone="mute">{devices.length}</Badge>} />
            <div className="max-h-[280px] divide-y divide-line overflow-y-auto">
              {devices.length === 0 && <Empty icon={Tv} title="nenhuma tela" hint="cadastre aparelhos para vê-los aqui." />}
              {devices.map((d) => {
                const st = statusStyle(d.online, d.status !== 'pendente');
                return (
                  <button
                    key={d.id}
                    onClick={() => setSel(d.id)}
                    className={cx('flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/[0.035]', sel === d.id && 'bg-brand/10')}
                  >
                    <Dot color={d.lat == null ? '#fbbf24' : st.dot} live={d.online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{d.name}</span>
                      <span className="block truncate text-[11px] text-mute">
                        {isAgency && d.client_name ? d.client_name + ' · ' : ''}
                        {d.location_name || (d.lat == null ? 'sem ponto/posição' : 'sem ponto')}
                      </span>
                    </span>
                    {d.lat == null ? <Badge tone="warn">sem geo</Badge> : <span className="shrink-0 font-mono text-[10px] text-mute">{d.lat.toFixed(2)},{d.lng.toFixed(2)}</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          {missing.length > 0 && (
            <Card className="overflow-hidden border-warn/30">
              <Head icon={AlertTriangle} title="Sem localização" sub="defina o ponto ou peça o GPS do aparelho" />
              <div className="divide-y divide-line">
                {missing.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold">{d.name}</p>
                      <p className="truncate text-[11px] text-mute">{d.location_name || 'nenhum ponto vinculado'}</p>
                    </div>
                    <Btn size="xs" icon={Crosshair} onClick={() => locate(d)}>GPS agora</Btn>
                    <Btn size="xs" icon={Pencil} onClick={() => setEdit(d)}>definir</Btn>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <PositionModal device={edit} onClose={() => setEdit(null)} onSaved={() => (mapData.reload(), setEdit(null))} />
    </div>
  );

  async function locate(d) {
    try {
      const r = await api(`/devices/${d.id}/action`, { method: 'POST', body: { action: 'locate' } });
      toast(r.delivered_now ? 'pedido de posição enviado — aguarde alguns segundos' : 'aparelho offline: o pedido fica na fila', r.delivered_now ? 'ok' : 'warn');
      setTimeout(() => mapData.reload(), 6000);
    } catch (e) {
      toast(e.message, 'err');
    }
  }
}

/* --------------------------- Leaflet --------------------------- */

function MapView({ devices, locations, mode, sel, onPick, isAgency }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '© OpenStreetMap · © CARTO',
    }).addTo(m);
    m.on('popupclose', () => onPick(null));
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    setTimeout(() => m.invalidateSize(), 60);
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const grp = layer.current;
    grp.clearLayers();
    const pts = [];

    if (mode === 'pontos') {
      for (const l of locations) {
        const coord = [l.lat ?? devices.find((d) => d.location_id === l.id)?.lat, l.lng ?? devices.find((d) => d.location_id === l.id)?.lng];
        if (!Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) continue;
        pts.push(coord);
        const devs = devices.filter((d) => d.location_id === l.id);
        const on = devs.filter((d) => d.online).length;
        const color = !devs.length ? '#fbbf24' : on === devs.length ? '#34d399' : on ? '#60a5fa' : '#f87171';
        L.circleMarker(coord, { radius: 12 + Math.min(14, devs.length * 3), color, weight: 2, fillColor: color, fillOpacity: 0.25 })
          .addTo(grp)
          .bindTooltip(
            `<b>${esc(l.name)}</b><br/>${devs.length} tela(s) · ${on} no ar<br/>${esc(l.address || '')}<br/>${esc([l.city, l.state].filter(Boolean).join('/'))}`,
            TOOLTIP
          )
          .on('click', () => devs[0] && onPick(devs[0].id));
      }
    } else {
      for (const d of devices) {
        const color = d.status === 'pendente' ? COLOR.pendente : d.online ? COLOR.online : COLOR.offline;
        pts.push([d.lat, d.lng]);
        const Icon = ICONS[d.type] || Tv;
        const short = { tv: 'TV', tablet: 'TB', led: 'LED', monitor: 'MO' }[d.type] || 'TV';
        const mk = L.marker([d.lat, d.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="pin" style="background:${color};${sel === d.id ? 'outline:3px solid rgba(124,92,255,.55);outline-offset:2px;' : ''}"><span>${short}</span></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 28],
          }),
        })
          .addTo(grp)
          .bindTooltip(
            `<b>${esc(d.name)}</b>${isAgency ? '<br/>' + esc(d.client_name || '') : ''}<br/>${esc(d.location_name || 'sem ponto')}<br/><span style="color:${color}">●</span> ${d.online ? 'no ar' : d.status === 'pendente' ? 'aguardando pareamento' : 'sem sinal'}`,
            TOOLTIP
          )
          .on('click', () => onPick(d.id));
        if (d.online) {
          L.circleMarker([d.lat, d.lng], { radius: 17, color, weight: 1.2, fillColor: color, fillOpacity: 0.1 }).addTo(grp);
        }
      }
    }

    if (pts.length) {
      const b = L.latLngBounds(pts);
      m.fitBounds(b.pad(0.35), { maxZoom: 15, animate: true });
    } else {
      m.setView([-6.4, -42.9], 6);
    }
  }, [devices, locations, mode, sel, isAgency]);

  useEffect(() => {
    if (sel == null || !map.current) return;
    const d = devices.find((x) => x.id === sel);
    if (!d) return;
    map.current.flyTo([d.lat, d.lng], Math.max(map.current.getZoom(), 14), { duration: 0.7 });
  }, [sel]);

  return <div ref={el} className="map-dark relative h-[min(72vh,720px)] w-full" />;
}

const TOOLTIP = { direction: 'top', offset: [0, -22], opacity: 1, className: 'dark-tip' };
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --------------------------- painel de detalhes --------------------------- */

function DevicePanel({ d, extra, onEdit, onClose, isAgency }) {
  const st = statusStyle(d.online, d.status !== 'pendente');
  const Icon = ICONS[d.type] || Tv;
  const [busy, setBusy] = useState('');
  const live = useLive();
  const shotUrl = live.screenshots[d.id] || (extra?.screenshot?.filename ? `/uploads/shots/${extra.screenshot.filename}` : null);

  const cmd = async (action) => {
    setBusy(action);
    try {
      const r = await api(`/devices/${d.id}/action`, { method: 'POST', body: { action } });
      if (action === 'screenshot') toast(r.delivered_now ? 'captura solicitada' : 'tela offline — captura na fila', r.delivered_now ? 'ok' : 'warn');
      else toast(r.delivered_now ? 'comando entregue ao aparelho' : 'comando na fila (tela sem sinal)', r.delivered_now ? 'ok' : 'warn');

    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  return (
    <Card className="overflow-hidden">
      <Head
        icon={Icon}
        title={d.name}
        sub={`${isAgency ? (d.client_name || '') + ' · ' : ''}${d.location_name || 'sem ponto vinculado'}`}
        right={<Btn size="xs" variant="ghost" onClick={onClose} icon={MapPin}>limpar</Btn>}
      />
      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={d.online ? 'ok' : 'err'}>{st.label}</Badge>
          <Badge tone="mute">{DEVICE_TYPES[d.type]?.short} · {d.orientation === 'v' ? 'vertical' : 'horizontal'}</Badge>
          {extra?.mode === 'paused' && <Badge tone="warn">pausada</Badge>}
          {extra?.mode === 'takeover' && <Badge tone="brand">destaque</Badge>}
          {d.battery != null && <Badge tone={d.battery < 20 ? 'err' : 'mute'}>🔋 {d.battery}%{d.charging ? ' ⚡' : ''}</Badge>}
        </div>

        {shotUrl && (
          <div className="overflow-hidden rounded-xl border border-line">
            <SmartImg src={shotUrl} className="aspect-video w-full object-cover" />
            <p className="bg-ink2/70 px-2.5 py-1 text-[10.5px] text-mute">última captura da tela</p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 text-[12px]">
          <Info k="endereço" v={extra?.location ? `${extra.location}` : d.location_name || '—'} />
          <Info k="cidade" v={extra?.city || '—'} />
          <Info k="visto" v={d.last_seen ? fmt.ago(d.last_seen) : 'nunca'} />
          <Info k="playlist" v={extra?.playlist?.name || 'nenhuma'} />
        </dl>

        <div className="rounded-xl border border-line bg-ink2/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">
              <Navigation size={12} className="text-brand2" /> posição reportada
            </span>
            {d.geo_source && <Badge tone="cyan">{d.geo_source}</Badge>}
          </div>
          {d.lat == null ? (
            <p className="text-[12px] text-warn">nenhuma coordenada recebida deste aparelho</p>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[12.5px] text-fg">{d.lat.toFixed(6)}, {d.lng.toFixed(6)}</p>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-mute">
                <span>precisão {d.accuracy ? Math.round(d.accuracy) + ' m' : '—'}</span>
                <span>{d.speed != null ? (d.speed * 3.6).toFixed(0) + ' km/h' : 'parado'}</span>
                <span>{fmt.ago(d.geo_at)}</span>
              </div>
              {d.accuracy != null && <Meter value={100 - Math.min(100, d.accuracy)} tone={d.accuracy < 30 ? 'ok' : 'warn'} />}
              <p className="text-[11px] leading-snug text-mute/80">
                {d.accuracy != null && d.accuracy > 100 ? 'precisão baixa (rede/Wi-Fi, não GPS) — para tablets em veículo, confirme a permissão de localização no navegador.' : 'sinal de GPS bom.'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Btn size="sm" icon={Crosshair} loading={busy === 'locate'} onClick={() => cmd('locate')}>GPS agora</Btn>
          <Btn size="sm" icon={Camera} loading={busy === 'screenshot'} onClick={() => cmd('screenshot')}>capturar tela</Btn>
          {d.mode === 'paused' ? (
            <Btn size="sm" icon={Play} loading={busy === 'resume'} onClick={() => cmd('resume')}>retomar</Btn>
          ) : (
            <Btn size="sm" icon={Pause} loading={busy === 'pause'} onClick={() => cmd('pause')}>pausar</Btn>
          )}
          <Btn size="sm" icon={Radio} loading={busy === 'reload'} onClick={() => cmd('reload')}>recarregar</Btn>
          <Btn size="sm" icon={Pencil} onClick={onEdit}>posição manual</Btn>
          <Link to={`/telas/${d.id}`}>
            <Btn size="sm" variant="primary" className="w-full">abrir tela</Btn>
          </Link>
        </div>
      </div>
    </Card>
  );
}

const Info = ({ k, v }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-bold uppercase tracking-wider text-mute/80">{k}</dt>
    <dd className="truncate text-[12.5px] font-medium text-fg/90" title={v}>{v}</dd>
  </div>
);

function PositionModal({ device, onClose, onSaved }) {
  const [form, setForm] = useState({ lat: '', lng: '', name: '', address: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (device) setForm({ lat: device.lat ?? '', lng: device.lng ?? '', name: device.location_name || '', address: '' });
  }, [device]);

  if (!device) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/devices/${device.id}`, { method: 'PATCH', body: { lat: Number(form.lat), lng: Number(form.lng) } });
      toast('posição da tela atualizada', 'ok');
      onSaved();
    } catch (e) {
      setMsg(e.message);
    } finally { setBusy(false); }
  };

  const geocode = async () => {
    const q = (form.name || form.address || '').trim();
    if (!q) return setMsg('digite o nome da rua/bairro/cidade para buscar');
    setBusy(true);
    setMsg('buscando endereço…');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j[0]) return setMsg('endereço não encontrado — tente rua + bairro + cidade');
      setForm((f) => ({ ...f, lat: Number(j[0].lat).toFixed(6), lng: Number(j[0].lon).toFixed(6), address: j[0].display_name }));
      setMsg('endereço localizado ✔');
    } catch (e) {
      setMsg('busca indisponível (sem internet ou bloqueio do navegador) — use o GPS ou digite as coordenadas');
    } finally { setBusy(false); }
  };

  const mine = () => {
    if (!navigator.geolocation) return setMsg('este navegador não tem geolocalização');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }));
        setMsg(`posição deste computador: precisão ${Math.round(p.coords.accuracy)} m`);
        setBusy(false);
      },
      (e) => (setMsg('não foi possível obter sua posição: ' + e.message), setBusy(false)),
      { enableHighAccuracy: true }
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Posição de ${device.name}`}
      sub="defina a coordenada exibida no mapa da rede"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>cancelar</Btn>
          <Btn variant="primary" icon={Save} loading={busy} onClick={save} disabled={form.lat === '' || form.lng === ''}>salvar posição</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="buscar endereço" hint="rua, número, bairro e cidade">
          <div className="flex gap-2">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Av. Coelho de Resende, 300, Centro, Teresina" />
            <Btn icon={Search} onClick={geocode}>buscar</Btn>
          </div>
        </Field>
        {form.address && <p className="rounded-lg border border-line bg-ink2/60 px-3 py-2 text-[11.5px] text-mute">{form.address}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="latitude"><Input value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} inputMode="decimal" /></Field>
          <Field label="longitude"><Input value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} inputMode="decimal" /></Field>
        </div>
        <Btn size="sm" icon={Crosshair} onClick={mine} className="w-full">usar minha posição atual (GPS do navegador)</Btn>
        {msg && <p className="text-[11.5px] text-brand2">{msg}</p>}
        <p className="text-[11px] leading-snug text-mute">
          Dica: em tablets com GPS a posição chega sozinha a cada movimento. Para TVs, use o endereço do ponto de exibição — a tela herda a coordenada do ponto vinculado.
        </p>
      </div>
    </Modal>
  );
}
