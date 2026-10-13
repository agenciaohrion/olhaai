/**
 * Árvore raiz do painel: erro-filtro + roteador + sessão + App.
 *
 * Existe como módulo próprio porque o main.jsx e o teste de UI precisam montar
 * EXATAMENTE a mesma coisa — quando o teste enrolava o AuthProvider por conta
 * própria, o navegador quebrava sozinho no primeiro useAuth() e nada acusava.
 */
import React from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';

/** Erro de render não some mais: aparece escrito na tela, com o caminho. */
export class Boundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    console.error('[painel]', err);
  }
  reset = () => this.setState({ err: null });
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto', fontSize: 15, lineHeight: 1.7 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Uma tela quebrou</h1>
        <p style={{ color: '#f87171', fontFamily: 'ui-monospace,monospace', whiteSpace: 'pre-wrap' }}>
          {String(this.state.err?.message || this.state.err)}
        </p>
        <p style={{ color: '#8d98c4' }}>
          Isso é defeito do painel, não do seu aparelho.{' '}
          <a href="/" style={{ color: '#7c5cff' }}>
            Recarregar
          </a>{' '}
          costuma resolver; se repetir, mande esta tela para quem mantém o sistema.
        </p>
        <p style={{ marginTop: 12 }}>
          <button
            onClick={() => this.reset()}
            style={{ background: '#141a33', color: '#e9ecff', border: '1px solid #26304f', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            tentar de novo sem recarregar
          </button>
        </p>
      </div>
    );
  }
}

export default function Root({ route } = {}) {
  const Router = route ? MemoryRouter : BrowserRouter;
  const routerProps = route ? { initialEntries: [route] } : {};
  return (
    <Boundary>
      <Router {...routerProps}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </Boundary>
  );
}
