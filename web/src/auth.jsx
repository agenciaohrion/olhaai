/** Sessão do painel: quem está logado, qual empresa está em foco (seletor da agência). */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken, ApiError } from './api.js';
import { store } from './store.js';

const Ctx = createContext(null);
const SEL = 'olha.client';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, clients: [], client: null, ready: false });
  const [selected, setSelected] = useState(() => {
    const v = store.get(SEL);
    return v ? Number(v) : null;
  });

  const load = useCallback(async () => {
    if (!getToken()) {
      setState((s) => ({ ...s, ready: true }));
      return { user: null, why: 'sem token neste navegador' };
    }
    try {
      const d = await api('/auth/me', { quiet: true });
      // servidores mais velhos devolviam o usuário no nível de cima
      const u = d?.user || (d && d.email ? d : null);
      setState({ user: u, clients: d?.clients || [], client: d?.client, ready: true });
      return { user: u || null, why: u ? '' : 'a API respondeu sem usuário' };
    } catch (e) {
      setToken('');
      setState({ user: null, clients: [], client: null, ready: true });
      return { user: null, why: e?.message || 'a API recusou a sessão' };
    }
  }, []);

  useEffect(() => {
    load();
    const onLogout = () => setState({ user: null, clients: [], client: null, ready: true });
    window.addEventListener('olha:logout', onLogout);
    return () => window.removeEventListener('olha:logout', onLogout);
  }, [load]);

  useEffect(() => {
    store.set(SEL, selected ? String(selected) : '');
  }, [selected]);

  const login = useCallback(
    async (email, password) => {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      // sem essa guarda o clique vira "não faz nada": um proxy mal configurado devolve HTML
      // com status 200, não existe token, e o redirecionamento cai de volta no /login.
      if (!d || !d.token) throw new ApiError('a API respondeu sem token — o painel não está falando com o servidor (rode npm run demo)', 0);
      setToken(d.token);
      if (!getToken()) throw new ApiError('o navegador não guardou o token — dados/cookies deste site estão bloqueados; libere o armazenamento para este endereço', 0);
      const r = await load();
      if (!r.user) throw new ApiError(`login aceito, mas a sessão não montou: ${r.why}`, 0);
      return r.user;
    },
    [load]
  );

  const logout = useCallback(() => {
    setToken('');
    setState({ user: null, clients: [], client: null, ready: true });
  }, []);

  const role = state.user?.role;
  const focus = useMemo(() => {
    if (role === 'agency') return state.clients.find((c) => c.id === selected) || null;
    return state.user?.client_id || null;
  }, [role, state.clients, selected, state.user]);

  const value = {
    ...state,
    role,
    isAgency: role === 'agency',
    focusId: role === 'agency' ? focus?.id ?? null : state.user?.client_id ?? null,
    focusClient: role === 'agency' ? focus : state.client,
    clients: state.clients,
    setSelected,
    login,
    logout,
    refresh: load,
    /** false quando o navegador recusa guardar dados deste site */
    persistent: store.persistent,
    /** anexa client_id quando a agência filtrou uma empresa */
    q: (path = '') => {
      if (role !== 'agency' || !focus) return path;
      return path + (path.includes('?') ? '&' : '?') + 'client_id=' + focus.id;
    },
    /** corpo padrão para POSTs de agência (empresa em foco) */
    body: (obj = {}) => (role === 'agency' && focus && obj.client_id === undefined ? { ...obj, client_id: focus.id } : obj),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
