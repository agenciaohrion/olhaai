import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Search, MapPin, Tv, ListVideo, Users, Pencil, Trash2, Eye, KeyRound, ArrowRight, Wallet, Star } from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Textarea, Field, Modal, Empty, Loading, cx, toast, Th, Td, useAsk, Meter } from '../ui.jsx';

const PLANS = {
  essencial: { label: 'Essencial', hint: 'até 3 telas, 1 ponto, publicação manual', color: '#8d98c4' },
  rede: { label: 'Rede', hint: 'telas e pontos ilimitados, janelas por horário', color: '#7c5cff' },
  publico: { label: 'Setor público', hint: 'conteúdo educativo, prestação de serviço, log completo', color: '#22d3ee' },
  movimento: { label: 'Em movimento', hint: 'tablets em veículos com GPS e trilha', color: '#34d399' },
};

export default function Clients() {
  const { setSelected } = useAuth();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [access, setAccess] = useState(null);
  const { data, loading, reload } = useApi('/clients');
  const [ask, askNode] = useAsk();
  useEffect(() => {
    if (params.get('new') === '1') setShowNew(true);
  }, [params]);

  const rows = (data || []).filter((c) => !term || (c.name + c.city + c.segment + (c.brand || '')).toLowerCase().includes(term.toLowerCase()));

  const save = async (payload, id) => {
    if (id) await api(`/clients/${id}`, { method: 'PATCH', body: payload });
    else await api('/clients', { method: 'POST', body: payload });
    toast(id ? 'empresa atualizada' : 'empresa criada — agora cadastre pontos e telas', 'ok');
    reload();
  };

  const remove = async (c) => {
    if (!(await ask({ title: `Excluir ${c.name}?`, body: 'Some com os pontos, aparelhos, playlists e mídias vinculados. As peças enviadas por upload também são removidas do histórico de exibição.', danger: true, okLabel: 'excluir empresa' }))) return;
    await api(`/clients/${c.id}`, { method: 'DELETE' });
    toast('empresa removida', 'ok');
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head
          icon={Building2}
          title="Empresas atendidas"
          sub="cada cliente tem portal próprio, biblioteca e telas isoladas — você administra tudo daqui"
          right={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setShowNew(true)}>nova empresa</Btn>}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="buscar empresa, cidade ou segmento" className="h-9 py-1.5 pl-8.5 text-[12.5px]" />
          </div>
          <span className="text-[11.5px] text-mute">
            {rows.length} conta(s) · {fmt.money(rows.reduce((a, c) => a + (c.monthly_value || 0), 0))}/mês
          </span>
        </div>

        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={Building2} title="nenhuma empresa" hint="Cadastre o cliente, crie o acesso dele e instale as telas — tudo em três passos." action={<Btn size="sm" variant="primary" className="mt-3" icon={Plus} onClick={() => setShowNew(true)}>cadastrar empresa</Btn>} />
        ) : (
          <div className="grid gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-3">
            {rows.map((c) => {
              const plan = PLANS[c.plan] || PLANS.essencial;
              const rate = c.stats.devices ? Math.round((c.stats.online / c.stats.devices) * 100) : 0;
              return (
                <div key={c.id} className="card-flat group relative overflow-hidden p-3.5 transition hover:border-brand/50">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-[radial-gradient(70%_70%_at_30%_20%,rgba(124,92,255,.3),transparent)] font-[var(--font-display)] text-[13px] font-black">
                      {(c.brand || c.name).slice(0, 3).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{c.name}</p>
                      <p className="truncate text-[11.5px] text-mute">{c.segment || 'segmento não informado'} · {c.city ? `${c.city}/${c.state}` : 'sem cidade'}</p>
                    </div>
                    <Badge tone={c.status === 'ativo' ? 'ok' : 'warn'}>{c.status}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    <Mini icon={Tv} v={c.stats.devices} l="telas" />
                    <Mini icon={MapPin} v={c.stats.locations} l="pontos" />
                    <Mini icon={ListVideo} v={c.stats.published} l="grades" />
                    <Mini icon={Users} v={c.stats.users} l="acessos" />
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[10.5px] text-mute">
                      <span>saúde da rede</span>
                      <span className={rate > 60 ? 'text-ok' : rate ? 'text-warn' : 'text-err'}>{c.stats.online}/{c.stats.devices} no ar</span>
                    </div>
                    <Meter value={rate} tone={rate > 60 ? 'ok' : rate ? 'warn' : 'err'} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Badge tone="mute" style={{ color: plan.color, borderColor: plan.color + '55', background: plan.color + '16' }}>{plan.label}</Badge>
                    <span className="text-[11.5px] font-semibold text-fg/80">{fmt.money(c.monthly_value)}/mês</span>
                    <div className="ml-auto flex gap-1">
                      <IconBtn icon={Eye} title="abrir como o cliente" onClick={() => { setSelected(c.id); window.location.href = '/'; }} />
                      <IconBtn icon={KeyRound} title="acessos" onClick={() => setAccess(c)} />
                      <IconBtn icon={Pencil} title="editar" onClick={() => setEditing(c)} />
                      <IconBtn icon={Trash2} title="excluir" onClick={() => remove(c)} className="hover:border-err/50 hover:text-err" />
                    </div>
                  </div>
                  {c.notes && <p className="mt-2.5 line-clamp-2 rounded-lg border border-line bg-ink2/50 px-2.5 py-2 text-[11.5px] leading-snug text-mute">📌 {c.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Head icon={Wallet} title="Carteira da agência" sub="valor por conta e o que está em cada plano" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="bg-white/[0.02]"><tr><Th>empresa</Th><Th>plano</Th><Th className="text-right">telas</Th><Th className="text-right">pontos</Th><Th className="text-right">valor/mês</Th><Th className="text-right">R$ por tela</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {(data || []).map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.025]">
                  <Td><Link to={`/telas?client_id=${c.id}`} className="font-semibold hover:text-brand">{c.name}</Link></Td>
                  <Td><Badge tone="mute">{(PLANS[c.plan] || PLANS.essencial).label}</Badge></Td>
                  <Td className="text-right tabular-nums">{c.stats.devices}</Td>
                  <Td className="text-right tabular-nums">{c.stats.locations}</Td>
                  <Td className="text-right font-semibold tabular-nums">{fmt.money(c.monthly_value)}</Td>
                  <Td className="text-right tabular-nums text-mute">{c.stats.devices ? fmt.money(c.monthly_value / c.stats.devices) : '—'}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-white/[0.02]">
                <Td className="font-bold" colSpan={4}>total recorrente</Td>
                <Td className="text-right font-bold tabular-nums">{fmt.money((data || []).reduce((a, c) => a + (c.monthly_value || 0), 0))}</Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <ClientModal open={showNew || !!editing} onClose={() => (setShowNew(false), setEditing(null), setParams({}))} client={editing} onSave={save} />
      <AccessModal client={access} onClose={() => setAccess(null)} onDone={reload} />
      {askNode}
    </div>
  );
}

const Mini = ({ icon: Icon, v, l }) => (
  <div className="rounded-lg border border-line bg-ink2/50 px-1.5 py-1.5 text-center">
    <Icon size={12} className="mx-auto text-mute" />
    <p className="mt-0.5 text-[14px] font-bold leading-none">{v}</p>
    <p className="text-[9.5px] uppercase tracking-wide text-mute">{l}</p>
  </div>
);

function ClientModal({ open, onClose, client, onSave }) {
  const blank = { name: '', brand: '', segment: '', cnpj: '', contact_name: '', contact_email: '', phone: '', city: '', state: '', plan: 'essencial', status: 'ativo', monthly_value: 0, notes: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setErr('');
      setForm(client ? { ...blank, ...client } : blank);
    }
  }, [open, client?.id]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...form, monthly_value: Number(form.monthly_value) || 0 }, client?.id);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? `Editar ${client.name}` : 'Nova empresa cliente'}
      sub="dados usados no portal do cliente, na cobrança e nos relatórios"
      footer={<><Btn variant="ghost" onClick={onClose}>cancelar</Btn><Btn variant="primary" loading={busy} onClick={submit}>salvar</Btn></>}
    >
      <form onSubmit={submit} className="space-y-3">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="nome da empresa"><Input value={form.name} onChange={set('name')} required placeholder="Piscinas Inove" /></Field>
          <Field label="marca / apelido" hint="aparece no topo e nas peças"><Input value={form.brand || ''} onChange={set('brand')} placeholder="INOVE" /></Field>
          <Field label="segmento"><Input value={form.segment || ''} onChange={set('segment')} placeholder="Varejo, clínica, academia…" /></Field>
          <Field label="CNPJ"><Input value={form.cnpj || ''} onChange={set('cnpj')} placeholder="00.000.000/0001-00" /></Field>
          <Field label="contato"><Input value={form.contact_name || ''} onChange={set('contact_name')} placeholder="nome de quem decide" /></Field>
          <Field label="e-mail do contato"><Input type="email" value={form.contact_email || ''} onChange={set('contact_email')} placeholder="nome@empresa.com.br" /></Field>
          <Field label="telefone / WhatsApp"><Input value={form.phone || ''} onChange={set('phone')} placeholder="(00) 00000-0000" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="cidade"><Input value={form.city || ''} onChange={set('city')} /></Field>
            <Field label="UF"><Input value={form.state || ''} onChange={set('state')} maxLength={2} /></Field>
          </div>
          <Field label="plano">
            <Select value={form.plan} onChange={set('plan')}>
              {Object.entries(PLANS).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — {v.hint}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="valor mensal (R$)"><Input type="number" min="0" step="10" value={form.monthly_value ?? 0} onChange={set('monthly_value')} /></Field>
            <Field label="status">
              <Select value={form.status} onChange={set('status')}>
                <option value="ativo">ativo</option>
                <option value="teste">em teste</option>
                <option value="suspenso">suspenso</option>
              </Select>
            </Field>
          </div>
        </div>
        <Field label="anotações comerciais" hint="o que a equipe precisa saber sobre a conta">
          <Textarea rows={3} value={form.notes || ''} onChange={set('notes')} placeholder="Prefere receber o conteúdo pronto; telas só ligam em horário comercial…" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function AccessModal({ client, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: 'cliente123' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { data: detail, reload } = useApi(client ? `/clients/${client.id}` : null);
  useEffect(() => {
    if (client) {
      setForm({ name: client.contact_name || '', email: client.contact_email || '', password: 'cliente123' });
      setMsg('');
    }
  }, [client?.id]);
  if (!client) return null;

  const create = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api(`/clients/${client.id}/access`, { method: 'POST', body: form });
      setMsg(`acesso criado: ${r.email} · senha ${r.temp_password}`);
      toast('acesso do cliente criado', 'ok');
      reload();
      onDone();
    } catch (e) {
      setMsg(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="md" title={`Acessos de ${client.name}`} sub="o cliente entra no mesmo endereço e vê apenas a própria rede"
      footer={<><Btn variant="ghost" onClick={onClose}>fechar</Btn><Btn variant="primary" icon={Plus} loading={busy} onClick={create} disabled={!form.email || !form.name}>criar acesso</Btn></>}>
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-white/[0.02]"><tr><Th>usuário</Th><Th>e-mail</Th><Th>último acesso</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {(detail?.users || []).map((u) => (
                <tr key={u.id}>
                  <Td className="font-semibold">{u.name}</Td>
                  <Td className="text-mute">{u.email}</Td>
                  <Td className="text-mute">{u.last_login ? fmt.dt(u.last_login) : 'nunca entrou'}</Td>
                </tr>
              ))}
              {!(detail?.users || []).length && <tr><Td colSpan={3} className="py-6 text-center text-mute">nenhum acesso criado</Td></tr>}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="nome"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="e-mail"><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="senha inicial"><Input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
        </div>
        {msg && <p className={cx('rounded-lg border px-3 py-2 text-[12px]', msg.includes('criado') ? 'border-ok/40 bg-ok/10 text-ok' : 'border-err/40 bg-err/10 text-err')}>{msg}</p>}
        <p className="text-[11.5px] leading-relaxed text-mute">
          Com esse acesso o cliente cadastra pontos, envia conteúdo, monta a programação e controla as próprias telas — sem enxergar outras empresas da sua carteira.
        </p>
      </div>
    </Modal>
  );
}
