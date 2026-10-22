/**
 * Armazenamento local à prova de navegador bravo.
 *
 * `localStorage` não é garantido: com cookies/dados do site bloqueados, em aba anônima
 * de alguns navegadores ou dentro de webview de app, ele se comporta de três jeitos:
 *
 *   1. acessar **lança** — o mais documentado, e o motivo deste arquivo (um lançamento no
 *      primeiro render deixava a pessoa com a tela preta);
 *   2. `setItem` lança e `getItem` devolve `null` — o navegador finge que funciona;
 *   3. `setItem` é ignorado e `getItem` devolve `null` — o pior, porque nada explode e a
 *      escrita simplesmente não existe. É assim que um login "aceito" não monta sessão:
 *      o token entra aqui, sai `null` na leitura seguinte, e o /auth/me vai sem
 *      Authorization.
 *
 * Então: escrevemos nos dois lugares, lemos do que tiver valor, e só dizemos que é
 * persistente depois de conferir que o que guardamos volta igual.
 */
const mem = new Map();

const read = (k) => {
  try {
    return mem.get(k) ?? null;
  } catch {
    return null;
  }
};

let ls = null;
try {
  const probe = globalThis.localStorage;
  if (probe) {
    probe.setItem('__olha_probe', '1');
    // não basta não lançar: precisa voltar o que a gente escreveu
    if (probe.getItem('__olha_probe') === '1') ls = probe;
    probe.removeItem('__olha_probe');
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
    if (ls) {
      const v = safe(() => ls.getItem(k), null);
      if (v != null && v !== '') return v;
    }
    return read(k);
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
