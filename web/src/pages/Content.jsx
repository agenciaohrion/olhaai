import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Images, Upload, Plus, Search, Trash2, Pencil, Eye, Star, ListVideo, Film, ImageIcon, Link2, Type, Clock3, CloudSun, Newspaper, Code2, Play, X, Check,
} from 'lucide-react';
import { api, useApi, fmt, MEDIA_KINDS, asset } from '../api.js';
import { useAuth } from '../auth.jsx';
import Slide from '../Slide.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Textarea, Field, Modal, Empty, Loading, cx, toast, Segmented, useAsk, SmartImg, Copy } from '../ui.jsx';

const KIND_ICON = { image: ImageIcon, video: Film, text: Type, html: Code2, url: Link2, youtube: Play, clock: Clock3, weather: CloudSun, news: Newspaper };

export default function Content() {
  const { isAgency, q, body } = useAuth();
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('todos');
  const [scope, setScope] = useState('padrao');
  const [sel, setSel] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [ask, askNode] = useAsk();
  const lists = useApi(q('/playlists'));
  const qs = new URLSearchParams();
  if (scope !== 'padrao') qs.set('scope', scope);
  if (term) qs.set('q', term);
  if (kind !== 'todos') qs.set('kind', kind);
  const mediaPath = q('/media' + (qs.toString() ? `?${qs}` : ''));
  const { data, loading, reload } = useApi(mediaPath);

  const rows = useMemo(() => data || [], [data]);
  const toggle = (id) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const remove = async (m) => {
    const used = m.used_in;
    if (used && !(await ask({ title: 'Remover mesmo assim?', body: `"${m.title}" está em ${used} item(ns) de playlist. Remover apaga a peça das grades.`, danger: true, okLabel: 'remover' }))) return;
    try {
      await api(`/media/${m.id}${used ? '?force=1' : ''}`, { method: 'DELETE' });
      toast('conteúdo removido', 'ok');
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const promote = async (m) => {
    await api(`/media/${m.id}/promote`, { method: 'POST' });
    toast('peça enviada para a biblioteca da agência', 'ok');
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head
          icon={Images}
          title="Biblioteca de conteúdo"
          sub="imagens, vídeos, avisos, links e widgets que entram na programação das telas"
          right={
            <>
              <Segmented
                size="sm"
                options={[
                  { value: 'padrao', label: isAgency ? 'todas as peças' : 'minha empresa' },
                  { value: 'library', label: 'biblioteca da agência' },
                ]}
                value={scope}
                onChange={setScope}
              />
              <Btn size="sm" icon={Plus} onClick={() => setShowNew(true)}>nova peça</Btn>
              <Btn size="sm" variant="primary" icon={Upload} onClick={() => document.getElementById('up').click()}>
                enviar arquivo
              </Btn>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar por título ou tag" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
          </div>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-[190px] py-1 text-[12.5px]">
            <option value="todos">todos os tipos</option>
            {Object.entries(MEDIA_KINDS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
          {sel.size > 0 && (
            <>
              <Badge tone="brand">{sel.size} selecionada(s)</Badge>
              <Btn size="sm" icon={ListVideo} onClick={() => setAddTo([...sel])}>
                adicionar à playlist
              </Btn>
              <Btn size="sm" variant="ghost" icon={X} onClick={() => setSel(new Set())}>limpar</Btn>
            </>
          )}
          <span className="ml-auto text-[11.5px] text-mute">{rows.length} peça(s)</span>
        </div>

        <Dropzone onDone={() => (reload(), toast('conteúdo pronto para uso na programação', 'ok'))} />

        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty
            icon={Images}
            title="nenhuma peça encontrada"
            hint="Envie imagens/vídeos ou crie peças dinâmicas (aviso rolante, relógio, previsão do tempo, manchetes, link externo)."
            action={
              <div className="mt-3 flex gap-2">
                <Btn size="sm" variant="primary" icon={Upload} onClick={() => document.getElementById('up').click()}>enviar arquivo</Btn>
                <Btn size="sm" icon={Plus} onClick={() => setShowNew(true)}>criar peça dinâmica</Btn>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((m) => (
              <MediaCard
                key={m.id}
                m={m}
                checked={sel.has(m.id)}
                onToggle={() => toggle(m.id)}
                onPreview={() => setPreview(m)}
                onEdit={() => setEditing(m)}
                onRemove={() => remove(m)}
                onPromote={isAgency ? () => promote(m) : null}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title} size="lg" sub={preview ? `${MEDIA_KINDS[preview.kind]?.label} · ${preview.orientation === 'v' ? 'vertical' : 'horizontal'}` : ''}>
        {preview && (
          <div className="overflow-hidden rounded-xl border border-line bg-black">
            <div className="mx-auto aspect-video w-full [&_img]:object-contain">
              <Slide media={preview} src={asset(preview.src)} ctx={{ location: { city: 'Teresina', state: 'PI' } }} />
            </div>
          </div>
        )}
        {preview && (
          <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-3">
            <Meta k="arquivo" v={preview.filename || '—'} />
            <Meta k="tamanho" v={preview.bytes_label || '—'} />
            <Meta k="duração" v={preview.duration_ms ? fmt.ms(preview.duration_ms) : '—'} />
            <Meta k="resolução" v={preview.width ? `${preview.width}×${preview.height}` : '—'} />
            <Meta k="checksum" v={preview.checksum || '—'} />
            <Meta k="usada em" v={`${preview.used_in || 0} item(ns) de playlist`} />
          </div>
        )}
      </Modal>

      <MediaForm open={showNew || !!editing} media={editing} onClose={() => (setShowNew(false), setEditing(null))} onSaved={() => (reload(), setShowNew(false), setEditing(null))} />
      <AddToPlaylist open={!!addTo} ids={addTo || []} onClose={() => setAddTo(null)} playlists={lists.data || []} onDone={() => (setAddTo(null), reload(), lists.reload())} />
      {askNode}
    </div>
  );
}

const Meta = ({ k, v }) => (
  <div className="rounded-lg border border-line bg-ink2/60 px-2.5 py-2">
    <div className="text-[10px] font-bold uppercase tracking-wider text-mute/80">{k}</div>
    <div className="truncate font-mono text-[11.5px]" title={String(v)}>{v}</div>
  </div>
);

function MediaCard({ m, checked, onToggle, onPreview, onEdit, onRemove, onPromote }) {
  const Icon = KIND_ICON[m.kind] || ImageIcon;
  const accent = MEDIA_KINDS[m.kind]?.color || '#7c5cff';
  return (
    <div className={cx('card-flat group overflow-hidden transition', checked ? 'border-brand/70 ring-1 ring-brand/30' : 'hover:border-brand/40')}>
      <div className="relative cursor-pointer bg-black" onClick={onPreview} style={{ aspectRatio: m.orientation === 'v' ? '3/4' : '16/9' }}>
        <SmartImg src={asset(m.thumb)} className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
          <Btn size="sm" variant="line" icon={Eye}>pré-visualizar</Btn>
        </div>
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur" style={{ color: accent }}>
          <Icon size={11} /> {MEDIA_KINDS[m.kind]?.label || m.kind}
        </span>
        {m.public ? (
          <span className="absolute right-2 top-2 rounded-md bg-brand/85 px-1.5 py-1 text-[9.5px] font-bold uppercase tracking-wide text-white">biblioteca</span>
        ) : (
          <button
            onClick={onToggle}
            className={cx('absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition', checked ? 'border-brand bg-brand text-white' : 'border-white/25 bg-black/50 text-transparent hover:text-white/70')}
            title="selecionar"
          >
            <Check size={13} />
          </button>
        )}
        {m.orientation === 'v' && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1 py-0.5 text-[9.5px] font-bold uppercase text-white/80">vertical</span>}
      </div>
      <div className="space-y-2 p-2.5">
        <p className="line-clamp-2 min-h-[32px] text-[12.5px] font-semibold leading-snug" title={m.title}>{m.title}</p>
        <p className="text-[10.5px] text-mute">
          {m.width ? `${m.width}×${m.height} · ` : ''}
          {m.duration_ms ? fmt.ms(m.duration_ms) + ' · ' : ''}
          {m.bytes_label || m.mime || 'dinâmico'}
          {m.used_in ? ` · em ${m.used_in} grade(s)` : ''}
        </p>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn icon={Pencil} title="editar" onClick={onEdit} />
          {m.src && <a href={m.src} target="_blank" rel="noreferrer"><IconBtn icon={Link2} title="abrir arquivo" /></a>}
          {onPromote && !m.public && <IconBtn icon={Star} title="enviar para a biblioteca da agência" onClick={onPromote} className="hover:border-brand/50 hover:text-brand" />}
          <IconBtn icon={Trash2} title="remover" onClick={onRemove} className="ml-auto hover:border-err/50 hover:text-err" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ upload ------------------------------ */

function Dropzone({ onDone }) {
  const { isAgency, clients, focusId } = useAuth();
  const [over, setOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [tags, setTags] = useState('');
  const [share, setShare] = useState(false);
  const [dest, setDest] = useState(focusId || clients?.[0]?.id || '');
  const inputRef = useRef(null);

  const add = async (files) => {
    const arr = Array.from(files).slice(0, 20);
    const items = await Promise.all(
      arr.map(async (f) => {
        const meta = await readMeta(f);
        return { file: f, meta, progress: 0 };
      })
    );
    setQueue((q2) => [...q2, ...items]);
    for (const it of items) upload(it);
  };

  const upload = async (item) => {
    const fd = new FormData();
    fd.append('files[]', item.file, item.file.name);
    if (tags) fd.append('tags', tags);
    if (share) fd.append('public', '1');
    if (!share && dest) fd.append('client_id', String(dest));
    fd.append('meta', JSON.stringify({ ...item.meta, title: item.file.name.replace(/\.[^.]+$/, '') }));
    setQueue((q) => q.map((x) => (x === item ? { ...x, progress: 20, status: 'enviando' } : x)));
    try {
      await api('/media/upload', { method: 'POST', form: fd });
      setQueue((q) => q.map((x) => (x === item ? { ...x, progress: 100, status: 'ok' } : x)));
      onDone();
      setTimeout(() => setQueue((q) => q.filter((x) => x !== item)), 1600);
    } catch (e) {
      setQueue((q) => q.map((x) => (x === item ? { ...x, progress: 100, status: 'erro', error: e.message } : x)));
      toast(`${item.file.name}: ${e.message}`, 'err', 6000);
    }
  };

  return (
    <div className="border-b border-line p-3">
      <label
        data-upload-client
        className={cx('relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition', over ? 'border-brand bg-brand/10' : 'border-line bg-ink2/40 hover:border-brand/50')}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer?.files?.length) add(e.dataTransfer.files);
        }}
      >
        <input
          id="up"
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,.svg,.gif"
          className="hidden"
          onChange={(e) => (e.target.files?.length && add(e.target.files), (e.target.value = ''))}
        />
        <Upload size={19} className={cx(over ? 'text-brand' : 'text-mute')} />
        <span className="text-[13px] font-semibold">{over ? 'solte para enviar' : 'arraste vídeos e imagens, ou clique para escolher'}</span>
        <span className="text-[11.5px] text-mute">MP4, WebM, MOV, JPG, PNG, WebP, GIF, SVG · até 400 MB por arquivo · HD/Full HD/4K até 60fps</span>
        <span className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          <input value={tags} onChange={(e) => setTags(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="tags (ex.: oferta, semana)" className="w-52 rounded-lg border border-line bg-ink px-2 py-1 text-[11.5px] outline-none focus:border-brand" />
          {isAgency && (
            <>
              <span className="flex items-center gap-1.5 text-[11px] text-mute" onClick={(e) => e.stopPropagation()}>
                empresa
                <select value={dest || ''} onChange={(ev) => setDest(ev.target.value)} className="rounded-lg border border-line bg-ink px-2 py-1 text-[11.5px] text-fg outline-none">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.brand || c.name}</option>
                  ))}
                </select>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-mute" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="accent-[#7c5cff]" /> biblioteca da agência (todas)
              </span>
            </>
          )}
        </span>
      </label>

      {queue.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {queue.map((it, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line bg-ink2/60 px-2.5 py-2">
              <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md', it.status === 'ok' ? 'bg-ok/15 text-ok' : it.status === 'erro' ? 'bg-err/15 text-err' : 'bg-white/[0.05] text-mute')}>
                {it.status === 'ok' ? <Check size={13} /> : it.status === 'erro' ? <X size={13} /> : <Film size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{it.file.name}</span>
                <span className="block text-[10.5px] text-mute">
                  {fmt.bytes(it.file.size)} {it.meta.width ? `· ${it.meta.width}×${it.meta.height}` : ''} {it.meta.duration_ms ? `· ${fmt.ms(it.meta.duration_ms)}` : ''} {it.error ? `· ${it.error}` : ''}
                </span>
              </span>
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.07]">
                <span className={cx('block h-full rounded-full transition-all', it.status === 'erro' ? 'bg-err' : it.status === 'ok' ? 'bg-ok' : 'bg-brand')} style={{ width: `${it.progress}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** lê dimensões/duração no próprio navegador antes de subir */
async function readMeta(file) {
  const out = {};
  try {
    const url = URL.createObjectURL(file);
    if (/^video\//.test(file.type)) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      await new Promise((res) => {
        v.onloadedmetadata = res;
        v.onerror = res;
        v.src = url;
      });
      out.width = v.videoWidth;
      out.height = v.videoHeight;
      out.duration_ms = Math.round((v.duration || 0) * 1000);
      if (v.duration === Infinity) out.duration_ms = 60000; // live/infinito
    } else {
      const i = new Image();
      await new Promise((res) => {
        i.onload = res;
        i.onerror = res;
        i.src = url;
      });
      out.width = i.naturalWidth;
      out.height = i.naturalHeight;
    }
    if (out.width && out.height) out.orientation = out.height > out.width ? 'v' : 'h';
    URL.revokeObjectURL(url);
  } catch {}
  return out;
}

/* ------------------------------- formulários ------------------------------- */

function MediaForm({ open, media, onClose, onSaved }) {
  const { isAgency, focusId, clients } = useAuth();
  const blank = { kind: 'text', title: '', body: '', url: '', orientation: 'h', tags: '', public: false, client_id: focusId || '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setErr('');
      setForm(media ? { ...blank, ...media, public: !!media.public } : blank);
    }
  }, [open, media?.id]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const payload = { ...form };
      delete payload.thumb;
      delete payload.src;
      delete payload.bytes_label;
      if (media) delete payload.kind;
      await api(media ? `/media/${media.id}` : '/media', { method: media ? 'PATCH' : 'POST', body: payload });
      toast(media ? 'peça atualizada' : 'peça criada', 'ok');
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  const isFile = media && (media.kind === 'image' || media.kind === 'video');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={media ? `Editar ${media.title}` : 'Nova peça dinâmica'}
      sub="conteúdo gerado no próprio aparelho: sempre atualizado e leve para o cache"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>cancelar</Btn>
          <Btn variant="primary" loading={busy} onClick={submit}>salvar</Btn>
        </>
      }
    >
      <div className="space-y-3.5">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err">{err}</p>}
        {!media && (
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(MEDIA_KINDS)
              .filter(([k]) => !['image', 'video'].includes(k))
              .map(([k, v]) => {
                const Icon = KIND_ICON[k];
                return (
                  <button
                    key={k}
                    onClick={() => setForm((f) => ({ ...f, kind: k }))}
                    className={cx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-semibold transition', form.kind === k ? 'border-brand bg-brand/12 text-fg' : 'border-line bg-ink2/50 text-mute hover:border-brand/40')}
                  >
                    <Icon size={15} style={{ color: v.color }} /> {v.label}
                  </button>
                );
              })}
          </div>
        )}
        <Field label="título / identificador" hint="aparece na lista e pode entrar como cabeçalho da peça">
          <Input value={form.title} onChange={set('title')} placeholder={form.kind === 'news' ? 'Manchetes de esporte' : 'Aviso: feriado dia 12'} />
        </Field>
        {['url', 'youtube', 'news'].includes(form.kind) && (
          <Field label={form.kind === 'youtube' ? 'link do vídeo' : form.kind === 'news' ? 'feed RSS (endereço .xml)' : 'endereço do site/blog'}>
            <Input value={form.url || ''} onChange={set('url')} placeholder={form.kind === 'news' ? 'https://site.com/feed' : 'https://'} />
          </Field>
        )}
        {(form.kind === 'text' || form.kind === 'html') && (
          <Field label={form.kind === 'text' ? 'texto do aviso (uma linha por parágrafo)' : 'HTML da peça (recebe o estilo do player)'}>
            <Textarea rows={form.kind === 'html' ? 8 : 4} value={form.body || ''} onChange={set('body')} placeholder={form.kind === 'text' ? 'Atenção: promoção válida só hoje\nEstacionamento grátis após 18h' : '<h1 style="font-size:9vw">OFERTA RELÂMPAGO</h1>'} className={form.kind === 'html' ? 'font-mono text-[12px]' : ''} />
          </Field>
        )}
        {['clock', 'weather'].includes(form.kind) && (
          <p className="rounded-lg border border-line bg-ink2/60 px-3 py-2 text-[11.5px] leading-relaxed text-mute">
            {form.kind === 'weather' ? 'A previsão usa a coordenada do ponto/aparelho (Open-Meteo) e é atualizada a cada 10 minutos no próprio aparelho.' : 'Relógio e data em português, direto do relógio do aparelho — funciona mesmo sem internet.'}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="orientação recomendada">
            <Select value={form.orientation} onChange={set('orientation')}>
              <option value="h">horizontal</option>
              <option value="v">vertical</option>
            </Select>
          </Field>
          <Field label="tags" hint="para filtrar na biblioteca">
            <Input value={form.tags || ''} onChange={set('tags')} placeholder="oferta, atendimento" />
          </Field>
        </div>
        {isAgency && !media && (
          <Field label="empresa">
            <Select value={form.client_id || ''} onChange={set('client_id')}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {isAgency && (
          <label className="flex items-center gap-2 text-[12px] text-mute">
            <input type="checkbox" checked={!!form.public} onChange={set('public')} className="accent-[#7c5cff]" /> deixar disponível para todas as empresas (biblioteca)
          </label>
        )}
        {isFile && (
          <div className="rounded-xl border border-line bg-ink2/60 p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-mute">arquivo</p>
            <Copy text={location.origin + media.src} />
            <p className="mt-2 text-[11px] leading-snug text-mute">
              para trocar o arquivo, envie um novo conteúdo e substitua na playlist — o cache de cada tela se atualiza sozinho pelo checksum.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddToPlaylist({ open, ids, onClose, playlists, onDone }) {
  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [atEnd, setAtEnd] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => (target === 'new' && !name && (setName(`Seleção ${new Date().toLocaleDateString('pt-BR')}`)), undefined), [open]);

  const run = async () => {
    setBusy(true);
    try {
      let pl = playlists.find((p) => p.id === Number(target));
      if (target === 'new') pl = await api('/playlists', { method: 'POST', body: { name, orientation: 'h' } });
      const existing = await api(`/playlists/${pl.id}`);
      const items = [...(existing.items || []).map((i) => ({ media_id: i.media_id, duration_ms: i.duration_ms }))];
      const add = ids.map((id) => ({ media_id: id }));
      const merged = atEnd ? [...items, ...add] : [...add, ...items];
      await api(`/playlists/${pl.id}/items`, { method: 'PUT', body: { items: merged } });
      toast(`${ids.length} peça(s) na playlist "${pl.name}" — publique para levar às telas`, 'ok', 5200);
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Adicionar à programação"
      sub={`${ids.length} peça(s) selecionada(s)`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>cancelar</Btn>
          <Btn variant="primary" loading={busy} onClick={run}>adicionar</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="destino">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">➕ criar playlist nova</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.items} peças ({p.status})
              </option>
            ))}
          </Select>
        </Field>
        {target === 'new' && (
          <Field label="nome da playlist"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        )}
        <label className="flex items-center gap-2 text-[12.5px] text-mute">
          <input type="checkbox" checked={atEnd} onChange={(e) => setAtEnd(e.target.checked)} className="accent-[#7c5cff]" /> colocar no fim da fila (senão, entra no início)
        </label>
      </div>
    </Modal>
  );
}
