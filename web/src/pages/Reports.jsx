import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download, Users, PlayCircle, Tv, Clock3, TrendingUp, Info, Eye } from 'lucide-react';
import { api, useApi, fmt, MEDIA_KINDS } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Head, Badge, Btn, Select, Empty, Loading, cx, Bars, Th, Td, Segmented, Meter } from '../ui.jsx';

export default function Reports() {
  const { isAgency, q } = useAuth();
  const [days, setDays] = useState(14);
  const [view, setView] = useState('midia');
  const { data, loading } = useApi(q(`/reports?days=${days}`));

  const daily = data?.daily || [];
  const maxDay = Math.max(1, ...daily.map((d) => d.minutes));

  const csv = () => {
    const rows = [['data', 'minutos_no_ar', 'pecas_exibidas', 'telas_ativas'], ...daily.map((d) => [d.day, d.minutes, d.plays, d.screens])];
    if (view === 'midia') rows.push([], ['conteudo', 'tipo', 'minutos', 'exibicoes', 'telas'], ...(data?.per_media || []).map((m) => [m.title, m.kind, m.minutes, m.plays, m.screens]));
    if (view === 'telas') rows.push([], ['tela', 'ponto', 'tipo', 'minutos', 'exibicoes', 'dias_ativos'], ...(data?.per_device || []).map((m) => [m.name, m.location || '', m.type, m.minutes, m.plays, m.active_days]));
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `olha-relatorio-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading && !data) return <Loading label="calculando exibição…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={[7, 14, 30, 90].map((v) => ({ value: v, label: `${v} dias` }))} value={days} onChange={setDays} />
        <div className="ml-auto flex gap-2">
          <Btn size="sm" icon={Download} onClick={csv}>exportar CSV</Btn>
          <Btn size="sm" variant="primary" icon={Eye} onClick={() => window.print()}>imprimir</Btn>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={PlayCircle} tone="brand" label="tempo no ar" value={fmt.min(data?.totals.minutes)} sub={`${data?.totals.hours || 0} horas em ${days} dias`} />
        <Kpi icon={Clock3} tone="cyan" label="peças exibidas" value={fmt.n(data?.totals.plays)} sub="cada troca de conteúdo conta 1" />
        <Kpi icon={Tv} tone="ok" label="telas com exibição" value={`${data?.totals.screens_touched || 0}/${(data?.per_device || []).length}`} sub="aparelhos que rodaram algo no período" />
        <Kpi icon={Users} tone="warn" label="impressões estimadas" value={fmt.n(data?.totals.impressions)} sub="público do ponto × tempo de tela" hint />
      </div>

      <Card className="overflow-hidden">
        <Head icon={BarChart3} title={`Minutos no ar por dia · últimos ${days} dias`} sub="soma do tempo de exibição reportado por todos os aparelhos" right={<Badge tone="mute">{daily.filter((d) => d.minutes > 0).length} dia(s) ativos</Badge>} />
        <div className="p-4">
          {daily.length === 0 ? (
            <Empty icon={BarChart3} title="sem exibição registrada" hint="Assim que um aparelho reportar peças exibidas, o histórico aparece aqui." />
          ) : (
            <>
              <Bars height={168} data={daily.map((d) => ({ label: `${d.day.slice(8)}/${d.day.slice(5, 7)}`, value: d.minutes }))} unit=" min" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {daily.slice(-4).reverse().map((d) => (
                  <div key={d.day} className="rounded-xl border border-line bg-ink2/50 px-3 py-2.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-mute">{new Date(d.day + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                    <p className="mt-1 font-[var(--font-display)] text-[19px] font-extrabold">{fmt.min(d.minutes)}</p>
                    <p className="text-[11px] text-mute">{d.plays} peças · {d.screens} telas</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Head
          icon={TrendingUp}
          title="Detalhamento"
          sub="o que mais rodou, por conteúdo, tela ou período"
          right={
            <Segmented
              size="sm"
              options={[
                { value: 'midia', label: 'por conteúdo' },
                { value: 'telas', label: 'por tela' },
                { value: 'dias', label: 'por dia' },
              ]}
              value={view}
              onChange={setView}
            />
          }
        />
        <div className="overflow-x-auto">
          {view === 'midia' && (
            <table className="w-full min-w-[620px] border-collapse">
              <thead className="bg-white/[0.02]"><tr><Th>conteúdo</Th><Th>tipo</Th><Th className="text-right">minutos</Th><Th className="text-right">exibições</Th><Th className="text-right">telas</Th><Th className="w-[120px]">peso</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {(data?.per_media || []).map((m, i) => (
                  <tr key={m.id} className="transition hover:bg-white/[0.025]">
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-white/[0.05] text-[10px] font-bold text-mute">{i + 1}</span>
                        <span className="max-w-[320px] truncate font-semibold">{m.title}</span>
                      </span>
                    </Td>
                    <Td><Badge tone="mute" className="!" style={{ color: MEDIA_KINDS[m.kind]?.color, borderColor: (MEDIA_KINDS[m.kind]?.color || '#7c5cff') + '55', background: (MEDIA_KINDS[m.kind]?.color || '#7c5cff') + '18' }}>{MEDIA_KINDS[m.kind]?.label || m.kind}</Badge></Td>
                    <Td className="text-right tabular-nums">{fmt.min(m.minutes)}</Td>
                    <Td className="text-right tabular-nums">{fmt.n(m.plays)}</Td>
                    <Td className="text-right tabular-nums">{m.screens}</Td>
                    <Td><Meter value={maxShare(m.minutes, data.per_media, 'minutes')} /></Td>
                  </tr>
                ))}
                {!(data?.per_media || []).length && <tr><Td className="py-8 text-center text-mute" colSpan={6}>nenhum conteúdo exibido no período</Td></tr>}
              </tbody>
            </table>
          )}

          {view === 'telas' && (
            <table className="w-full min-w-[680px] border-collapse">
              <thead className="bg-white/[0.02]"><tr><Th>tela</Th><Th>ponto</Th>{isAgency && <Th>empresa</Th>}<Th className="text-right">minutos</Th><Th className="text-right">média/dia</Th><Th className="text-right">dias ativos</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {(data?.per_device || []).map((d) => (
                  <tr key={d.id} className="transition hover:bg-white/[0.025]">
                    <Td><Link to={`/telas/${d.id}`} className="font-semibold hover:text-brand">{d.name}</Link></Td>
                    <Td className="text-mute">{d.location || '—'}</Td>
                    {isAgency && <Td className="text-mute">{d.client_name}</Td>}
                    <Td className="text-right tabular-nums">{fmt.min(d.minutes)}</Td>
                    <Td className="text-right tabular-nums">{fmt.min(d.avg_min_per_day)}</Td>
                    <Td className="text-right tabular-nums">{d.active_days}/{days}</Td>
                  </tr>
                ))}
                {!(data?.per_device || []).length && <tr><Td className="py-8 text-center text-mute" colSpan={6}>nenhuma tela cadastrada</Td></tr>}
              </tbody>
            </table>
          )}

          {view === 'dias' && (
            <table className="w-full min-w-[520px] border-collapse">
              <thead className="bg-white/[0.02]"><tr><Th>data</Th><Th className="text-right">minutos</Th><Th className="text-right">peças</Th><Th className="text-right">telas</Th><Th className="w-[130px]">volume</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <Td className="font-semibold">{new Date(d.day + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</Td>
                    <Td className="text-right tabular-nums">{fmt.min(d.minutes)}</Td>
                    <Td className="text-right tabular-nums">{d.plays}</Td>
                    <Td className="text-right tabular-nums">{d.screens}</Td>
                    <Td><Meter value={(d.minutes / maxDay) * 100} tone="brand" /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-mute">
          <Info size={15} className="mt-0.5 shrink-0 text-brand2" />
          <span>
            <b className="text-fg">Como ler as impressões:</b> partimos do público diário informado em cada ponto de exibição e da fração do horário comercial em que a tela ficou no ar
            ({data?.totals.open_minutes_per_day || 600} min/dia). É uma estimativa operacional — para medir atenção de verdade, use as capturas de tela e o tempo de permanência do ponto.
          </span>
        </p>
      </Card>
    </div>
  );
}

const maxShare = (v, arr, key) => {
  const max = Math.max(1, ...(arr || []).map((x) => x[key] || 0));
  return (v / max) * 100;
};

function Kpi({ icon: Icon, label, value, sub, tone = 'brand', hint }) {
  const c = { brand: 'text-brand', cyan: 'text-brand2', ok: 'text-ok', warn: 'text-warn' }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-mute">
        <Icon size={13} className={c} /> {label}
      </div>
      <p className="mt-2 font-[var(--font-display)] text-[25px] font-extrabold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-mute">{sub}</p>
    </Card>
  );
}
