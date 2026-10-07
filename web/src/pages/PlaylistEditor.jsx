import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, PlayCircle, Pause, Radio, Trash2, Copy, GripVertical, Plus, Clock3, Tv, MapPin, Building2,
  Eye, X, CalendarClock, Zap, Monitor, ShieldAlert, RotateCcw, ChevronUp, ChevronDown, Images, Search, Maximize2, SkipForward, SkipBack,
} from 'lucide-react';
import { api, useApi, fmt, MEDIA_KINDS, DEVICE_TYPES, DAY_LABELS, asset } from '../api.js';
import { useAuth } from '../auth.jsx';
import Slide from '../Slide.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Textarea, Field, Modal, Empty, Loading, cx, toast, Meter, SmartImg, Toggle } from '../ui.jsx';

const MIN_SLOT = { video: 0, image: 4000, text: 5000, html: 5000, url: 10000, youtube: 15000, clock: 5000, weather: 5000, news: 8000 };

export default function PlaylistEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isAgency, focusId, q } = useAuth();
  const lib = useApi(q(isAgency && !focusId ? '/media?all=1' : '/media'));
  const dev = useApi(q('/devices'));
  const loc = useApi(q('/locations'));
  const [pl, setPl] = useState(null);
  const [items, setItems] = useState([]);
  const [windows, setWindows] = useState([]);
  const [reach, setReach] = useState({ to_client: false, location_ids: [], device_ids: [] });
  const [meta, setMeta] = useState({ name: '', orientation: 'h', notes: '', bg: '#05070f' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [full, setFull] = useState(false);
  const [libTerm, setLibTerm] = useState('');
  const [onAir, setOnAir] = useState([]);

  const load = useCallback(async () => {
    const d = await api(`/playlists/${id}`);
    setPl(d);
    setItems(d.items.map((i) => ({ media_id: i.media_id, duration_ms: i.duration_ms ?? null, kind: i.kind, title: i.title, thumb: i.thumb, orientation: i.orientation, media_duration: i.media_duration })));
    setWindows(d.windows.map((w) => ({ id: w.id, name: w.name, days: String(w.days).split(',').map(Number), start_time: w.start_time, end_time: w.end_time, priority: w.priority, enabled: !!w.enabled })));
    setReach({
      to_client: d.assignments.some((a) => a.scope === 'client'),
      location_ids: d.assignments.filter((a) => a.scope === 'location').map((a) => a.scope_id),
      device_ids: (d.devices || []).filter((x) => x).map((x) => x.id),
    });
    setMeta({ name: d.name, orientation: d.orientation, notes: d.notes || '', bg: d.bg || '#05070f' });
    setDirty(false);
    api(`/playlists/${id}/onair`).then(setOnAir).catch(() => {});
  }, [id]);

  useEffect(() => {
    load().catch((e) => {
      toast(e.message, 'err');
      nav('/programacao');
    });
  }, [load]);

  useEffect(() => {
    if (params.get('publish') === '1' && pl) {
      setParams({}, { replace: true });
      publish();
    }
  }, [params, pl]);

  const library = useMemo(() => {
    let out = lib.data || [];
    if (libTerm) out = out.filter((m) => m.title.toLowerCase().includes(libTerm.toLowerCase()));
    return out;
  }, [lib.data, libTerm]);

  const byId = useMemo(() => Object.fromEntries((lib.data || []).map((m) => [m.id, m])), [lib.data]);
  const previewItems = useMemo(
    () =>
      items.map((i) => {
        const m = byId[i.media_id] || { id: i.media_id, kind: i.kind, title: i.title, thumb: i.thumb };
        return { ...i, media: m, src: m?.src ? asset(m.src) : null, slot: i.duration_ms || m?.duration_ms || MIN_SLOT[m?.kind] || 9000 };
      }),
    [items, byId]
  );
  const total = previewItems.reduce((a, i) => a + (i.slot || 0), 0);
  const cur = previewItems[Math.min(sel, Math.max(0, previewItems.length - 1))];

  // relógio da prévia
  useEffect(() => {
    if (!playing || !previewItems.length) return;
    const ms = Math.max(2500, cur?.slot || 8000);
    const t = setTimeout(() => setSel((s) => (s + 1) % previewItems.length), ms);
    return () => clearTimeout(t);
  }, [sel, playing, previewItems.length, cur?.slot]);

  const set = (fn) => {
    fn();
    setDirty(true);
  };

  const addItem = (m) => set(() => setItems((it) => [...it, { media_id: m.id, duration_ms: m.kind === 'video' ? null : MIN_SLOT[m.kind] || 9000, kind: m.kind, title: m.title, thumb: m.thumb, orientation: m.orientation, media_duration: m.duration_ms }]));
  const removeItem = (i) => set(() => (setItems((it) => it.filter((_, k) => k !== i)), setSel((s) => Math.max(0, Math.min(s, items.length - 2)))));
  const move = (from, to) => {
    if (to < 0 || to >= items.length) return;
    set(() =>
      setItems((it) => {
        const n = [...it];
        const [x] = n.splice(from, 1);
        n.splice(to, 0, x);
        return n;
      })
    );
    setSel(to);
  };

  const saveItems = async () => {
    setBusy('items');
    try {
      await api(`/playlists/${id}/items`, { method: 'PUT', body: { items: items.map(({ media_id, duration_ms }) => ({ media_id, duration_ms })) } });
      await api(`/playlists/${id}`, { method: 'PATCH', body: meta });
      setDirty(false);
      toast('grade salva', 'ok', 1800);
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  const saveReach = async () => {
    setBusy('reach');
    try {
      await api(`/playlists/${id}/assignments`, {
        method: 'PUT',
        body: { to_client: reach.to_client, location_ids: reach.location_ids, device_ids: reach.device_ids },
      });
      toast('alcance atualizado', 'ok', 1800);
      dev.reload();
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  const saveWindows = async () => {
    setBusy('win');
    try {
      await api(`/playlists/${id}/windows`, { method: 'PUT', body: { windows } });
      toast('janelas de horário salvas', 'ok', 1800);
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  async function publish() {
    setBusy('pub');
    try {
      if (dirty) await api(`/playlists/${id}/items`, { method: 'PUT', body: { items: items.map(({ media_id, duration_ms }) => ({ media_id, duration_ms })) } });
      const r = await api(`/playlists/${id}/publish`, { method: 'POST' });
      toast(`✅ publicada (v${r.version}) · levada a ${r.pushed_to} tela(s)`, 'ok', 5000);
      setDirty(false);
      await load();
    } catch (e) {
      toast(e.message, 'err', 6000);
    } finally { setBusy(''); }
  }

  if (!pl) return <Loading label="abrindo a programação…" />;

  return (
    <div className="space-y-3">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/programacao">
          <IconBtn icon={ArrowLeft} title="voltar" />
        </Link>
        <input
          value={meta.name}
          onChange={(e) => set(() => setMeta((m) => ({ ...m, name: e.target.value })))}
          className="min-w-[180px] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-[var(--font-display)] text-[19px] font-extrabold tracking-tight outline-none transition hover:border-line focus:border-brand"
        />
        {pl.status === 'publicada' ? <Badge tone="ok">no ar · v{pl.version}</Badge> : <Badge tone="warn">rascunho</Badge>}
        {dirty && <Badge tone="brand">alterações não salvas</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Btn size="sm" icon={Maximize2} onClick={() => setFull(true)}>prévia</Btn>
          <Btn size="sm" icon={Save} loading={busy === 'items'} onClick={saveItems} variant={dirty ? 'primary' : 'line'}>
            salvar grade
          </Btn>
          <Btn size="sm" icon={Zap} variant="primary" loading={busy === 'pub'} onClick={publish}>
            publicar nas telas
          </Btn>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[268px_minmax(0,1fr)_336px]">
        {/* biblioteca */}
        <Card className="flex max-h-[calc(100vh-140px)] flex-col overflow-hidden xl:sticky xl:top-[68px]">
          <Head icon={Images} title="Biblioteca" sub="clique para adicionar ao fim da fila" />
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={libTerm} onChange={(e) => setLibTerm(e.target.value)} placeholder="buscar peça" className="h-8 py-1 pl-8 text-[12px]" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {library.length === 0 ? (
              <Empty icon={Images} title="sem peças" hint={<Link to="/conteudo" className="text-brand2">enviar conteúdo</Link>} />
            ) : (
              <div className="space-y-1.5">
                {library.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => addItem(m)}
                    className="group flex w-full items-center gap-2 rounded-xl border border-line bg-ink2/50 p-1.5 text-left transition hover:border-brand/50 hover:bg-brand/10"
                  >
                    <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md bg-black">
                      <SmartImg src={asset(m.thumb)} className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold">{m.title}</span>
                      <span className="block truncate text-[10px] text-mute">{MEDIA_KINDS[m.kind]?.label}{m.orientation === 'v' ? ' · vertical' : ''}</span>
                    </span>
                    <Plus size={14} className="shrink-0 text-mute opacity-0 transition group-hover:opacity-100 group-hover:text-brand" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* trilha */}
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <Head
              icon={Radio}
              title={`Trilha · ${items.length} peça(s)`}
              sub={total ? `ciclo completo de ${fmt.ms(total)} · arraste para reordenar` : 'adicione peças da biblioteca ao lado'}
              right={<Badge tone="mute">{pl.orientation === 'v' ? 'telas verticais' : 'telas horizontais'}</Badge>}
            />
            {items.length === 0 ? (
              <Empty icon={Plus} title="grade vazia" hint="Escolha as peças na biblioteca ao lado. A ordem aqui é a ordem de exibição na tela." />
            ) : (
              <ol className="divide-y divide-line">
                {previewItems.map((it, i) => (
                  <li
                    key={i}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      move(Number(e.dataTransfer.getData('text/plain')), i);
                    }}
                    onClick={() => setSel(i)}
                    className={cx('group flex cursor-pointer items-center gap-2.5 px-2.5 py-2 transition', sel === i ? 'bg-brand/10' : 'hover:bg-white/[0.03]')}
                  >
                    <span className="flex flex-col items-center gap-0.5 text-mute">
                      <GripVertical size={13} className="cursor-grab opacity-50 group-hover:opacity-100" />
                      <span className="text-[10px] font-bold text-fg/60">{i + 1}</span>
                    </span>
                    <span className="relative h-11 w-[74px] shrink-0 overflow-hidden rounded-md border border-line bg-black">
                      <SmartImg src={asset(it.media?.filename ? `/uploads/${it.media.filename}` : it.thumb)} className="h-full w-full object-cover" />
                      {it.orientation === 'v' && <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[8px] font-bold uppercase text-white/80">V</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{it.media?.title || 'peça removida'}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-mute">
                        <span style={{ color: MEDIA_KINDS[it.kind]?.color }}>●</span> {MEDIA_KINDS[it.kind]?.label}
                        {it.media_duration ? <span>· arquivo {fmt.ms(it.media_duration)}</span> : null}
                      </span>
                    </span>
                    <label className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Clock3 size={12} className="text-mute" />
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={it.duration_ms ? Math.round(it.duration_ms / 1000) : ''}
                        placeholder={it.kind === 'video' ? 'auto' : String(Math.round((MIN_SLOT[it.kind] || 9000) / 1000))}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 1000;
                          set(() => setItems((arr) => arr.map((x, k) => (k === i ? { ...x, duration_ms: v } : x))));
                        }}
                        className="w-[54px] rounded-md border border-line bg-ink px-1.5 py-1 text-right text-[11.5px] outline-none focus:border-brand"
                      />
                      <span className="text-[10px] text-mute">s</span>
                    </label>
                    <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
                      <IconBtn icon={ChevronUp} title="subir" onClick={(e) => (e.stopPropagation(), move(i, i - 1))} className="h-7 w-7" />
                      <IconBtn icon={ChevronDown} title="descer" onClick={(e) => (e.stopPropagation(), move(i, i + 1))} className="h-7 w-7" />
                      <IconBtn icon={Trash2} title="remover da grade" onClick={(e) => (e.stopPropagation(), removeItem(i))} className="h-7 w-7 hover:border-err/50 hover:text-err" />
                    </span>
                    <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-mute">{total ? Math.round((it.slot / total) * 100) : 0}%</span>
                  </li>
                ))}
              </ol>
            )}
            {items.length > 0 && (
              <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-[11px] text-mute">
                <span>tempo de ciclo {fmt.ms(total)}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="flex h-full">
                    {previewItems.map((it, i) => (
                      <span key={i} style={{ width: `${total ? (it.slot / total) * 100 : 0}%`, background: MEDIA_KINDS[it.kind]?.color || '#7c5cff' }} className="h-full border-r border-ink" title={it.media?.title} />
                    ))}
                  </div>
                </div>
                <button className="text-brand2 hover:underline" onClick={() => set(() => setItems((it) => it.map((x) => ({ ...x, duration_ms: null }))))}>
                  tempo automático
                </button>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <Head icon={ShieldAlert} title="Quem recebe esta grade agora" sub="resolvido no servidor: aparelho > ponto > empresa" right={<Btn size="xs" icon={RotateCcw} onClick={() => api(`/playlists/${id}/onair`).then(setOnAir)}>reconferir</Btn>} />
            {onAir.length === 0 ? (
              <Empty icon={Tv} title="nenhuma tela vinculada" hint="Marque pontos ou aparelhos no painel “Alcance” ao lado — sem isso a publicação é bloqueada." />
            ) : (
              <div className="divide-y divide-line">
                {onAir.map((x) => (
                  <div key={x.device_id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <Tv size={14} className={x.matches ? 'text-ok' : 'text-warn'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold">{x.name}</p>
                      <p className="truncate text-[11px] text-mute">
                        {x.location || 'sem ponto'} · origem: {x.source === 'device' ? 'vínculo direto' : x.source === 'location' ? 'ponto' : x.source === 'client' ? 'empresa' : x.source === 'fallback' ? 'padrão da empresa' : x.source}
                        {x.windows?.length ? ` · ${x.windows.filter((w) => w.active).length} janela(s) ativa(s)` : ' · o dia todo'}
                      </p>
                    </div>
                    {x.matches ? <Badge tone="ok">esta grade</Badge> : <Badge tone="warn">outra vence: {x.playing || 'nada'}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* coluna direita */}
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <Head icon={Eye} title="Prévia da tela" sub="o mesmo renderizador usado pelo player"
              right={
                <>
                  <IconBtn icon={SkipBack} title="anterior" onClick={() => setSel((s) => (s - 1 + previewItems.length) % Math.max(1, previewItems.length))} />
                  <IconBtn icon={playing ? Pause : PlayCircle} title={playing ? 'pausar prévia' : 'retomar'} onClick={() => setPlaying((p) => !p)} />
                  <IconBtn icon={SkipForward} title="próxima" onClick={() => setSel((s) => (s + 1) % Math.max(1, previewItems.length))} />
                </>
              }
            />
            <div className={cx('relative bg-black', pl.orientation === 'v' ? 'mx-auto aspect-[9/16] w-full max-w-[210px]' : 'aspect-video w-full')}>
              {cur ? <Slide media={cur.media} src={cur.src} ctx={{ client: { name: meta.name } }} preview /> : <div className="grid h-full place-items-center text-[12px] text-mute">sem peças</div>}
            </div>
            {cur && (
              <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-mute">
                  #{sel + 1} · {cur.media?.title}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-brand2">{fmt.ms(cur.slot)}</span>
              </div>
            )}
          </Card>

          <Card className="p-3">
            <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">configuração</p>
            <div className="space-y-2.5">
              <Field label="orientação alvo">
                <Select value={meta.orientation} onChange={(e) => set(() => setMeta((m) => ({ ...m, orientation: e.target.value })))}>
                  <option value="h">horizontal (TV, monitor)</option>
                  <option value="v">vertical (LED, tablet em pé)</option>
                </Select>
              </Field>
              <Field label="cor de fundo" hint="preenche as bordas quando a peça não casa com a tela">
                <div className="flex gap-2">
                  <input type="color" value={meta.bg} onChange={(e) => set(() => setMeta((m) => ({ ...m, bg: e.target.value })))} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-ink2" />
                  <Input value={meta.bg} onChange={(e) => set(() => setMeta((m) => ({ ...m, bg: e.target.value })))} className="font-mono text-[12px]" />
                </div>
              </Field>
              <Field label="observação interna">
                <Textarea rows={2} value={meta.notes} onChange={(e) => set(() => setMeta((m) => ({ ...m, notes: e.target.value })))} placeholder="ex.: trocar criativos às segundas" className="text-[12.5px]" />
              </Field>
            </div>
          </Card>

          <WindowsEditor windows={windows} setWindows={(fn) => set(() => setWindows(fn))} onSave={saveWindows} busy={busy === 'win'} />
          <ReachEditor
            reach={reach}
            setReach={(fn) => set(() => setReach(fn))}
            devices={dev.data || []}
            locations={loc.data || []}
            onSave={saveReach}
            busy={busy === 'reach'}
            isAgency={isAgency}
          />
        </div>
      </div>

      {full && <FullscreenPreview items={previewItems} bg={meta.bg} orientation={pl.orientation} onClose={() => setFull(false)} />}
    </div>
  );
}

/* ------------------------------ janelas de horário ------------------------------ */

function WindowsEditor({ windows, setWindows, onSave, busy }) {
  const add = () => setWindows((w) => [...w, { name: 'Nova janela', days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00', priority: 0, enabled: true }]);
  const upd = (i, patch) => setWindows((w) => w.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <Card className="overflow-hidden">
      <Head icon={CalendarClock} title="Janelas de horário" sub={windows.length ? `${windows.length} janela(s) — fora delas esta grade não entra` : 'sem janela: roda o dia inteiro'}
        right={<><Btn size="xs" icon={Plus} onClick={add}>janela</Btn><Btn size="xs" variant={busy ? 'line' : 'line'} icon={Save} loading={busy} onClick={onSave}>salvar</Btn></>}
      />
      <div className="divide-y divide-line">
        {windows.map((w, i) => (
          <div key={i} className="space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <input value={w.name} onChange={(e) => upd(i, { name: e.target.value })} className="min-w-0 flex-1 rounded-md border border-line bg-ink px-2 py-1 text-[12px] font-semibold outline-none focus:border-brand" />
              <Select value={String(w.priority)} onChange={(e) => upd(i, { priority: Number(e.target.value) })} className="h-7 w-[74px] py-0 text-[11px]">
                {[0, 1, 2, 5, 9].map((p) => (
                  <option key={p} value={p}>P{p}</option>
                ))}
              </Select>
              <button onClick={() => upd(i, { enabled: !w.enabled })} className={cx('rounded-md border px-1.5 py-1 text-[10px] font-bold', w.enabled ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-mute')}>
                {w.enabled ? 'ON' : 'OFF'}
              </button>
              <IconBtn icon={X} title="remover" onClick={() => setWindows((arr) => arr.filter((_, k) => k !== i))} className="h-7 w-7 hover:border-err/50 hover:text-err" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {DAY_LABELS.map((d, k) => (
                <button
                  key={d}
                  onClick={() => upd(i, { days: w.days.includes(k) ? w.days.filter((x) => x !== k) : [...w.days, k].sort() })}
                  className={cx('rounded-md px-1.5 py-1 text-[10.5px] font-bold transition', w.days.includes(k) ? 'bg-brand text-white' : 'bg-white/[0.05] text-mute hover:text-fg')}
                >
                  {d}
                </button>
              ))}
              <input type="time" value={w.start_time} onChange={(e) => upd(i, { start_time: e.target.value })} className="rounded-md border border-line bg-ink px-1.5 py-1 text-[11px] outline-none focus:border-brand" />
              <span className="text-mute">→</span>
              <input type="time" value={w.end_time} onChange={(e) => upd(i, { end_time: e.target.value })} className="rounded-md border border-line bg-ink px-1.5 py-1 text-[11px] outline-none focus:border-brand" />
              <button onClick={() => upd(i, { days: [0, 1, 2, 3, 4, 5, 6] })} className="text-[10.5px] text-brand2 hover:underline">todos os dias</button>
            </div>
          </div>
        ))}
        {!windows.length && (
          <div className="space-y-2 px-3 py-3">
            <p className="text-[11.5px] leading-relaxed text-mute">
              Exemplo: <b className="text-fg">Café da manhã</b> 07:00–11:00, <b className="text-fg">Almoço</b> 11:00–15:00, <b className="text-fg">Fim de tarde</b> 15:00–20:00 — cada tela troca sozinha no horário, sem ninguém mexer.
            </p>
            <Btn size="sm" icon={Plus} onClick={add}>criar primeira janela</Btn>
          </div>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------- alcance --------------------------------- */

function ReachEditor({ reach, setReach, devices, locations, onSave, busy, isAgency }) {
  const [tab, setTab] = useState('locais');
  const toggleIn = (key, v) => setReach((r) => ({ ...r, [key]: r[key].includes(v) ? r[key].filter((x) => x !== v) : [...r[key], v] }));
  const bound = devices.filter((d) => reach.device_ids.includes(d.id) || locations.find((l) => l.id === d.location_id && reach.location_ids.includes(l.id)) || reach.to_client);
  return (
    <Card className="overflow-hidden">
      <Head icon={MapPin} title="Alcance" sub={`${bound.length} tela(s) vão receber esta grade`}
        right={<Btn size="xs" icon={Save} loading={busy} onClick={onSave}>aplicar</Btn>}
      />
      <div className="flex gap-1 border-b border-line px-2 pt-2">
        {[
          { k: 'locais', l: 'pontos', i: MapPin, n: locations.length },
          { k: 'telas', l: 'aparelhos', i: Tv, n: devices.length },
          { k: 'empresa', l: 'tudo', i: Building2, n: 1 },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cx('flex items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition', tab === t.k ? 'border-b-2 border-brand text-fg' : 'text-mute hover:text-fg')}>
            <t.i size={12} /> {t.l} <span className="text-[10px] text-mute">{t.n}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[260px] overflow-y-auto p-2">
        {tab === 'empresa' && (
          <Toggle
            checked={reach.to_client}
            onChange={(v) => setReach((r) => ({ ...r, to_client: v }))}
            label="Toda a empresa"
            hint="todas as telas desta conta usam esta grade como padrão"
          />
        )}
        {tab === 'locais' &&
          (locations.length === 0 ? <Empty icon={MapPin} title="nenhum ponto" hint="cadastre pontos em Pontos de exibição." /> : locations.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]">
              <input type="checkbox" checked={reach.location_ids.includes(l.id)} onChange={() => toggleIn('location_ids', l.id)} className="h-4 w-4 accent-[#7c5cff]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{l.name}</span>
                <span className="block truncate text-[10.5px] text-mute">{l.device_count} tela(s) · {l.city}/{l.state}</span>
              </span>
            </label>
          )))}
        {tab === 'telas' &&
          (devices.length === 0 ? <Empty icon={Tv} title="nenhum aparelho" /> : devices.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]">
              <input type="checkbox" checked={reach.device_ids.includes(d.id)} onChange={() => toggleIn('device_ids', d.id)} className="h-4 w-4 accent-[#7c5cff]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{d.name}</span>
                <span className="block truncate text-[10.5px] text-mute">
                  {isAgency ? (d.client_name || '') + ' · ' : ''}
                  {d.location_name || 'sem ponto'} · {DEVICE_TYPES[d.type]?.short} {d.orientation === 'v' ? 'V' : 'H'}
                </span>
              </span>
              {d.playlist_id && d.playlist_id !== reach.playlist && <span className="shrink-0 text-[10px] text-warn">tem vínculo próprio</span>}
            </label>
          )))}
      </div>
    </Card>
  );
}

/* ------------------------------ prévia em tela cheia ------------------------------ */

function FullscreenPreview({ items, bg, orientation, onClose }) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % items.length);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + items.length) % items.length);
      if (e.key === ' ') setShow((s) => !s);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [items.length]);
  const cur = items[i];
  useEffect(() => {
    if (!show || !items.length) return;
    const t = setTimeout(() => setI((x) => (x + 1) % items.length), Math.max(2000, cur?.slot || 8000));
    return () => clearTimeout(t);
  }, [i, show, items.length]);
  return (
    <div className="fixed inset-0 z-[950] bg-black" style={{ background: bg }}>
      {cur && <Slide media={cur.media} src={cur.src} ctx={{ client: { name: 'prévia' } }} />}
      <div className={cx('pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-5 py-3 transition-opacity', show ? 'opacity-100' : 'opacity-0')}>
        <span className="pointer-events-auto text-[12px] text-white/80">
          prévia {i + 1}/{items.length} · <b className="text-white">{cur?.media?.title}</b> · {fmt.ms(cur?.slot)}
        </span>
        <div className="pointer-events-auto ml-auto flex gap-2">
          <Btn size="xs" variant="line" onClick={() => setShow((s) => !s)} icon={show ? Pause : PlayCircle}>{show ? 'congelar' : 'seguir'}</Btn>
          <Btn size="xs" variant="line" icon={X} onClick={onClose}>fechar (esc)</Btn>
        </div>
      </div>
    </div>
  );
}
