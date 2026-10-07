import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as CogIcon, KeyRound, Server, Tv, Radio, HardDrive, RefreshCw, ExternalLink, ShieldCheck, Database, Zap } from 'lucide-react';
import { api, useApi, fmt, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.js';
import { Card, Head, Badge, Btn, Input, Field, Copy, cx, toast, Empty, Meter } from '../ui.jsx';

export default function SettingsPage() {
  const { user, isAgency, logout } = useAuth();
  const live = useLive();
  const [pass, setPass] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState('');
  const [storage, setStorage] = useState(null);
  const [health, setHealth] = useState(null);
  const ov = useApi('/overview');

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setStorage(e)).catch(() => {});
    const ping = () => fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    ping();
    const t = setInterval(ping, 20000);
    return () => clearInterval(t);
  }, []);

  const changePass = async () => {
    setBusy('pass');
    try {
      await api('/auth/password', { method: 'POST', body: pass });
      toast('senha alterada ✔', 'ok');
      setPass({ current: '', next: '' });
    } catch (e) {
      toast(e.message, 'err');
    } finally { setBusy(''); }
  };

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <Head icon={KeyRound} title="Minha conta" sub="sessão e senha de acesso ao painel" />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-ink2/50 p-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/18 text-[13px] font-bold text-brand">{(user.name || '?').slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold">{user.name}</p>
              <p className="truncate text-[11.5px] text-mute">{user.email}</p>
            </div>
            <Badge tone={isAgency ? 'brand' : 'cyan'}>{isAgency ? 'agência' : 'cliente'}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="senha atual"><Input type="password" value={pass.current} onChange={(e) => setPass((p) => ({ ...p, current: e.target.value }))} placeholder="••••••••" /></Field>
            <Field label="nova senha" hint="mín. 6"><Input type="password" value={pass.next} onChange={(e) => setPass((p) => ({ ...p, next: e.target.value }))} placeholder="nova senha" /></Field>
          </div>
          <div className="flex gap-2">
            <Btn variant="primary" icon={ShieldCheck} loading={busy === 'pass'} onClick={changePass} disabled={!pass.current || pass.next.length < 6}>alterar senha</Btn>
            <Btn variant="ghost" icon={ExternalLink} onClick={logout}>sair</Btn>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Head icon={Server} title="Status da operação" sub="o que o servidor está fazendo agora" right={<Btn size="xs" icon={RefreshCw} onClick={() => (ov.reload(), setHealth(null), fetch('/api/health').then((r) => r.json()).then(setHealth))}>atualizar</Btn>} />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <Stat k="API" v={health?.ok ? 'online' : 'fora do ar'} tone={health?.ok ? 'ok' : 'err'} />
          <Stat k="websocket do painel" v={live.connected ? 'conectado' : 'reconectando'} tone={live.connected ? 'ok' : 'warn'} />
          <Stat k="aparelhos respondendo" v={`${ov.data?.screens.online ?? '—'} / ${ov.data?.screens.total ?? '—'}`} />
          <Stat k="sessões no ar" v={`${live.online.size}`} />
          <Stat k="painéis conectados" v={String(live.connected ? (ov.data?.realtime?.admins ?? 0) : 0)} />
          <Stat k="comandos na fila" v={String(ov.data?.realtime?.queued ?? 0)} tone={(ov.data?.realtime?.queued ?? 0) > 0 ? 'warn' : undefined} />
          <Stat k="horário do servidor" v={new Date((health?.at ? Date.parse(health.at) : Date.now())).toLocaleString('pt-BR')} />
          <Stat k="janela de presença" v="40 s sem heartbeat = sem sinal" />
        </div>
        {storage && (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute"><HardDrive size={12} /> uso de armazenamento deste navegador</p>
            <div className="flex items-center gap-3">
              <Meter value={((storage.usage || 0) / Math.max(1, storage.quota || 1)) * 100} tone="brand" />
              <span className="shrink-0 text-[11.5px] text-mute">{fmt.bytes(storage.usage)} de {fmt.bytes(storage.quota)}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-mute">O painel é leve; o que ocupa espaço é o cache de mídia dos aparelhos (guardado no navegador de cada TV/tablet, não aqui).</p>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Head icon={Tv} title="Endpoints para integração" sub="o que o aparelho / app nativo precisa conversar — tudo pela internet" />
        <div className="divide-y divide-line">
          {[
            { m: 'POST', p: '/api/player/pair', d: 'parear pelo código exibido no painel' },
            { m: 'GET', p: '/api/player/manifest', d: 'recebe a grade do momento (peças, janelas, modo)' },
            { m: 'GET', p: '/api/player/version', d: 'hash barato para detectar mudança' },
            { m: 'POST', p: '/api/player/heartbeat', d: 'telemetria, GPS e fila de comandos' },
            { m: 'POST', p: '/api/player/geo', d: 'posição do tablet (veículo)' },
            { m: 'POST', p: '/api/player/screenshot', d: 'imagem do que está na tela' },
            { m: 'WS', p: '/ws?kind=device&token=…', d: 'empurrão instantâneo de publicação' },
            { m: 'GET', p: '/uploads/…', d: 'arquivos de mídia (cache longo, aceita offline)' },
          ].map((r) => (
            <div key={r.p + r.m} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Badge tone={r.m === 'WS' ? 'brand' : r.m === 'POST' ? 'cyan' : 'mute'}>{r.m}</Badge>
              <Copy text={`${location.origin}${r.p}`} className="min-w-0 flex-1" />
              <span className="text-[11px] text-mute">{r.d}</span>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-mute">
          Para criar um app nativo (Android TV / Kiosk) basta autenticar com o token do aparelho devolvido pelo <code className="rounded bg-white/[0.06] px-1 font-mono text-[11px]">/pair</code>. O restante do protocolo é igual ao web app.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <Head icon={Database} title="Instalação & operação" sub="como este sistema está montado" />
        <div className="grid gap-2 p-4 text-[12.5px] sm:grid-cols-2">
          {[
            { k: 'Painel', v: 'React + Vite (mesmo endereço, / e /player)' },
            { k: 'API', v: 'Node/Express + WebSocket' },
            { k: 'Banco', v: 'SQLite local (data/signage.db)' },
            { k: 'Mídia', v: 'pasta uploads/ — troque por S3/CDN em produção' },
            { k: 'Player', v: '/player — navegador da TV Box, Android TV, tablet ou painel' },
            { k: 'Offline', v: 'Cache Storage no aparelho + fila de comandos' },
          ].map((x) => (
            <div key={x.k} className="rounded-xl border border-line bg-ink2/50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">{x.k}</p>
              <p className="mt-0.5 text-[12.5px] font-medium">{x.v}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Link to="/player"><Btn size="sm" icon={Zap}>abrir player em nova aba</Btn></Link>
          <Link to="/instalacao"><Btn size="sm" variant="primary" icon={Radio}>guia de instalação</Btn></Link>
        </div>
      </Card>
    </div>
  );
}

const Stat = ({ k, v, tone }) => (
  <div className="rounded-xl border border-line bg-ink2/50 px-3 py-2.5">
    <p className="text-[10px] font-bold uppercase tracking-wider text-mute">{k}</p>
    <p className={cx('mt-0.5 text-[13px] font-bold', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'err' ? 'text-err' : '')}>{v}</p>
  </div>
);
