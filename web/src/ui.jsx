/** Kit de UI do painel (componentes enxutos, tema único). */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2, Inbox, Check, Copy as CopyIcon, AlertTriangle } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ------------------------------- feedback ------------------------------- */
let toasts = [];
const toastSubs = new Set();
export function toast(message, tone = 'info', ms = 4200) {
  const id = Math.random().toString(36).slice(2);
  toasts = [{ id, message, tone }, ...toasts].slice(0, 4);
  for (const f of toastSubs) f(toasts);
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    for (const f of toastSubs) f(toasts);
  }, ms);
}
export function Toaster() {
  const [list, setList] = useState(toasts);
  useEffect(() => (toastSubs.add(setList), () => toastSubs.delete(setList)), []);
  const tone = { info: 'border-line', ok: 'border-ok/50', err: 'border-err/60', warn: 'border-warn/50' };
  return (
    <div className="fixed bottom-5 right-5 z-[900] flex w-[min(92vw,380px)] flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={cx(
            'fade-up flex items-start gap-2 rounded-xl border bg-panel/95 px-3.5 py-3 text-[13px] shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop-blur',
            tone[t.tone] || tone.info
          )}
        >
          {t.tone === 'err' ? (
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-err" />
          ) : t.tone === 'ok' ? (
            <Check size={15} className="mt-0.5 shrink-0 text-ok" />
          ) : (
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          )}
          <span className="whitespace-pre-line leading-snug text-fg/90">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- primitivos ------------------------------- */

export function Btn({ variant = 'line', size = 'md', icon: Icon, loading, children, className, ...rest }) {
  const v = {
    primary:
      'bg-brand text-white hover:brightness-110 border border-brand/60 shadow-[0_8px_24px_-12px_rgba(124,92,255,.9)]',
    cyan: 'bg-brand2/15 text-brand2 hover:bg-brand2/25 border border-brand2/40',
    line: 'bg-white/[0.03] text-fg/90 hover:bg-white/[0.07] border border-line',
    ghost: 'text-mute hover:text-fg hover:bg-white/[0.05] border border-transparent',
    danger: 'bg-err/12 text-err hover:bg-err/20 border border-err/35',
    ok: 'bg-ok/12 text-ok hover:bg-ok/20 border border-ok/35',
  }[variant];
  const s = { xs: 'h-7 px-2 text-[11px] rounded-lg gap-1', sm: 'h-8 px-2.5 text-[12px] rounded-lg gap-1.5', md: 'h-10 px-3.5 text-[13px] rounded-xl gap-2', lg: 'h-12 px-5 text-sm rounded-xl gap-2' }[size];
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        v,
        s,
        className
      )}
    >
      {loading ? <Loader2 size={size === 'xs' ? 12 : 15} className="animate-spin" /> : Icon ? <Icon size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export const IconBtn = ({ icon: Icon, title, className, ...rest }) => (
  <button
    title={title}
    {...rest}
    className={cx('grid h-8 w-8 place-items-center rounded-lg border border-line bg-white/[0.03] text-mute transition hover:text-fg hover:bg-white/[0.08]', className)}
  >
    <Icon size={15} />
  </button>
);

export const Card = ({ className, children, ...rest }) => (
  <div {...rest} className={cx('card', className)}>
    {children}
  </div>
);

export function Head({ title, sub, icon: Icon, right, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-[var(--font-display)] text-[13.5px] font-semibold tracking-tight text-fg">
          {Icon && <Icon size={15} className="shrink-0 text-brand" />}
          <span className="truncate">{title}</span>
        </h3>
        {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-mute">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
}

export const Label = ({ children, hint }) => (
  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mute">
    {children}
    {hint && <span className="ml-1.5 font-normal normal-case tracking-normal text-mute/70">{hint}</span>}
  </label>
);

const fieldBase =
  'w-full rounded-xl border border-line bg-ink2/80 px-3 py-2.5 text-[13.5px] text-fg outline-none transition placeholder:text-mute/50 focus:border-brand/70 focus:bg-ink2 disabled:opacity-50';

export const Input = React.forwardRef(({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(fieldBase, className)} />);
export const Textarea = React.forwardRef(({ className, ...p }, ref) => (
  <textarea ref={ref} rows={p.rows || 4} {...p} className={cx(fieldBase, 'resize-y leading-relaxed', className)} />
));
export const Select = React.forwardRef(({ className, children, ...p }, ref) => (
  <select ref={ref} {...p} className={cx(fieldBase, 'appearance-none bg-[right_10px_center] bg-no-repeat pr-8', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238d98c4' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}>
    {children}
  </select>
));

export const Field = ({ label, hint, children, className }) => (
  <div className={className}>
    {label && <Label hint={hint}>{label}</Label>}
    {children}
  </div>
);

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-ink2/60 px-3 py-2.5 text-left transition hover:border-brand/40"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg/90">{label}</span>
        {hint && <span className="block truncate text-[11.5px] text-mute">{hint}</span>}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-white/12')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function Badge({ tone = 'mute', children, className, style }) {
  const t = {
    mute: 'bg-white/[0.05] text-mute border-line',
    brand: 'bg-brand/15 text-brand border-brand/35',
    cyan: 'bg-brand2/12 text-brand2 border-brand2/30',
    ok: 'bg-ok/12 text-ok border-ok/30',
    warn: 'bg-warn/12 text-warn border-warn/30',
    err: 'bg-err/12 text-err border-err/30',
  }[tone];
  return <span style={style} className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide', t, className)}>{children}</span>;
}

export const Dot = ({ color = '#8d98c4', live }) => (
  <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', live && 'live-dot')} style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
);

export function Modal({ open, onClose, title, sub, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-[800] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('fade-up card my-auto w-full shadow-[0_40px_120px_rgba(0,0,0,.7)]', w)}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-[var(--font-display)] text-[15px] font-semibold text-fg">{title}</h2>
            {sub && <p className="mt-1 text-[12px] leading-snug text-mute">{sub}</p>}
          </div>
          <IconBtn icon={X} title="Fechar (Esc)" onClick={onClose} />
        </div>
        <div className="max-h-[min(72vh,720px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, onCancel, onOk, title, body, danger, okLabel = 'Confirmar' }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onOk}>{okLabel}</Btn>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-mute">{body}</p>
    </Modal>
  );
}

export const useAsk = () => {
  const [ask, setAsk] = useState(null);
  const confirm = useCallback((opts) => new Promise((res) => setAsk({ ...opts, res })), []);
  const node = ask ? (
    <Confirm
      open
      {...ask}
      onCancel={() => (ask.res(false), setAsk(null))}
      onOk={() => (ask.res(true), setAsk(null))}
    />
  ) : null;
  return [confirm, node];
};

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-ink2/70 p-0.5">
      {options.map((o) => {
        const k = o.value ?? o;
        const label = o.label ?? o;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={cx(
              'rounded-[9px] font-semibold transition',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[12.5px]',
              value === k ? 'bg-brand text-white shadow-[0_6px_18px_-8px_rgba(124,92,255,.9)]' : 'text-mute hover:text-fg'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line px-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'relative -mb-px flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold transition',
            value === it.value ? 'text-fg' : 'text-mute hover:text-fg/80'
          )}
        >
          {it.icon && <it.icon size={14} />}
          {it.label}
          {it.count != null && <span className="rounded bg-white/[0.06] px-1 text-[10px] text-mute">{it.count}</span>}
          {value === it.value && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-brand" />}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ icon: Icon = Inbox, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white/[0.03] text-mute">
      <Icon size={19} />
    </div>
    <p className="text-[13.5px] font-semibold text-fg/90">{title}</p>
    {hint && <p className="max-w-md text-[12px] leading-relaxed text-mute">{hint}</p>}
    {action}
  </div>
);

export const Loading = ({ label = 'carregando…' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-mute">
    <Loader2 size={15} className="animate-spin" /> {label}
  </div>
);

export const Skeleton = ({ className }) => <div className={cx('skeleton rounded-lg', className)} />;

export function Bars({ data = [], unit = '', height = 120, accent = '#7c5cff', labelKey = 'label', valueKey = 'value' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const v = d[valueKey] || 0;
        return (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end gap-1">
            <div
              className="w-full rounded-[4px] transition-all group-hover:brightness-125"
              style={{
                height: `${Math.max(2, (v / max) * (height - 22))}px`,
                background: `linear-gradient(180deg,${accent},${accent}55)`,
              }}
            />
            <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-panel px-1.5 py-1 text-[10.5px] font-semibold text-fg shadow-lg group-hover:block">
              {d[labelKey]} · {v.toLocaleString('pt-BR')}
              {unit}
            </span>
            <span className="truncate text-center text-[9.5px] text-mute/80">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({ value = 0, total = 1, label, color = '#34d399', size = 46 }) {
  const pct = total ? Math.min(1, value / total) : 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c2447" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <span className="absolute text-[10px] font-bold text-fg">{Math.round(pct * 100)}</span>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

export function Copy({ text, children }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        toast('copiado para a área de transferência', 'ok', 1800);
        setTimeout(() => setDone(false), 1600);
      }}
      className="group inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2 py-1 font-mono text-[12px] text-fg/90 transition hover:border-brand/50"
      title="copiar"
    >
      {children || <span className="truncate">{text}</span>}
      {done ? <Check size={12} className="text-ok" /> : <CopyIcon size={12} className="text-mute group-hover:text-brand" />}
    </button>
  );
}

export function Meter({ value, tone = 'brand', className }) {
  const c = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', err: 'bg-err', cyan: 'bg-brand2' }[tone];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const Th = ({ children, className, ...p }) => (
  <th {...p} className={cx('whitespace-nowrap px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-mute/90', className)}>
    {children}
  </th>
);
export const Td = ({ children, className, ...p }) => (
  <td {...p} className={cx('px-3 py-2.5 align-middle text-[12.5px] text-fg/85', className)}>
    {children}
  </td>
);

/** <img> que some com elegância quando o asset falha (ex.: token expirado). */
export function SmartImg({ src, alt = '', className, ratio }) {
  const [err, setErr] = useState(false);
  const ref = useRef(null);
  useEffect(() => setErr(false), [src]);
  if (!src || err)
    return (
      <div className={cx('grid place-items-center bg-white/[0.03] text-[10px] uppercase tracking-widest text-mute/60', className)}>
        sem prévia
      </div>
    );
  return <img ref={ref} src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={className} />;
}

export const useKeys = (map) => {
  useEffect(() => {
    const h = (e) => {
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [map]);
};
