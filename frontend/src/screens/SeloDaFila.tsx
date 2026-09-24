import { useEffect, useState } from 'react';
import {
  observarFila, filaAtual, sincronizar, descartar, tentarDeNovo,
  type EstadoDaFila, type OperacaoLocal,
} from '../fila-offline';
import { tipoOffline } from '../../../backend/src/modules/sync/tipos-offline';
import { Icone } from '../icones';

/**
 * O QUE ESTE APARELHO AINDA NÃO MANDOU (§17.1, §17.2).
 *
 * Uma fila invisível é pior do que não ter fila: a educadora registra o
 * jantar sem sinal, o aviso some da tela em três segundos e ela passa a noite
 * sem saber se aquilo existe em algum lugar. O selo fica no alto enquanto
 * houver coisa guardada, e some sozinho quando tudo subiu.
 *
 * Três decisões de tela:
 *
 *  * **o selo não é um alerta.** Guardar sem sinal é o sistema funcionando
 *    como foi desenhado, não uma falha da pessoa. Vermelho fica para o que
 *    parou e precisa de gente;
 *  * **"parado" e "pendente" são coisas diferentes.** Pendente sobe sozinho.
 *    Parado é conflito ou recusa: alguém precisa ler a frase do servidor;
 *  * **nada é apagado por aqui sem ato declarado.** Descartar é a última
 *    saída, aparece só no que já parou, e escreve na tela o que se perde.
 */
export function SeloDaFila() {
  const [estado, setEstado] = useState<EstadoDaFila | null>(null);
  const [aberta, setAberta] = useState(false);

  useEffect(() => observarFila(setEstado), []);

  if (!estado) return null;
  const total = estado.pendentes + estado.paradas;
  if (!total && estado.online) return null;

  return (
    <>
      <button
        className="iconbtn fila"
        title={estado.online ? 'O que ainda não subiu deste aparelho' : 'Sem internet'}
        aria-label={
          !estado.online
            ? `Sem internet. ${total} registro(s) guardados neste aparelho.`
            : `${total} registro(s) ainda não enviados`
        }
        onClick={() => setAberta(true)}
      >
        <Icone nome={estado.online ? 'enviar' : 'sem_sinal'} />
        {total > 0 && <span className="badge">{total > 9 ? '9+' : total}</span>}
      </button>
      {aberta && <FolhaDaFila estado={estado} onFechar={() => setAberta(false)} />}
    </>
  );
}

function FolhaDaFila({ estado, onFechar }: { estado: EstadoDaFila; onFechar: () => void }) {
  const [itens, setItens] = useState<OperacaoLocal[]>(filaAtual());
  const [descartando, setDescartando] = useState<OperacaoLocal | null>(null);

  useEffect(() => observarFila(() => setItens(filaAtual())), []);

  const pendentes = itens.filter((o) => o.status === 'pendente');
  const paradas = itens.filter((o) => o.status !== 'pendente');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-fila"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-fila">Guardado neste aparelho</h3>

        {!estado.online && (
          <p className="mutetxt">
            Sem internet agora. O que você registrar continua sendo guardado aqui, com a
            hora em que aconteceu, e sobe sozinho quando a conexão voltar.
          </p>
        )}

        {!itens.length && (
          <p className="mutetxt">
            Nada guardado. Tudo o que você registrou neste aparelho já chegou ao servidor.
          </p>
        )}

        {pendentes.length > 0 && (
          <>
            <div className="eyebrow">Esperando conexão · {pendentes.length}</div>
            <div className="stack">
              {pendentes.map((o) => <Linha key={o.clientOpId} op={o} />)}
            </div>
          </>
        )}

        {paradas.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginTop: 16 }}>
              Parado, esperando alguém · {paradas.length}
            </div>
            {/*
              * O servidor não descarta o que não conseguiu aplicar: ele guarda
              * as duas versões e pede a frase da equipe (§17.4). Aqui a pessoa
              * do plantão vê o motivo e sabe a quem contar.
              */}
            <p className="mutetxt">
              O servidor recebeu e não conseguiu aplicar. O motivo está em cada linha.
              A equipe técnica e a coordenação resolvem isso em Mais → Sincronização.
            </p>
            <div className="stack">
              {paradas.map((o) => (
                <Linha key={o.clientOpId} op={o}
                       onTentar={() => void tentarDeNovo(o.clientOpId)}
                       onDescartar={() => setDescartando(o)} />
              ))}
            </div>
          </>
        )}

        {estado.ultimoErro && <p className="mutetxt">Última tentativa: {estado.ultimoErro}</p>}

        <div className="acoes" style={{ marginTop: 16 }}>
          <button className="btn" disabled={estado.enviando || !pendentes.length}
                  onClick={() => void sincronizar()}>
            {estado.enviando ? 'Enviando…' : 'Tentar enviar agora'}
          </button>
          <button className="btn sec" onClick={onFechar}>Fechar</button>
        </div>
      </div>

      {descartando && (
        <div className="overlay" role="dialog" aria-modal="true"
             onClick={(e) => { if (e.target === e.currentTarget) setDescartando(null); }}>
          <div className="sheet">
            <h3>Descartar este registro?</h3>
            <p>
              <b>{tipoOffline(descartando.kind)?.rotulo ?? descartando.kind}</b>, de{' '}
              {new Date(descartando.happenedAt).toLocaleString('pt-BR')}.
            </p>
            <p className="mutetxt">
              Ele sai deste aparelho e não vai existir em lugar nenhum. Se o que aconteceu
              precisa ficar registrado, escreva de novo pela tela em vez de descartar.
            </p>
            <div className="acoes">
              <button className="btn"
                      onClick={() => { void descartar(descartando.clientOpId); setDescartando(null); }}>
                Descartar
              </button>
              <button className="btn sec" onClick={() => setDescartando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ op, onTentar, onDescartar }: {
  op: OperacaoLocal; onTentar?: () => void; onDescartar?: () => void;
}) {
  const rotulo = tipoOffline(op.kind)?.rotulo ?? op.kind;
  const quando = new Date(op.happenedAt);
  return (
    <div className="card">
      <b className="ff">{rotulo}</b>
      <div className="mutetxt">
        Aconteceu {quando.toLocaleString('pt-BR')}
        {op.tentativas > 0 && ` · ${op.tentativas} tentativa(s)`}
      </div>
      {op.motivo && <div className="estado"><span className="pill c-warn">{op.motivo}</span></div>}
      {(onTentar || onDescartar) && (
        <div className="acoes">
          {onTentar && <button className="btn sm" onClick={onTentar}>Tentar de novo</button>}
          {onDescartar && <button className="btn sm ghost" onClick={onDescartar}>Descartar</button>}
        </div>
      )}
    </div>
  );
}
