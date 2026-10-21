import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Tv, MapPin, Radio, ShieldCheck, Zap, TriangleAlert, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Btn, Field, Input, toast, cx } from '../ui.jsx';

const DEMOS = [
  { role: 'Console da agência (você)', email: 'admin@olha.ai', pass: 'olha12345', hint: 'vê todas as empresas, cria clientes e publica conteúdo' },
  { role: 'Portal do cliente', email: 'rafael@inovepiscinas.com.br', pass: 'cliente123', hint: 'Piscinas Inove · 3 telas em 3 pontos' },
  { role: 'Portal do cliente', email: 'ju@fitmoveis.com.br', pass: 'cliente123', hint: 'Rede Fit Movel · grade de aulas' },
];

/**
 * Sonda a API antes de a pessoa tentar entrar.
 *
 * Sem isso, um `npm start` sem `npm run seed` (ou sem servidor) transformava o clique em
 * "não entra" — um erro que mora num toast de 4 segundos no canto da tela. Aqui a causa
 * vira uma frase com o comando que resolve, e um botão para conferir de novo sem recarregar.
 */
/** Que bundle esta página carregou (null quando não dá para saber, ex.: teste). */
const loadedBundle = () => {
  try {
    const src = [...document.querySelectorAll('script[src]')].map((n) => n.getAttribute('src') || '').find((v) => /index-[\w-]+\.js/.test(v));
    return src ? src.match(/index-[\w-]+\.js/)[0] : null;
  } catch {
    return null;
  }
};

function useApiProbe() {
  const [probe, setProbe] = useState({ state: 'checking', mine: loadedBundle() });
  const tries = useRef(0);

  const run = useCallback(async () => {
    try {
      const r = await fetch('/api/health', { headers: { accept: 'application/json' } });
      const d = await r.json();
      // `users` ausente = API mais antiga que este aviso: não temos direito de acusar a base
      const knows = d && typeof d.users === 'number';
      const mine = loadedBundle();
      setProbe({
        state: !knows || d.users > 0 ? 'ok' : 'empty',
        users: d?.users,
        clients: d?.clients,
        mine,
        stale: !!(d?.bundle && mine && d.bundle !== mine),
        theirs: d?.bundle || null,
      });
    } catch {
      setProbe({ state: 'down' });
    }
  }, []);

  useEffect(() => {
    run();
    // a sonda continua rodando mesmo com tudo certo: é assim que uma aba parada desde
    // antes do último build descobre que o servidor já tem outro bundle
    const t = setInterval(() => {
      if (probe.state === 'ok' && tries.current > 40) return clearInterval(t);
      if (tries.current++ > 200) return clearInterval(t);
      run();
    }, 3000);
    return () => clearInterval(t);
  }, [probe.state, run]);

  return [probe, run];
}

const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export default function Login() {
  const { login, persistent } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [probe, reprobe] = useApiProbe();

  const enter = useCallback(
    async (mail, senha) => {
      setBusy(true);
      setErr('');
      try {
        const u = await login(mail, senha);
        // o nome pode faltar em resposta estranha: isso nunca pode segurar o redirecionamento
        toast(`bem-vindo, ${u?.name?.split(' ')[0] || 'time'} 👋`, 'ok', 2200);
        nav('/', { replace: true });
        return true;
      } catch (e) {
        const msg = e?.message || 'não foi possível entrar';
        setErr(msg);
        toast(msg, 'err', 6000);
        if (/não respondeu|sem token/i.test(msg)) reprobe();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [login, nav, reprobe]
  );

  const submit = (e) => {
    e.preventDefault();
    enter(email.trim(), pass);
  };

  const useDemo = (d) => {
    setEmail(d.email);
    setPass(d.pass);
    enter(d.email, d.pass);
  };

  const blocked = probe.state === 'down' || probe.state === 'empty';

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* arte */}
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <img src="/hero-screens.jpg" alt="Telas de marketing indoor em ambiente real" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,7,15,.92),rgba(5,7,15,.45)_55%,rgba(124,92,255,.22))]" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link to="/inicio" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-brand/50 bg-brand/15">
              <Tv size={17} className="text-brand" />
            </span>
            <span className="font-[var(--font-display)] text-[17px] font-extrabold tracking-tight">
              OLHA<span className="text-brand">.AI</span>
            </span>
          </Link>
          <div>
            <h1 className="max-w-[15ch] font-[var(--font-display)] text-[38px] font-extrabold leading-[1.05] tracking-tight">
              Coloque conteúdo nas suas TVs e tablets pela internet.
            </h1>
            <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-mute">
              Publique a programação, acompanhe o que está no ar e saiba exatamente onde cada tela está — no mapa, em tempo real.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { i: Radio, t: 'publicação instantânea' },
                { i: MapPin, t: 'localização de cada tela' },
                { i: Zap, t: 'funciona offline' },
                { i: ShieldCheck, t: 'acesso separado por empresa' },
              ].map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-semibold text-fg/80">
                  <f.i size={13} className="text-brand2" /> {f.t}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-mute/70">OLHA.AI · sistema de gestão de marketing indoor · TV Box · Android TV · tablets · painéis de LED</p>
        </div>
      </div>

      {/* formulário */}
      <div className={cx('flex items-center justify-center px-5 py-10')}>
        <div className="w-full max-w-[380px]">
          <div className="mb-7 lg:hidden">
            <span className="font-[var(--font-display)] text-[19px] font-extrabold">OLHA<span className="text-brand">.AI</span></span>
            <p className="mt-1 text-[12.5px] text-mute">Gestão de marketing indoor para TVs, tablets e painéis.</p>
          </div>

          <h2 className="font-[var(--font-display)] text-[22px] font-bold tracking-tight">Entrar no painel</h2>
          <p className="mt-1 text-[12.5px] text-mute">Agência e clientes usam o mesmo endereço, com permissões diferentes.</p>

          {/* esta aba pode estar rodando um painel de antes do último build */}
          {probe.stale ? (
            <div className="mt-4 rounded-2xl border border-brand2/45 bg-brand2/10 p-3.5">
              <p className="text-[12.5px] font-bold text-brand2">Existe uma versão nova deste painel</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                Esta aba carregou <code className="font-mono">{esc(probe.mine)}</code>, e o servidor já está em{' '}
                <code className="font-mono">{esc(probe.theirs)}</code>. Os erros que aparecem aqui podem ser de código que não existe mais — recarregue antes de confiar neles.
              </p>
              <button type="button" onClick={() => location.reload()} className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-brand hover:underline">
                <RefreshCw size={13} /> recarregar agora
              </button>
            </div>
          ) : null}

          {/* o motivo honesto de "clico e não entra", antes de a pessoa tentar */}
          {probe.state === 'checking' ? null : blocked ? (
            <div className="mt-5 rounded-2xl border border-warn/45 bg-warn/10 p-3.5">
              <p className="flex items-center gap-2 text-[12.5px] font-bold text-warn">
                <TriangleAlert size={14} />
                {probe.state === 'down' ? 'A API não respondeu neste endereço' : 'O banco está sem acessos cadastrados'}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                {probe.state === 'down'
                  ? 'O painel abriu, mas o /api/health não respondeu — o servidor não está rodando (ou está em outra porta).'
                  : `A API está no ar, com ${probe.clients} empresa(s) e nenhum acesso. Falta criar os dados de demonstração.`}
              </p>
              <p className="mt-2 overflow-x-auto rounded-lg border border-line bg-ink2/80 px-2.5 py-1.5 font-mono text-[11.5px] whitespace-nowrap text-fg/90">
                npm run demo
              </p>
              <button type="button" onClick={reprobe} className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-brand hover:underline">
                <RefreshCw size={13} /> verificar de novo
              </button>
            </div>
          ) : null}

          {persistent === false ? (
            <p className="mt-4 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[11.5px] leading-snug text-mute">
              Seu navegador não está deixando guardar dados deste site — a sessão vai durar enquanto esta aba estiver aberta. Para fixá-la, libere cookies/armazenamento para este endereço.
            </p>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-3.5">
            <Field label="e-mail">
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                <Input
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  className="pl-9"
                  required
                />
              </div>
            </Field>
            <Field label="senha">
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  required
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-fg">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            {/* o erro fica preso no formulário — não só no toast que some */}
            {err ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-err/45 bg-err/10 px-3 py-2 text-[12.5px] leading-snug text-err">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{err}</span>
              </p>
            ) : null}

            <Btn type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={ArrowRight}>
              {busy ? 'entrando…' : 'entrar no painel'}
            </Btn>
          </form>

          <div className="mt-7 rounded-2xl border border-line bg-white/[0.025] p-3.5">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-mute">acessos de demonstração</p>
            <div className="space-y-1.5">
              {DEMOS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  disabled={busy}
                  onClick={() => useDemo(d)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent bg-ink2/70 px-3 py-2.5 text-left transition hover:border-brand/40 disabled:opacity-50"
                >
                  <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold', d.role.includes('agência') ? 'bg-brand/20 text-brand' : 'bg-brand2/15 text-brand2')}>
                    {d.role.includes('agência') ? 'AG' : 'CL'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{d.role}</span>
                    <span className="block truncate text-[11px] text-mute">{d.email} · {d.pass}</span>
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-mute transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-mute/80">
              Um clique já preenche e entra. {probe.state === 'ok' ? '' : 'Se falhar, o motivo aparece acima do botão.'}
            </p>
          </div>

          <p className="mt-4 text-center font-mono text-[10px] text-mute/60">
            painel {(probe.mine || 'dev').replace('index-', '').replace('.js', '')}
            {probe.theirs && probe.theirs !== probe.mine ? ` · servidor ${probe.theirs.replace('index-', '').replace('.js', '')}` : ''}
          </p>

          <p className="mt-3 text-center text-[12px] text-mute">
            <Link to="/player" className="font-semibold text-brand2 hover:underline">abrir o player de tela</Link>
            <span className="mx-2 text-line">|</span>
            <Link to="/inicio" className="hover:text-fg">conhecer o sistema</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
