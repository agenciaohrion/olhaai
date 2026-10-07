import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tv, Tablet, Monitor, Lightbulb, Play, CheckCircle2, Radio, QrCode, ExternalLink, WifiOff, Copy, Zap, MapPin, Keyboard, ShieldAlert, ArrowRight } from 'lucide-react';
import { api, useApi, fmt, DEVICE_TYPES } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Btn, IconBtn, Input, Select, Field, Empty, Loading, cx, toast, Dot, Copy as CopyBox } from '../ui.jsx';

const DEVICES = [
  {
    k: 'tv',
    t: 'TV Box / Android TV / Smart TV',
    i: Tv,
    steps: [
      'Na loja Play da TV, instale um navegador (ex.: “TV Bro”, “Web Video Caster” ou o browser nativo). Em Smart TV Samsung/LG, use o navegador da própria TV.',
      'Digite o endereço do painel seguido de /player — ex.: olha.ai/player (ou use o QR gerado no cadastro da tela).',
      'Aparece a tela de pareamento: digite o código de 6 caracteres que está no cadastro da tela no painel.',
      'Pronto: o conteúdo começa a entrar. Ajuste para tela cheia com a tecla F (ou no menu do navegador).',
    ],
    tips: ['Deixe o navegador como página inicial e ative “iniciar na tela cheia”.', 'Desligue o protetor de tela e a economia de energia da TV.', 'Som não é necessário: o player roda mudo por padrão.'],
  },
  {
    k: 'tablet',
    t: 'Tablet Android / iPad',
    i: Tablet,
    steps: [
      'Abra o Chrome (Android) ou Safari (iPad) e acesse /player.',
      'Permita a localização quando o navegador pedir — é assim que o painel sabe onde o tablet está.',
      'Informe o código do cadastro da tela. No Android, use “Adicionar à tela inicial” para virar um app em tela cheia.',
      'Em veículo, ative “manter tela ligada” no sistema e deixe o carregador conectado.',
    ],
    tips: ['Tablets enviam a posição a cada movimento; o mapa mostra a trilha do dia.', 'A bateria aparece no cadastro da tela — o painel avisa quando estiver baixa.'],
  },
  {
    k: 'led',
    t: 'Painel de LED (Windows / controlador)',
    i: Lightbulb,
    steps: [
      'No PC que alimenta o painel, abra o Edge/Chrome em modo quiosque: edge --kiosk "http://SEU-DOMINIO/player".',
      'Defina a resolução nativa do controlador (ex.: 1920×1080 ou 1080×1920 para módulos verticais).',
      'Informe o código da tela criada no painel, escolhendo o tipo “Painel de LED”.',
      'Configure o Windows para iniciar o navegador junto com o sistema (pasta Inicializar).',
    ],
    tips: ['Para LED vertical, cadastre a tela com orientação vertical e use peças 9:16.', 'O player tenta manter a tela acordada via Wake Lock; desative o sleep do Windows.'],
  },
  {
    k: 'monitor',
    t: 'Monitor / totem / autoatendimento',
    i: Monitor,
    steps: [
      'Rode o /player no navegador do totem (Android, Windows ou Raspberry Pi com Chromium).',
      'Se o totem tiver touch, o painel de programação pode ser usado direto nele — o mesmo endereço, sem /player.',
      'Ajuste a cor de fundo da playlist para preencher as bordas quando a arte não casar com a proporção.',
    ],
    tips: ['Prefira arte na proporção exata do painel para evitar bordas.', 'Links interativos (QR, promoções) funcionam bem nesse formato.'],
  },
];

export default function Setup() {
  const { isAgency, q } = useAuth();
  const [tab, setTab] = useState('tv');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const devs = useApi(q('/devices'));
  const pending = (devs.data || []).filter((d) => !d.paired);
  const device = DEVICES.find((d) => d.k === tab);
  const url = `${location.origin}/player`;

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api('/pairing-token', { method: 'POST', body: { code: code.trim().toUpperCase() } });
      setResult({ ok: true, ...r });
      toast('código válido — o aparelho pode ser pareado', 'ok');
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Head icon={Zap} title="Instalar o OLHA.AI em uma tela" sub="3 passos: cadastrar a tela aqui, abrir o player no aparelho, informar o código" />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {[
            { n: '1', t: 'Cadastre a tela', d: 'Nome, tipo, orientação e o ponto de exibição. O painel gera um código de 6 caracteres.', to: '/telas?new=1', cta: 'abrir cadastro' },
            { n: '2', t: 'Abra o player no aparelho', d: 'Acesse /player no navegador da TV, tablet ou PC do painel. Sem instalar nada.', to: '/player', cta: 'abrir player', ext: true },
            { n: '3', t: 'Informe o código', d: 'Digite o código na tela do aparelho. Ele grava o token e passa a receber a programação.', to: null, cta: null },
          ].map((s) => (
            <div key={s.n} className="relative overflow-hidden rounded-2xl border border-line bg-ink2/50 p-4">
              <span className="absolute -right-3 -top-4 font-[var(--font-display)] text-[72px] font-black text-white/[0.04]">{s.n}</span>
              <p className="text-[13.5px] font-bold">{s.t}</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">{s.d}</p>
              {s.to &&
                (s.ext ? (
                  <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-brand2 hover:underline">
                    {s.cta} <ExternalLink size={12} />
                  </a>
                ) : (
                  <Link to={s.to} className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-brand2 hover:underline">
                    {s.cta} <ArrowRight size={12} />
                  </Link>
                ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <span className="text-[11px] uppercase tracking-wider text-mute">endereço a digitar no aparelho</span>
          <CopyBox text={url} />
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-mute">
            <WifiOff size={12} className="text-brand2" /> se a internet cair, a última grade continua rodando do cache
          </span>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <Head icon={device?.i} title={device?.t} sub="passo a passo por tipo de aparelho" />
          <div className="flex flex-wrap gap-1 border-b border-line px-2 pt-2">
            {DEVICES.map((d) => (
              <button key={d.k} onClick={() => setTab(d.k)} className={cx('flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[12px] font-semibold transition', tab === d.k ? 'border-b-2 border-brand text-fg' : 'text-mute hover:text-fg')}>
                <d.i size={13} /> {d.t.split(' /')[0]}
              </button>
            ))}
          </div>
          <ol className="space-y-2.5 p-4">
            {device.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand/15 text-[11px] font-black text-brand">{i + 1}</span>
                <p className="text-[13px] leading-relaxed text-fg/85">{s}</p>
              </li>
            ))}
          </ol>
          <div className="border-t border-line bg-white/[0.015] px-4 py-3">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">recomendações de operação</p>
            <ul className="grid gap-1.5 text-[12px] text-mute sm:grid-cols-2">
              {device.tips.map((t) => (
                <li key={t} className="flex items-start gap-1.5"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" /> {t}</li>
              ))}
            </ul>
          </div>
        </Card>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <Head icon={QrCode} title="Testar um código" sub="confira se o pareamento está certo antes de subir na escada" />
            <div className="space-y-2.5 p-3.5">
              <Field label="código de 6 caracteres">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && test()} placeholder="OLHA101" className="text-center font-mono text-[19px] font-black tracking-[0.22em]" />
              </Field>
              <Btn variant="primary" className="w-full" loading={busy} icon={Play} onClick={test}>validar código</Btn>
              {result && (
                <div className={cx('rounded-xl border px-3 py-2.5 text-[12px]', result.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-err/40 bg-err/10 text-err')}>
                  {result.ok ? (
                    <>
                      <p className="font-bold">código válido ✔</p>
                      <p className="mt-0.5 text-mute">tela <b className="text-fg">{result.name}</b> · empresa {result.client}</p>
                      <Link to="/player" className="mt-1.5 inline-flex items-center gap-1 font-bold hover:underline">abrir o player <ExternalLink size={11} /></Link>
                    </>
                  ) : (
                    result.error
                  )}
                </div>
              )}
              {pending.length > 0 && (
                <div className="rounded-xl border border-line bg-ink2/50 p-2.5">
                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-mute">aguardando pareamento</p>
                  <div className="space-y-1">
                    {pending.map((d) => (
                      <button key={d.id} onClick={() => setCode(d.pairing_code)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.05]">
                        <Dot color="#fbbf24" />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{d.name}</span>
                        <span className="font-mono text-[11.5px] text-brand">{d.pairing_code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <Head icon={ShieldAlert} title="Se algo não aparecer" />
            <div className="space-y-2 p-3.5 text-[12px] leading-relaxed text-mute">
              <p><b className="text-fg">Tela fica em “aguardando programação”</b> → a playlist não foi publicada ou não está vinculada ao ponto/aparelho. Publique no editor de programação.</p>
              <p><b className="text-fg">Não muda nada depois de publicar</b> → o aparelho pode estar sem sinal; o comando fica na fila e é aplicado no próximo contato. Use “recarregar” na tela do cadastro.</p>
              <p><b className="text-fg">Sem mapa</b> → o navegador precisa de permissão de localização (HTTPS obrigatório no tablet) ou defina a posição do ponto manualmente.</p>
              <p><b className="text-fg">Vídeo não toca</b> → autoplay sem gesto é bloqueado em alguns navegadores: toque uma vez na tela do aparelho (ou adicione à tela inicial no Android).</p>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <Head icon={Keyboard} title="Atalhos do player" sub="no teclado do aparelho" />
            <div className="grid grid-cols-2 gap-1.5 p-3.5 text-[11.5px]">
              {[['F', 'tela cheia'], ['I', 'diagnóstico'], ['R', 'reiniciar'], ['→', 'próxima peça'], ['espaço', 'congelar'], ['Esc', 'sair do overlay']].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="kbd">{k}</span> <span className="truncate text-mute">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
