/** Entry usado pelo scripts/uitest.mjs: monta a MESMA árvore que o navegador monta (root.jsx). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from '../web/src/root.jsx';

window.__olhaTest = {
  render(route) {
    const el = document.getElementById('root');
    el.innerHTML = '';
    const root = createRoot(el);
    root.render(React.createElement(React.StrictMode, null, React.createElement(Root, { route })));
    return new Promise((r) => setTimeout(r, 0));
  },
};
