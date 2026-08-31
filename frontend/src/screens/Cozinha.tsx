import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * COZINHA — uma tela só, e é isso que a torna certa.
 *
 * O servidor já tinha o relatório (`GET /reports/kitchen`), com uma projeção
 * deliberadamente pobre: nome, o que evitar, a substituição orientada e quando
 * revisar. **Não havia tela.** E, sem tela própria, a cozinha entrava no
 * sistema inteiro — Dia, Chamada, Acolhidos, Passagem, Ocorrências, ATA. Quem
 * cozinha passou a enxergar o caso de cada criança para saber que a Alice não
 * come amendoim.
 *
 * O que esta tela recusa mostrar, e o servidor recusa devolver:
 *
 *  * o MOTIVO da restrição. "Alergia a amendoim" é a restrição; se é alergia
 *    grave, intolerância ou orientação de uma consulta, não é assunto da
 *    cozinha, e saber disso muda o olhar sobre a criança sem mudar o prato;
 *  * CPF, diagnóstico, caso, histórico, ocorrência — nada disso passa;
 *  * o nome civil. A lista traz o nome pelo qual a criança é chamada.
 *
 * A substituição está aqui de propósito: dizer "não pode" sem dizer "serve
 * isto no lugar" transfere para a cozinha uma decisão que é da equipe técnica
 * — e é assim que uma criança fica sem sobremesa em vez de comer outra.
 */

interface Restricao {
  nome: string;
  evitar: string;
  substituicao: string | null;
  orientacao: string | null;
  revisarEm: string | null;
}

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function Cozinha({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [lista, setLista] = useState<Restricao[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      setErro(''); setCarregando(true);
      try {
        setLista(await api<Restricao[]>(`/reports/kitchen?houseId=${houseId}`));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as restrições.');
      } finally { setCarregando(false); }
    })();
  }, [houseId]);

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Restrições alimentares · {casaLabel}</h3>
        <div className="mutetxt">O que não pode ser servido hoje, e o que serve no lugar.</div>
        <div className="notice c-info">
          Esta lista mostra a <b>restrição</b>, não a razão dela. O motivo é assunto da
          equipe técnica e da Enfermagem — e saber o motivo mudaria o olhar sobre a criança
          sem mudar o prato.
        </div>
      </div>

      {carregando && <p className="mutetxt">Carregando…</p>}

      <div className="eyebrow">Acolhidos com restrição · {lista.length}</div>
      <div className="stack">
        {lista.map((r) => (
          <div className="card stack" key={r.nome + r.evitar}>
            <div className="row">
              <b className="ff grow" style={{ fontSize: 16 }}>{r.nome}</b>
              {r.revisarEm && (
                <span className="pill c-mute">revisar em {dia(r.revisarEm)}</span>
              )}
            </div>
            <div className="bloco destaque"><small>Não servir</small>{r.evitar}</div>
            {r.substituicao
              ? <div className="bloco"><small>Servir no lugar</small>{r.substituicao}</div>
              : (
                <div className="notice c-warn" style={{ margin: 0 }}>
                  <b>Sem substituição orientada.</b> Pergunte à equipe técnica antes de
                  decidir sozinha o que servir — a criança não pode ficar sem.
                </div>
              )}
            {r.orientacao && <div className="mutetxt">{r.orientacao}</div>}
          </div>
        ))}

        {!carregando && lista.length === 0 && (
          <div className="card">
            <p className="mutetxt" style={{ margin: 0 }}>
              <b>Nenhuma restrição registrada nesta casa hoje.</b> Isso não quer dizer
              "pode tudo": quer dizer que ninguém registrou. Se você souber de alguma,
              avise a equipe técnica — a lista vem do perfil da criança, e é lá que ela
              se corrige.
            </p>
          </div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        A lista muda quando a equipe técnica muda o perfil da criança. Ela vale para
        <b> esta casa</b> e para o dia de hoje; confira de novo a cada turno.
      </p>
    </>
  );
}
