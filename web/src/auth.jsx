/** Sessão do painel: quem está logado, qual empresa está em foco (seletor da agência). */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken } from './api.js';
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
    if (!getToken()) return setState((s) => ({ ...s, ready: true }));
    try {
      const d = await api('/auth/me', { quiet: true });
      setState({ user: d.user, clients: d.clients || [], client: d.client, ready: true });
    } catch {
      setToken('');
      setState({ user: null, clients: [], client: null, ready: true });
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
      setToken(d.token);
      await load();
      return d.user;
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
