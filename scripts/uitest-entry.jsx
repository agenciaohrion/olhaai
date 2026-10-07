/** Entry usado pelo scripts/uitest.mjs: monta o App dentro do jsdom sob uma rota dada. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../web/src/auth.jsx';
import App from '../web/src/App.jsx';

window.__olhaTest = {
  render(route) {
    const el = document.getElementById('root');
    el.innerHTML = '';
    const root = createRoot(el);
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [route] },
        React.createElement(AuthProvider, null, React.createElement(App))
      )
    );
    return new Promise((r) => setTimeout(r, 0));
  },
};
