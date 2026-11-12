import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { ligarBotaoQueGrava } from './botao-que-grava';
import { BarreiraDeErro } from './barreira-de-erro';

/* O botão que grava (fase 265): uma vez, antes de qualquer tela. */
ligarBotaoQueGrava();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* A última barreira (fase 315): se o próprio App não se desenhar, a página
        diz o que houve e oferece recarregar, em vez de ficar em branco. */}
    <BarreiraDeErro alcance="sistema">
      <App />
    </BarreiraDeErro>
  </React.StrictMode>,
);
