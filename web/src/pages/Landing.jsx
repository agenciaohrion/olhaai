import React from 'react';
import { Link } from 'react-router-dom';
import {
  Tv, Tablet, Lightbulb, Monitor, MapPin, Radio, Zap, Layers, CalendarClock, Images, PlayCircle, ShieldCheck, ArrowRight, WifiOff, Eye, Building2, Users, BarChart3, Gauge,
} from 'lucide-react';
import { Btn, Badge, cx } from '../ui.jsx';

const FEATURES = [
  { i: Radio, t: 'Publicação em tempo real', d: 'Salvou e publicou, a grade chega no aparelho na hora pelo WebSocket. Sem reenviar arquivo por WhatsApp.' },
  { i: MapPin, t: 'Mapa com a localização', d: 'Cada TV, tablet e painel aparece no mapa com coordenada, precisão, bateria e hora do último contato.' },
  { i: CalendarClock, t: 'Janelas de horário', d: 'Manhã, almoço, happy hour, campanha: priorize grades por dia e faixa de horário e esqueça delas.' },
  { i: Layers, t: 'Vínculo por ponto ou tela', d: 'Aplique no ponto inteiro ou só numa tela. O aparelho vence o ponto, que vence a empresa.' },
  { i: Images, t: 'Vídeo, imagem, aviso, link', d: 'MP4/WebM até 4K, artes verticais ou horizontais, avisos rolantes, páginas, YouTube, relógio, previsão e manchetes.' },
  { i: WifiOff, t: 'Sem internet? Continua no ar', d: 'As peças ficam no cache do aparelho e a programação segue rodando; comandos ficam na fila.' },
  { i: Eye, t: 'Captura do que está na tela', d: 'Peça um screenshot do aparelho e confirme o que o público está vendo, sem mandar ninguém até lá.' },
  { i: BarChart3, t: 'Relatórios de exibição', d: 'Minutos no ar por tela, por conteúdo e por dia, com estimativa de impressões pelo público do ponto.' },
  { i: ShieldCheck, t: 'Agência e cliente separados', d: 'Cada empresa entra com o próprio login e vê só a própria rede. Você administra todas de um só lugar.' },
];

const DEVICES = [
  { i: Tv, t: 'TV Box & Android TV', d: 'navegador em modo quiosque, sem app para instalar' },
  { i: Tablet, t: 'Tablets (Android/iPad)', d: 'com GPS, bateria e trilha de deslocamento' },
  { i: Lightbulb, t: 'Painéis de LED', d: 'Windows/controlador, horizontal ou vertical' },
  { i: Monitor, t: 'Totens & monitores', d: 'autoatendimento, hall, Recepção, sala de espera' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-5 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-brand/40 bg-brand/15">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="9.2" ry="5.6" stroke="#7c5cff" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.7" fill="#22d3ee" /></svg>
          </span>
          <span className="font-[var(--font-display)] text-[16px] font-extrabold tracking-tight">OLHA<span className="text-brand">.AI</span></span>
          <span className="ml-1 hidden text-[11.5px] text-mute sm:block">gestão de marketing indoor</span>
          <nav className="ml-auto hidden items-center gap-5 text-[12.5px] font-semibold text-mute md:flex">
            <a href="#recursos" className="hover:text-fg">recursos</a>
            <a href="#aparelhos" className="hover:text-fg">aparelhos</a>
            <a href="#papéis" className="hover:text-fg">agência & cliente</a>
            <Link to="/player" className="hover:text-fg">player</Link>
          </nav>
          <Link to="/login" className="ml-auto md:ml-0"><Btn size="sm" variant="primary" icon={ArrowRight}>entrar no painel</Btn></Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden border-b border-line">
        <img src="/hero-screens.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(5,7,15,.96),rgba(5,7,15,.72)_45%,rgba(124,92,255,.18))]" />
        <div className="relative mx-auto grid max-w-[1180px] gap-8 px-5 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <Badge tone="cyan">sistema completo · painel + player + mapa</Badge>
            <h1 className="mt-4 font-[var(--font-display)] text-[clamp(30px,4.6vw,52px)] font-extrabold leading-[1.03] tracking-tight">
              Coloque conteúdo nas suas TVs e tablets<br /><span className="text-brand">pela internet</span> — e saiba onde cada tela está.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-mute">
              Você monta a programação no painel, publica, e o aparelho recebe na hora. Se a conexão do ponto cair, o conteúdo continua rolando do cache.
              Tudo com controle de quem vê o quê: a agência administra a carteira inteira, o cliente administra a própria rede.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link to="/login"><Btn size="lg" variant="primary" icon={PlayCircle}>entrar no painel</Btn></Link>
              <Link to="/player"><Btn size="lg" icon={Tv}>abrir uma tela de teste</Btn></Link>
              <Link to="/instalacao"><Btn size="lg" variant="ghost" icon={Zap}>ver instalação</Btn></Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { v: '4K/60', l: 'alta resolução' },
                { v: '24/7', l: 'no ar, mesmo offline' },
                { v: 'GPS', l: 'tablet em movimento' },
                { v: '3 passos', l: 'para instalar' },
              ].map((x) => (
                <div key={x.l} className="rounded-xl border border-line bg-white/[0.03] px-3 py-2.5">
                  <p className="font-[var(--font-display)] text-[18px] font-extrabold">{x.v}</p>
                  <p className="text-[10.5px] uppercase tracking-wide text-mute">{x.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* mock do painel */}
          <div className="relative">
            <div className="rounded-2xl border border-line bg-panel/80 p-3 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)] backdrop-blur">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex gap-1"><i className="h-2.5 w-2.5 rounded-full bg-err/70" /><i className="h-2.5 w-2.5 rounded-full bg-warn/70" /><i className="h-2.5 w-2.5 rounded-full bg-ok/70" /></span>
                <span className="ml-1 text-[10.5px] uppercase tracking-widest text-mute">visão geral · rede</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-ok"><i className="live-dot h-1.5 w-1.5 rounded-full bg-ok" />ao vivo</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'telas no ar', v: '21/24', c: '#34d399' },
                  { l: 'com localização', v: '24/24', c: '#22d3ee' },
                  { l: 'no ar hoje', v: '9 h 40', c: '#7c5cff' },
                ].map((k) => (
                  <div key={k.l} className="rounded-xl border border-line bg-ink2/70 p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-mute">{k.l}</p>
                    <p className="mt-1 font-[var(--font-display)] text-[17px] font-extrabold" style={{ color: k.c }}>{k.v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { t: 'TV Recepção', s: 'ofertas', on: true },
                  { t: 'Tablet Carro 01', s: 'institucional', on: true, mv: true },
                  { t: 'Painel LED Vitrine', s: 'sem sinal', on: false },
                ].map((d) => (
                  <div key={d.t} className="overflow-hidden rounded-xl border border-line bg-ink2/70">
                    <div className="relative aspect-video bg-[radial-gradient(70%_70%_at_30%_20%,rgba(124,92,255,.5),transparent)]">
                      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[8.5px] font-bold uppercase text-white/80">
                        <i className={cx('h-1.5 w-1.5 rounded-full', d.on ? 'live-dot bg-ok' : 'bg-err')} /> {d.s}
                      </span>
                      {d.mv && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/50 px-1 text-[8px] font-bold text-brand2">em movimento</span>}
                    </div>
                    <p className="truncate px-2 py-1.5 text-[10px] font-semibold">{d.t}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1.2fr_1fr]">
                <div className="rounded-xl border border-line bg-ink2/70 p-2.5">
                  <p className="mb-1.5 text-[9px] uppercase tracking-wider text-mute">minutos no ar por hora</p>
                  <div className="flex h-12 items-end gap-1">
                    {[38, 52, 71, 64, 88, 96, 74, 61, 80, 92, 58, 44].map((h, i) => (
                      <span key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: 'linear-gradient(180deg,#7c5cff,#7c5cff44)' }} />
                    ))}
                  </div>
                </div>
                <div className="map-dark relative h-[92px] overflow-hidden rounded-xl border border-line bg-[#0a0f22]">
                  <span className="pin" style={{ background: '#34d399', position: 'absolute', left: '30%', top: '38%' }}><span>TV</span></span>
                  <span className="pin" style={{ background: '#22d3ee', position: 'absolute', left: '58%', top: '24%' }}><span>TB</span></span>
                  <span className="pin" style={{ background: '#f87171', position: 'absolute', left: '72%', top: '62%' }}><span>LED</span></span>
                  <span className="absolute bottom-1 right-1.5 text-[8.5px] uppercase tracking-wider text-mute">rede no mapa</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* recursos */}
      <section id="recursos" className="mx-auto max-w-[1180px] px-5 py-16">
        <div className="max-w-[60ch]">
          <h2 className="font-[var(--font-display)] text-[clamp(24px,3vw,34px)] font-extrabold leading-tight tracking-tight">Tudo o que uma operação de telas precisa — sem frescura</h2>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-mute">Feito para quem cuida de várias contas e para o dono do ponto que só quer colocar a oferta no ar hoje.</p>
        </div>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="group rounded-2xl border border-line bg-panel/50 p-4 transition hover:border-brand/50 hover:bg-panel">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/[0.03] text-brand transition group-hover:border-brand/40 group-hover:text-brand2">
                <f.i size={17} />
              </span>
              <h3 className="mt-3 text-[14.5px] font-bold">{f.t}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* aparelhos */}
      <section id="aparelhos" className="border-y border-line bg-panel/30">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-16 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <h2 className="font-[var(--font-display)] text-[clamp(24px,3vw,32px)] font-extrabold leading-tight tracking-tight">Qualquer tela vira ponto de exibição</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-mute">
              Não vendemos hardware nem prendemos você a caixinha nenhuma. O player é um web app: ele roda no navegador que já existe no seu aparelho,
              guarda o conteúdo em cache e volta sozinho quando a internet voltar.
            </p>
            <div className="mt-6 space-y-2">
              {DEVICES.map((d) => (
                <div key={d.t} className="flex items-center gap-3 rounded-xl border border-line bg-ink2/60 px-3.5 py-2.5">
                  <d.i size={17} className="text-brand2" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{d.t}</p>
                    <p className="text-[11.5px] text-mute">{d.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/instalacao" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand hover:underline">
              ver o passo a passo de instalação <ArrowRight size={14} />
            </Link>
          </div>
          <div className="rounded-2xl border border-line bg-ink2/70 p-5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-mute">formatos suportados</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { t: '16:9 Full HD / 4K', d: 'TV, monitor, painel horizontal' },
                { t: '9:16 vertical', d: 'tablet em pé, painel de LED, totem' },
                { t: 'MP4 · WebM · MOV', d: 'vídeo com autoplay mudo' },
                { t: 'JPG · PNG · WebP · GIF', d: 'artes e loops leves' },
                { t: 'Aviso rolante', d: 'texto grande, prioridade máxima' },
                { t: 'Link · YouTube · RSS', d: 'página, vídeo e manchetes ao vivo' },
                { t: 'Relógio e previsão', d: 'widgets que nunca desatualizam' },
                { t: 'Peça HTML', d: 'criação avançada, renderizada no ar' },
              ].map((x) => (
                <div key={x.t} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[12.5px] font-bold">{x.t}</p>
                  <p className="mt-0.5 text-[11px] text-mute">{x.d}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2.5 text-[12px] text-fg/85">
              <Gauge size={15} className="text-brand" /> cada tela informa resolução e orientação reais — o painel avisa quando a arte não casa com o painel.
            </p>
          </div>
        </div>
      </section>

      {/* papéis */}
      <section id="papéis" className="mx-auto max-w-[1180px] px-5 py-16">
        <h2 className="font-[var(--font-display)] text-[clamp(24px,3vw,34px)] font-extrabold leading-tight tracking-tight">Dois portais, um sistema</h2>
        <p className="mt-2.5 max-w-[70ch] text-[14.5px] leading-relaxed text-mute">
          O mesmo endereço, com permissões diferentes por login. Ninguém precisa te chamar para trocar uma arte de última hora.
        </p>
        <div className="mt-8 grid gap-3 lg:grid-cols-2">
          {[
            {
              i: Building2, tone: 'brand', t: 'Para a agência (você)',
              pts: ['carteira de empresas com saúde de rede por conta', 'biblioteca comum de conteúdo para aproveitar em todas as contas', 'planos, valor mensal e custo por tela na carteira', 'cria/revoga acessos e pontos de cada cliente', 'relatórios consolidados e por empresa', 'resolve tudo sem sair do console'],
            },
            {
              i: Users, tone: 'cyan', t: 'Para o cliente (autonomia com suporte)',
              pts: ['envia o próprio conteúdo e monta a grade', 'publica no fim de semana e feriado, sem pedir liberação', 'pausa, captura e localiza as próprias telas', 'recebe aviso quando uma tela sai do ar', 'vê só a própria empresa — nada do vizinho', 'chama a agência quando quiser ajuda'],
            },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-line bg-panel/50 p-5">
              <div className="flex items-center gap-2.5">
                <span className={cx('grid h-9 w-9 place-items-center rounded-xl border', c.tone === 'brand' ? 'border-brand/40 bg-brand/15 text-brand' : 'border-brand2/40 bg-brand2/12 text-brand2')}>
                  <c.i size={17} />
                </span>
                <h3 className="font-[var(--font-display)] text-[17px] font-extrabold">{c.t}</h3>
              </div>
              <ul className="mt-4 grid gap-2 text-[13px] text-mute sm:grid-cols-2">
                {c.pts.map((p) => (
                  <li key={p} className="flex items-start gap-2"><Check /> <span className="leading-snug">{p}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-line bg-[radial-gradient(80%_120%_at_50%_0%,rgba(124,92,255,.18),transparent)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5 px-5 py-14">
          <div>
            <h2 className="font-[var(--font-display)] text-[clamp(22px,2.8vw,30px)] font-extrabold tracking-tight">Quer ver funcionando na sua tela?</h2>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-mute">
              Abra o painel com os acessos de demonstração, publique uma grade e acompanhe no mapa. Leva menos de 5 minutos — e o cadastro da primeira tela é o mesmo processo do dia a dia.
            </p>
          </div>
          <div className="flex gap-2.5">
            <Link to="/login"><Btn size="lg" variant="primary" icon={ArrowRight}>testar agora</Btn></Link>
            <Link to="/player"><Btn size="lg" icon={PlayCircle}>abrir player</Btn></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-7">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 text-[11.5px] text-mute">
          <span className="font-[var(--font-display)] text-[13px] font-extrabold text-fg">OLHA<span className="text-brand">.AI</span></span>
          <span>· gestão de marketing indoor, TV corporativa, setor público e tablets em movimento</span>
          <span className="ml-auto flex gap-3">
            <Link to="/login" className="hover:text-fg">painel</Link>
            <Link to="/player" className="hover:text-fg">player</Link>
            <Link to="/instalacao" className="hover:text-fg">instalação</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

const Check = () => <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ok" />;
