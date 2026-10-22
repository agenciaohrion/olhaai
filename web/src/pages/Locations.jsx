import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapPin, Plus, Search, Pencil, Trash2, Users, Tv, Navigation, Check, Crosshair, Building2, Store, Dumbbell, Stethoscope, Car, TrainFront } from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, statusStyle } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Dot, Btn, IconBtn, Input, Select, Textarea, Field, Modal, Empty, Loading, cx, toast, Th, Td, useAsk, SmartImg } from '../ui.jsx';

const KINDS = {
  loja: { label: 'Loja / ponto de venda', icon: Store },
  clinica: { label: 'Clínica / consultório', icon: Stethoscope },
  academia: { label: 'Academia / clube', icon: Dumbbell },
  corporativo: { label: 'Escritório / indústria', icon: Building2 },
  publico: { label: 'Órgão / espaço público', icon: TrainFront },
  movel: { label: 'Em movimento (veículo)', icon: Car },
};

export default function Locations() {
  const { isAgency, q, focusId, clients, body } = useAuth();
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useApi(q('/locations'));
  const [ask, askNode] = useAsk();

  const rows = useMemo(() => (data || []).filter((l) => !term || (l.name + (l.address || '') + (l.city || '')).toLowerCase().includes(term.toLowerCase())), [data, term]);
  const noGeo = (data || []).filter((l) => l.lat == null);

  const save = async (payload, id) => {
    if (id) await api(`/locations/${id}`, { method: 'PATCH', body: payload });
    else await api('/locations', { method: 'POST', body: body(payload) });
    toast(id ? 'ponto atualizado' : 'ponto criado', 'ok');
    reload();
  };

  const remove = async (l) => {
    if (!(await ask({ title: `Excluir ${l.name}?`, body: 'As telas vinculadas perdem o ponto (não são apagadas) e saem do mapa por localização de ponto.', danger: true, okLabel: 'excluir ponto' }))) return;
    await api(`/locations/${l.id}`, { method: 'DELETE' });
    toast('ponto removido', 'ok');
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head
          icon={MapPin}
          title="Pontos de exibição"
          sub="endereços onde as telas vivem: usados no mapa, nas vinculações de playlist e no cálculo de alcance"
          right={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setShowNew(true)}>novo ponto</Btn>}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar por nome, endereço ou cidade" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
          </div>
          {noGeo.length > 0 && <Badge tone="warn">{noGeo.length} sem coordenada</Badge>}
        </div>

        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={MapPin} title="nenhum ponto cadastrado" hint="Cadastre os endereços para organizar as telas, vincular programações por local e alimentar o mapa da rede." action={<Btn size="sm" variant="primary" className="mt-3" icon={Plus} onClick={() => setShowNew(true)}>criar primeiro ponto</Btn>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse">
              <thead className="bg-white/[0.02]">
                <tr>
                  <Th>ponto</Th>
                  <Th>endereço</Th>
                  <Th>tipo</Th>
                  <Th className="text-right">telas</Th>
                  <Th className="text-right">público/dia</Th>
                  <Th>coordenada</Th>
                  <Th className="text-right">ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => {
                  const K = KINDS[l.kind]?.icon || MapPin;
                  return (
                    <tr key={l.id} className="group transition hover:bg-white/[0.025]">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.03] text-brand2"><K size={14} /></span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold group-hover:text-brand">{l.name}</p>
                            {isAgency && <p className="truncate text-[10.5px] text-mute">{clients.find((c) => c.id === l.client_id)?.brand || 'empresa #' + l.client_id}</p>}
                          </div>
                        </div>
                      </Td>
                      <Td className="max-w-[260px] text-mute">
                        <span className="block truncate">{l.address || '—'}</span>
                        <span className="block truncate text-[10.5px] text-mute/80">{[l.district, l.city, l.state].filter(Boolean).join(' · ')}</span>
                      </Td>
                      <Td><Badge tone="mute">{KINDS[l.kind]?.label || l.kind}</Badge></Td>
                      <Td className="text-right">
                        {l.device_count ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Dot color={l.online ? '#34d399' : '#f87171'} live={!!l.online} />
                            {l.online}/{l.device_count}
                          </span>
                        ) : (
                          <span className="text-mute">nenhuma</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{l.footfall ? fmt.n(l.footfall) : <span className="text-mute">—</span>}</Td>
                      <Td>
                        {l.lat != null ? (
                          <Link to={`/mapa`} className="font-mono text-[11px] text-brand2 hover:underline">{l.lat.toFixed(4)}, {l.lng.toFixed(4)}</Link>
                        ) : (
                          <span className="text-[11px] text-warn">sem posição</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Btn size="xs" icon={Tv} onClick={() => (window.location.href = `/telas?client_id=${l.client_id}`)}>telas</Btn>
                          <IconBtn icon={Pencil} title="editar" onClick={() => setEditing(l)} />
                          <IconBtn icon={Trash2} title="excluir" onClick={() => remove(l)} className="hover:border-err/50 hover:text-err" />
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

      <div className="grid gap-3 lg:grid-cols-2">
        {(data || []).slice(0, 4).map((l) => (
          <Card key={l.id} className="overflow-hidden">
            <Head icon={Tv} title={`Telas em ${l.name}`} sub={`${l.device_count} aparelho(s) · ${l.online} respondendo`} right={<Badge tone="mute">{l.city || '—'}</Badge>} />
            <div className="divide-y divide-line">
              {(l.devices || []).map((d) => {
                const st = statusStyle(d.status === 'online');
                return (
                  <Link key={d.id} to={`/telas/${d.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5 transition hover:bg-white/[0.03]">
                    <Dot color={st.dot} live={d.status === 'online'} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{d.name}</span>
                    <Badge tone="mute">{DEVICE_TYPES[d.type]?.short} {d.orientation === 'v' ? 'V' : 'H'}</Badge>
                    <span className="shrink-0 text-[10.5px] text-mute">{fmt.ago(d.last_seen)}</span>
                  </Link>
                );
              })}
              {!(l.devices || []).length && <Empty icon={Tv} title="nenhuma tela neste ponto" hint="Cadastre um aparelho e selecione este ponto." />}
            </div>
          </Card>
        ))}
      </div>

      <LocationModal open={showNew || !!editing} onClose={() => (setShowNew(false), setEditing(null))} row={editing} onSave={save} />
      {askNode}
    </div>
  );
}

function LocationModal({ open, onClose, row, onSave }) {
  const { isAgency, clients, focusId } = useAuth();
  const blank = { name: '', address: '', district: '', city: '', state: '', kind: 'loja', footfall: 0, notes: '', lat: '', lng: '', client_id: focusId || '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setErr('');
      setForm(row ? { ...blank, ...row, lat: row.lat ?? '', lng: row.lng ?? '' } : { ...blank, client_id: focusId || clients?.[0]?.id || '' });
    }
  }, [open, row?.id]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const geocode = async () => {
    const q = [form.address, form.district, form.city, form.state].filter(Boolean).join(', ') || form.name;
    if (!q) return setErr('preencha endereço (ou nome do ponto) para buscar');
    setGeoBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
      const j = await r.json();
      if (!j[0]) return setErr('não encontramos esse endereço — ajuste rua/bairro/cidade ou marque no mapa');
      setForm((f) => ({ ...f, lat: Number(j[0].lat).toFixed(6), lng: Number(j[0].lon).toFixed(6) }));
      setErr('');
      toast('endereço localizado ✔', 'ok', 1800);
    } catch (e) {
      setErr('busca de endereço indisponível aqui — use o mapa abaixo ou digite as coordenadas');
    } finally { setGeoBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...form, lat: form.lat === '' ? null : Number(form.lat), lng: form.lng === '' ? null : Number(form.lng), footfall: Number(form.footfall) || 0 }, row?.id);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={row ? `Editar ${row.name}` : 'Novo ponto de exibição'}
      sub="defina o endereço e a posição — é isso que aparece no mapa da rede e no cálculo de alcance"
      footer={<><Btn variant="ghost" onClick={onClose}>cancelar</Btn><Btn variant="primary" loading={busy} onClick={submit}>salvar ponto</Btn></>}
    >
      <form onSubmit={submit} className="grid gap-3 lg:grid-cols-2">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err lg:col-span-2">{err}</p>}
        <div className="space-y-3">
          {isAgency && !row && (
            <Field label="empresa">
              <Select value={form.client_id || ''} onChange={set('client_id')} required>
                <option value="">selecione…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="nome do ponto"><Input autoFocus value={form.name} onChange={set('name')} placeholder="Loja Centro · Recepção · Hall" required /></Field>
          <Field label="endereço" hint="rua e número">
            <div className="flex gap-2">
              <Input value={form.address} onChange={set('address')} placeholder="Av. Coelho de Resende, 1208" />
              <Btn icon={Crosshair} loading={geoBusy} onClick={geocode} title="buscar coordenadas no OpenStreetMap">GPS</Btn>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="bairro"><Input value={form.district || ''} onChange={set('district')} /></Field>
            <Field label="cidade"><Input value={form.city || ''} onChange={set('city')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="UF"><Input value={form.state || ''} onChange={set('state')} maxLength={2} /></Field>
            <Field label="tipo">
              <Select value={form.kind} onChange={set('kind')}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="pessoas/dia" hint="para impressões"><Input type="number" min="0" value={form.footfall ?? 0} onChange={set('footfall')} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="latitude"><Input value={form.lat} onChange={set('lat')} inputMode="decimal" placeholder="-5.0959" /></Field>
            <Field label="longitude"><Input value={form.lng} onChange={set('lng')} inputMode="decimal" placeholder="-42.8055" /></Field>
          </div>
          <Field label="observações"><Textarea rows={2} value={form.notes || ''} onChange={set('notes')} placeholder="ex.: TV fica atrás do balcão; horário 8h–19h" /></Field>
        </div>
        <div className="space-y-2">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-mute">marque no mapa (clique para posicionar)</p>
          <MapPicker lat={form.lat} lng={form.lng} onPick={(la, ln) => setForm((f) => ({ ...f, lat: la, lng: ln }))} />
          <p className="text-[11px] leading-relaxed text-mute">
            Ao vincular uma playlist a este ponto, todas as telas daqui recebem o conteúdo — sem precisar configurar uma a uma.
          </p>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function MapPicker({ lat, lng, onPick }) {
  const el = useRef(null);
  const map = useRef(null);
  const mark = useRef(null);
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: false }).setView([lat || -5.09, lng || -42.8], lat ? 15 : 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(m);
    mark.current = L.marker([lat || -5.09, lng || -42.8], { draggable: true }).addTo(m);
    mark.current.on('dragend', () => {
      const p = mark.current.getLatLng();
      onPick(p.lat.toFixed(6), p.lng.toFixed(6));
    });
    m.on('click', (e) => {
      mark.current.setLatLng(e.latlng);
      onPick(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 80);
    return () => m.remove();
  }, []);
  useEffect(() => {
    if (!map.current || !Number.isFinite(Number(lat))) return;
    map.current.setView([Number(lat), Number(lng)], Math.max(12, map.current.getZoom()));
    mark.current?.setLatLng([Number(lat), Number(lng)]);
  }, [lat, lng]);
  return <div ref={el} className="map-dark h-[300px] w-full overflow-hidden rounded-xl border border-line lg:h-full lg:min-h-[420px]" />;
}
