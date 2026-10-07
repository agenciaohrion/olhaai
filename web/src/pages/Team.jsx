import React, { useState } from 'react';
import { Users, Plus, KeyRound, ShieldCheck, Bell, Trash2, Pencil, Building2, BadgeCheck } from 'lucide-react';
import { api, useApi, fmt } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Field, Modal, Empty, Loading, cx, toast, Th, Td, useAsk } from '../ui.jsx';
import { askNotifyPermission } from '../live.js';

export default function Team() {
  const { user, isAgency, clients, refresh } = useAuth();
  const { data, loading, reload } = useApi('/users');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ask, askNode] = useAsk();
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  const save = async (payload, id) => {
    if (id) await api(`/users/${id}`, { method: 'PATCH', body: payload });
    else await api('/users', { method: 'POST', body: payload });
    toast(id ? 'usuário atualizado' : 'acesso criado', 'ok');
    reload();
    refresh();
  };

  const remove = async (u) => {
    if (!(await ask({ title: `Remover acesso de ${u.name}?`, body: 'A pessoa perde o acesso ao painel imediatamente. As telas e o conteúdo não são afetados.', danger: true, okLabel: 'remover acesso' }))) return;
    await api(`/users/${u.id}`, { method: 'DELETE' });
    toast('acesso removido', 'ok');
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head
          icon={Users}
          title="Quem acessa este painel"
          sub={isAgency ? 'equipe da agência (papel “agência”) e os usuários de cada empresa cliente' : 'sua equipe — ninguém de fora enxerga seus dados'}
          right={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setShowNew(true)}>novo acesso</Btn>}
        />
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead className="bg-white/[0.02]">
                <tr><Th>pessoa</Th><Th>perfil</Th><Th>empresa</Th><Th>último acesso</Th><Th className="text-right">ações</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(data || []).map((u) => (
                  <tr key={u.id} className="transition hover:bg-white/[0.025]">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className={cx('grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold', u.role === 'agency' ? 'bg-brand/18 text-brand' : 'bg-brand2/15 text-brand2')}>
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{u.name}{u.id === user.id && <span className="ml-1.5 text-[10.5px] font-normal text-mute">(você)</span>}</p>
                          <p className="truncate text-[11px] text-mute">{u.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={u.role === 'agency' ? 'brand' : 'cyan'}>
                        {u.role === 'agency' ? <><ShieldCheck size={11} /> agência</> : <><Building2 size={11} /> cliente</>}
                      </Badge>
                    </Td>
                    <Td className="text-mute">{u.client_name || <span className="text-brand">todas as empresas</span>}</Td>
                    <Td className="text-mute">{u.last_login ? fmt.dt(u.last_login) : 'nunca entrou'}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconBtn icon={Pencil} title="editar / trocar senha" onClick={() => setEditing(u)} />
                        {u.id !== user.id && <IconBtn icon={Trash2} title="remover" onClick={() => remove(u)} className="hover:border-err/50 hover:text-err" />}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <Head icon={Bell} title="Avisos no navegador" sub="o painel te avisa quando uma tela cai ou volta" />
          <div className="space-y-3 p-4">
            <p className="text-[12.5px] leading-relaxed text-mute">
              Estado atual: <b className={notif === 'granted' ? 'text-ok' : 'text-warn'}>{notif === 'granted' ? 'permitido' : notif === 'denied' ? 'bloqueado' : notif === 'unsupported' ? 'não suportado' : 'não solicitado'}</b>.
              Com o aviso ligado, uma queda de conexão de uma tela importante aparece na sua área de notificações.
            </p>
            <Btn
              size="sm"
              variant={notif === 'granted' ? 'line' : 'primary'}
              icon={notif === 'granted' ? BadgeCheck : Bell}
              onClick={async () => {
                const r = await askNotifyPermission();
                setNotif(r);
                toast(r === 'granted' ? 'avisos ativados' : r === 'denied' ? 'bloqueado no navegador — libere nas configurações do site' : 'não disponível neste navegador', r === 'granted' ? 'ok' : 'warn');
              }}
            >
              {notif === 'granted' ? 'avisos ativos' : 'ativar avisos'}
            </Btn>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <Head icon={KeyRound} title="Perfis e permissões" sub="o que cada papel pode fazer" />
          <div className="divide-y divide-line">
            {[
              { r: 'Agência (você)', tone: 'brand', can: ['cria e edita empresas clientes', 'gera e revoga acessos', 'publica conteúdo em qualquer cliente', 'vê todas as telas, o mapa e os relatórios da carteira', 'gerencia a biblioteca comum'] },
              { r: 'Cliente', tone: 'cyan', can: ['vê apenas a própria empresa', 'cadastra pontos e telas', 'envia conteúdo e monta a própria programação', 'pausa, captura e localiza as próprias telas', 'não enxerga outras empresas nem os custos'] },
            ].map((x) => (
              <div key={x.r} className="p-4">
                <Badge tone={x.tone}>{x.r}</Badge>
                <ul className="mt-2.5 grid gap-1.5 text-[12.5px] text-mute sm:grid-cols-2">
                  {x.can.map((c) => (
                    <li key={c} className="flex items-start gap-1.5"><Check /> <span>{c}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <UserModal open={showNew || !!editing} onClose={() => (setShowNew(false), setEditing(null))} onSave={save} user={editing} />
      {askNode}
    </div>
  );
}

const Check = () => <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ok" />;

function UserModal({ open, onClose, user, onSave }) {
  const { isAgency, clients } = useAuth();
  const blank = { name: '', email: '', password: '', role: 'client', client_id: '', phone: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [seed, setSeed] = useState(0);
  const [k, setK] = useState(0);
  React.useEffect(() => {
    if (open) {
      setErr('');
      setForm(user ? { ...blank, name: user.name, email: user.email, phone: user.phone || '', role: user.role, client_id: user.client_id || '' } : blank);
    }
  }, [open, user?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...form, password: form.password || undefined, client_id: form.client_id ? Number(form.client_id) : null }, user?.id);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={user ? `Editar ${user.name}` : 'Novo acesso'}
      sub={user ? 'deixe a senha em branco para manter a atual' : 'a senha inicial é enviada pelo seu time comercial'}
      footer={<><Btn variant="ghost" onClick={onClose}>cancelar</Btn><Btn variant="primary" loading={busy} onClick={submit}>salvar</Btn></>}
    >
      <form onSubmit={submit} className="space-y-3">
        {err && <p className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[12.5px] text-err">{err}</p>}
        <Field label="nome"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
        <Field label="e-mail"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required disabled={!!user} /></Field>
        {isAgency && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="perfil">
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="client">cliente (uma empresa)</option>
                <option value="agency">agência (tudo)</option>
              </Select>
            </Field>
            <Field label="empresa">
              <Select value={form.client_id || ''} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} disabled={form.role === 'agency'}>
                <option value="">—</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <Field label={user ? 'nova senha' : 'senha inicial'} hint={user ? '' : 'padrão: olha12345'}>
          <Input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={user ? 'manter atual' : 'cliente123'} />
        </Field>
        <Field label="telefone"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
