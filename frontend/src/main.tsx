import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { ligarBotaoQueGrava } from './botao-que-grava';

/* O botão que grava (fase 265): uma vez, antes de qualquer tela. */
ligarBotaoQueGrava();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
