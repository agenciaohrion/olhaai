import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

/** Erro de render não some mais: aparece escrito na tela, com o caminho. */
class Boundary extends React.Component {
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
          <a href="/" style={{ color: '#7c5cff' }}>Recarregar</a> costuma resolver; se repetir, mande esta tela para quem mantém o sistema.
        </p>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Boundary>
  </React.StrictMode>
);
