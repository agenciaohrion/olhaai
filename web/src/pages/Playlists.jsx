import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ListVideo, Plus, Search, Clock3, Radio, Tv, Copy, Trash2, PlayCircle, MoreVertical, CalendarClock } from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES, DAY_LABELS } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Field, Modal, Empty, Loading, cx, toast, useAsk, Meter } from '../ui.jsx';

export default function Playlists() {
  const { isAgency, q, body } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const [f, setF] = useState('todas');
  const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useApi(q('/playlists'));
  const [ask, askNode] = useAsk();
  useEffect(() => {
    if (params.get('new') === '1') setShowNew(true);
  }, [params]);

  const rows = useMemo(() => {
    let out = data || [];
    if (term) out = out.filter((p) => p.name.toLowerCase().includes(term.toLowerCase()));
    if (f === 'publicadas') out = out.filter((p) => p.status === 'publicada');
    if (f === 'rascunho') out = out.filter((p) => p.status !== 'publicada');
    return out;
  }, [data, term, f]);

  const create = async (payload) => {
    const p = await api('/playlists', { method: 'POST', body: body(payload) });
    toast('playlist criada — agora monte a trilha', 'ok');
    reload();
    nav(`/programacao/${p.id}`);
  };

  const remove = async (p) => {
    if (!(await ask({ title: `Excluir "${p.name}"?`, body: 'A grade sai do ar nas telas vinculadas e não pode ser recuperada.', danger: true, okLabel: 'excluir' }))) return;
    await api(`/playlists/${p.id}`, { method: 'DELETE' });
    toast('playlist excluída', 'ok');
    reload();
  };

  const duplicate = async (p) => {
    const c = await api(`/playlists/${p.id}/duplicate`, { method: 'POST' });
    toast(`cópia criada: ${c.name}`, 'ok');
    reload();
  };

  const unpublish = async (p) => {
    await api(`/playlists/${p.id}/unpublish`, { method: 'POST' });
    toast('grade retirada do ar', 'warn');
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head
          icon={ListVideo}
          title="Programação das telas"
          sub="monte a sequência de peças, defina horários e escolha quais telas recebem"
          right={
            <>
              <Btn size="sm" icon={Plus} onClick={() => setShowNew(true)}>
                nova playlist
              </Btn>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar playlist" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
          </div>
          <Select value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-[170px] py-1 text-[12.5px]">
            <option value="todas">todas</option>
            <option value="publicadas">publicadas</option>
            <option value="rascunho">rascunhos</option>
          </Select>
          <span className="ml-auto text-[11.5px] text-mute">{rows.length} grade(s)</span>
        </div>

        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty
            icon={ListVideo}
            title={data?.length ? 'nada com esse filtro' : 'nenhuma programação ainda'}
            hint="Uma playlist é a sequência de peças que a tela exibe. Você pode ter várias (manhã, happy hour, campanha) e vincular cada uma a pontos diferentes."
            action={<Btn size="sm" variant="primary" className="mt-3" icon={Plus} onClick={() => setShowNew(true)}>criar primeira playlist</Btn>}
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <div key={p.id} className="group flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-white/[0.025]">
                <Link to={`/programacao/${p.id}`} className="flex min-w-[220px] flex-1 items-center gap-3">
                  <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', p.status === 'publicada' ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line bg-white/[0.03] text-mute')}>
                    <ListVideo size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-bold group-hover:text-brand">{p.name}</span>
                      {p.status === 'publicada' ? <Badge tone="ok">no ar</Badge> : <Badge tone="warn">rascunho</Badge>}
                      {isAgency && data.some((x) => x.client_id !== p.client_id) && (
                        <Badge tone="mute">{p.client_id ? 'empresa #' + p.client_id : ''}</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-mute">
                      {p.items} peça(s) · ciclo {fmt.ms(p.duration_total_ms)} · v{p.version} · atualizada {fmt.ago(p.updated_at)}
                      {p.published_at ? ` · publicada ${fmt.ago(p.published_at)}` : ''}
                    </span>
                  </span>
                </Link>
                <div className="flex items-center gap-4">
                  <div className="hidden w-32 sm:block">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-mute">alcance</p>
                    <div className="flex items-center gap-1.5">
                      <Tv size={12} className={p.bounds ? 'text-ok' : 'text-mute/60'} />
                      <span className="text-[12px] font-semibold">{p.bounds}</span>
                      <span className="text-[10.5px] text-mute">vínculo(s)</span>
                    </div>
                  </div>
                  <div className="hidden w-32 md:block">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-mute">grade</p>
                    <Badge tone={p.orientation === 'v' ? 'cyan' : 'mute'}>{p.orientation === 'v' ? 'vertical' : p.orientation === 'h' ? 'horizontal' : 'mista'}</Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                    {p.status !== 'publicada' ? (
                      <Btn size="xs" variant="line" icon={PlayCircle} onClick={() => nav(`/programacao/${p.id}?publish=1`)}>
                        publicar
                      </Btn>
                    ) : (
                      <Btn size="xs" variant="line" icon={Radio} onClick={() => unpublish(p)}>
                        tirar do ar
                      </Btn>
                    )}
                    <IconBtn icon={Copy} title="duplicar" onClick={() => duplicate(p)} />
                    <IconBtn icon={Trash2} title="excluir" onClick={() => remove(p)} className="hover:border-err/50 hover:text-err" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Head icon={CalendarClock} title="Como a ordem de prioridade funciona" sub="a regra que decide o que cada tela mostra neste instante" />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            { n: '1', t: 'Vínculo no aparelho', d: 'Se a playlist estiver marcada para uma tela específica, ela vence tudo. Use para campanhas locais.' },
            { n: '2', t: 'Vínculo no ponto', d: 'Playlist do ponto de exibição: todas as TVs daquele endereço recebem a mesma grade.' },
            { n: '3', t: 'Vínculo na empresa', d: 'Padrão da conta: entra em qualquer tela que não tenha vínculo mais específico.' },
          ].map((x) => (
            <div key={x.n} className="rounded-xl border border-line bg-ink2/60 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand/18 text-[11px] font-black text-brand">{x.n}</span>
                <p className="text-[12.5px] font-bold">{x.t}</p>
              </div>
              <p className="text-[11.5px] leading-relaxed text-mute">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-mute">
          Entre playlists do mesmo nível, vence a que tiver <b className="text-fg">janela de horário ativa</b> agora; havendo empate, a de <b className="text-fg">maior prioridade</b>. Sem janela definida, a peça roda o dia todo.
        </p>
      </Card>

      <NewModal open={showNew} onClose={() => setShowNew(false)} onCreate={create} />
      {askNode}
    </div>
  );
}

function NewModal({ open, onClose, onCreate }) {
  const { isAgency, clients, focusId } = useAuth();
  const [form, setForm] = useState({ name: '', orientation: 'h', notes: '', client_id: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) setForm({ name: '', orientation: 'h', notes: '', client_id: focusId || clients?.[0]?.id || '' });
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onCreate(form);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Nova playlist" sub="nomeie pelo objetivo (ex.: Ofertas da semana, Grade manhã, Interno RH)"
      footer={<><Btn variant="ghost" onClick={onClose}>cancelar</Btn><Btn variant="primary" loading={busy} onClick={submit}>criar e montar</Btn></>}>
      <form onSubmit={submit} className="space-y-3">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err">{err}</p>}
        <Field label="nome"><Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Vitrine Semanal" required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="orientação">
            <Select value={form.orientation} onChange={(e) => setForm((f) => ({ ...f, orientation: e.target.value }))}>
              <option value="h">horizontal</option>
              <option value="v">vertical</option>
            </Select>
          </Field>
          {isAgency && (
            <Field label="empresa">
              <Select value={form.client_id || ''} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="observação interna"><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="opcional" /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
