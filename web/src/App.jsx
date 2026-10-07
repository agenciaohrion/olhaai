import React, { Suspense, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, Tv, Images, ListVideo, BarChart3, Building2, MapPin, Users, Settings, Radio,
  Menu, X, LogOut, ChevronDown, Plus, Eye, PlayCircle, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { AuthProvider, useAuth } from './auth.jsx';
import { Toaster, Btn, Dot, Badge, cx, Loading } from './ui.jsx';
import { useLive } from './live.js';
import { getToken } from './api.js';

import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
const MapPage = React.lazy(() => import('./pages/MapPage.jsx'));
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Content from './pages/Content.jsx';
import Playlists from './pages/Playlists.jsx';
import PlaylistEditor from './pages/PlaylistEditor.jsx';
import Reports from './pages/Reports.jsx';
import Clients from './pages/Clients.jsx';
import Locations from './pages/Locations.jsx';
import Team from './pages/Team.jsx';
import SettingsPage from './pages/Settings.jsx';
const PlayerPage = React.lazy(() => import('./player/PlayerPage.jsx'));
import Setup from './pages/Setup.jsx';

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/telas', label: 'Telas & aparelhos', icon: Tv },
  { to: '/mapa', label: 'Mapa da rede', icon: Map },
  { to: '/conteudo', label: 'Conteúdo', icon: Images },
  { to: '/programacao', label: 'Programação', icon: ListVideo },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/pontos', label: 'Pontos de exibição', icon: MapPin },
  { to: '/empresas', label: 'Empresas', icon: Building2, agency: true },
  { to: '/equipe', label: 'Equipe & acessos', icon: Users },
  { to: '/instalacao', label: 'Instalar TV / tablet', icon: PlayCircle },
  { to: '/config', label: 'Configurações', icon: Settings },
];

export default function App() {
  return (
    <>
      <Toaster />
      <Suspense fallback={<Boot />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inicio" element={<Landing />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
      </Suspense>
    </>
  );
}

function Shell() {
  const { user, ready, logout, isAgency, clients, focusId, setSelected } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const live = useLive();
  const nav = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);

  if (!ready) return <Boot />;
  if (!user || !getToken()) return <Navigate to="/login" replace />;

  const onlineCount = live.online.size;

  return (
    <div className="app-bg relative flex min-h-full">
      {/* sidebar */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-ink2/95 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Logo />
          <div className="min-w-0 flex-1">
            <div className="font-[var(--font-display)] text-[15px] font-extrabold leading-none tracking-tight">OLHA<span className="text-brand">.AI</span></div>
            <div className="mt-1 truncate text-[10.5px] uppercase tracking-[0.18em] text-mute">
              {isAgency ? 'Console da agência' : 'Portal do cliente'}
            </div>
          </div>
          <button className="text-mute lg:hidden" onClick={() => setOpen(false)} aria-label="fechar menu">
            <X size={18} />
          </button>
        </div>

        {isAgency && (
          <div className="mx-3 mb-3 rounded-xl border border-line bg-white/[0.03] p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-mute">
              <span>olhando para</span>
              <span className="text-brand2">{live.connected ? 'ao vivo' : 'offline'}</span>
            </div>
            <div className="relative">
              <select
                value={focusId || ''}
                onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
                className="w-full appearance-none rounded-lg border border-line bg-ink px-2.5 py-2 pr-7 text-[12.5px] font-semibold text-fg outline-none focus:border-brand"
              >
                <option value="">🌐 Toda a rede ({clients.length} empresas)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand || c.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-mute" />
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.filter((n) => !n.agency || isAgency).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition',
                  isActive ? 'bg-brand/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.06)]' : 'text-mute hover:bg-white/[0.04] hover:text-fg'
                )
              }
            >
              <n.icon size={16} className="shrink-0 opacity-90" />
              <span className="truncate">{n.label}</span>
              {n.to === '/telas' && onlineCount > 0 && (
                <span className="ml-auto flex items-center gap-1 rounded-md bg-ok/12 px-1.5 py-0.5 text-[10px] font-bold text-ok">
                  <Dot color="#34d399" live /> {onlineCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/20 text-[11px] font-bold text-brand">
              {(user.name || '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold">{user.name}</div>
              <div className="truncate text-[10.5px] text-mute">{user.email}</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Btn size="xs" variant="ghost" icon={ShieldCheck} onClick={() => nav('/config')} className="flex-1">
              conta
            </Btn>
            <Btn size="xs" variant="ghost" icon={LogOut} onClick={logout} className="flex-1">
              sair
            </Btn>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      {/* conteúdo */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-ink/80 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <button className="text-mute lg:hidden" onClick={() => setOpen(true)} aria-label="abrir menu">
            <Menu size={19} />
          </button>
          <PageTitle />
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cx(
                'hidden items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider sm:flex',
                live.connected ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-white/[0.03] text-mute'
              )}
              title={live.connected ? 'Conexão em tempo real ativa' : 'Reconectando ao servidor…'}
            >
              <Radio size={12} /> {live.connected ? 'tempo real' : 'reconectando'}
            </span>
            {focusId && <Badge tone="cyan">filtro: {clients.find((c) => c.id === focusId)?.brand || clients.find((c) => c.id === focusId)?.name || 'empresa'}</Badge>}
            <Btn size="sm" variant="primary" icon={Plus} onClick={() => nav(isAgency ? '/empresas?new=1' : '/telas?new=1')}>
              {isAgency ? 'Nova empresa' : 'Nova tela'}
            </Btn>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 pb-16 pt-4 sm:px-5">
          <Suspense fallback={<Loading label="carregando…" />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/telas" element={<Devices />} />
            <Route path="/telas/:id" element={<DeviceDetail />} />
            <Route path="/mapa" element={<MapPage />} />
            <Route path="/conteudo" element={<Content />} />
            <Route path="/programacao" element={<Playlists />} />
            <Route path="/programacao/:id" element={<PlaylistEditor />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/pontos" element={<Locations />} />
            <Route path="/empresas" element={isAgency ? <Clients /> : <Navigate to="/" replace />} />
            <Route path="/equipe" element={<Team />} />
            <Route path="/instalacao" element={<Setup />} />
            <Route path="/config" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function PageTitle() {
  const loc = useLocation();
  const item = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));
  return (
    <div className="min-w-0">
      <h1 className="truncate font-[var(--font-display)] text-[15px] font-bold tracking-tight sm:text-[17px]">{item?.label || 'Painel'}</h1>
      <p className="hidden truncate text-[11px] text-mute sm:block">
        {item ? 'gestão de marketing indoor · telas, conteúdo e localização' : 'OLHA.AI'}
      </p>
    </div>
  );
}

const Logo = () => (
  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand/40 bg-[radial-gradient(80%_80%_at_30%_20%,rgba(124,92,255,.4),transparent)]">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="9.2" ry="5.6" stroke="#7c5cff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.7" fill="#22d3ee" />
    </svg>
  </span>
);

const Boot = () => (
  <div className="grid min-h-screen place-items-center bg-ink">
    <div className="flex flex-col items-center gap-3">
      <Logo />
      <div className="flex items-center gap-2 text-[12.5px] text-mute">
        <RefreshCw size={13} className="animate-spin" /> abrindo o painel…
      </div>
    </div>
  </div>
);

function NotFound() {
  const nav = useNavigate();
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="text-[42px]">🧭</div>
      <h2 className="mt-2 font-[var(--font-display)] text-lg font-bold">Página não encontrada</h2>
      <p className="mt-1 text-[13px] text-mute">O endereço acessado não existe neste painel.</p>
      <Btn className="mt-4" variant="primary" icon={Eye} onClick={() => nav('/')}>
        voltar para a visão geral
      </Btn>
    </div>
  );
}
