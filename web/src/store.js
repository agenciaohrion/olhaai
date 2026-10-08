/**
 * Armazenamento local à prova de navegador bravo.
 *
 * `localStorage` não é garantido: com cookies/dados do site bloqueados, em
 * aba anônima de alguns navegadores ou dentro de webview de app, acessar
 * `localStorage` **lança** — e um lançamento no primeiro render apaga o painel
 * inteiro (a pessoa vê só a tela preta). Aqui caios no storage e seguimos com
 * memória: a sessão vive enquanto a aba estiver aberta, sem quebrar nada.
 */
const mem = new Map();
let ls = null;
try {
  ls = globalThis.localStorage || null;
  if (ls) {
    ls.setItem('__olha_probe', '1');
    ls.removeItem('__olha_probe');
  }
} catch {
  ls = null;
}

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const store = {
  get(k) {
    return ls ? safe(() => ls.getItem(k), mem.get(k) ?? null) : (mem.get(k) ?? null);
  },
  set(k, v) {
    mem.set(k, v);
    if (ls) safe(() => ls.setItem(k, v), null);
  },
  del(k) {
    mem.delete(k);
    if (ls) safe(() => ls.removeItem(k), null);
  },
  /** false quando o navegador recusou guardar → avisamos na interface. */
  get persistent() {
    return !!ls;
  },
};
