/**
 * VER ANTES DE BAIXAR, E BAIXAR O QUE SE VIU.
 *
 * Duas coisas que a casa pediu e que o sistema não tinha:
 *
 *  * uma PRÉ-VISUALIZAÇÃO rápida — abrir a folha, olhar, fechar. Sem isso,
 *    conferir um documento significa baixar, achar na pasta de downloads,
 *    abrir o Word, e a pessoa acaba não conferindo;
 *  * o DOWNLOAD do que cada setor precisa levar em papel: a enfermagem, a
 *    situação de saúde de um acolhido ou a grade da casa; a equipe técnica, a
 *    ATA e os registros; a coordenação e a gestão, tudo.
 *
 * A folha de baixo é a MESMA estrutura que vira o .docx (`docx.ts`): a
 * pré-visualização não é uma segunda versão do documento, é o mesmo documento
 * desenhado na tela. Duas versões divergiriam no primeiro ajuste, e a pessoa
 * conferiria uma coisa e entregaria outra.
 *
 * QUEM PODE BAIXAR não é decidido aqui: cada botão vive dentro da tela do
 * setor, e a tela já é filtrada pelo alcance do cargo. Uma lista de permissões
 * paralela seria uma segunda verdade sobre quem alcança o quê.
 */
import { useState } from 'react';
import { nomeDeArquivo } from './docx';
import type { DocumentoWord } from './docx';

/** O que a rota de exportação devolve. */
export interface ArquivoGerado {
  nomeArquivo: string;
  conteudoBase64: string;
  aviso: string;
}

/**
 * Entrega ao navegador um arquivo qualquer vindo do servidor — anexo do
 * diário, comprovante de conquista, documento do dossiê. O tipo vem de lá,
 * porque foi lá que a assinatura do arquivo foi conferida na entrada.
 */
export function baixarArquivo(nome: string, tipo: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome || 'documento';
  a.click();
  URL.revokeObjectURL(url);
}

/** Entrega ao navegador o arquivo que o servidor gerou. */
export function entregarArquivo(nome: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome || nomeDeArquivo('documento');
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A FINALIDADE, ANTES DO ARQUIVO.
 *
 * O servidor exige uma frase de no mínimo dez caracteres para exportar, e a
 * exigência não é burocracia: é ela que responde, meses depois, por que existe
 * uma cópia desta ATA fora do sistema. A tela pergunta antes de chamar a rota
 * para a recusa não chegar depois de a pessoa achar que baixou.
 */
function FolhaFinalidade({ titulo, onFechar, onConfirmar }: {
  titulo: string; onFechar: () => void; onConfirmar: (finalidade: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const pode = texto.trim().length >= 10;
  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>Para que você precisa desta cópia?</h3>
        <p className="mutetxt">
          {titulo}. A saída fica registrada com o seu nome, a finalidade e o horário — o
          documento sai do sistema e passa a viver no papel.
        </p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: levar à audiência de 12/09; entregar à equipe da escola." />
        <div className="acoes">
          <button className="btn" disabled={!pode} onClick={() => onConfirmar(texto.trim())}>
            Gerar o documento
          </button>
          <button className="btn sec" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A folha na tela: papel, e não formulário. Quem abre precisa reconhecer o
 * documento que vai sair da impressora.
 */
export function FolhaDocumento({ doc, onFechar, onBaixar, exportar }: {
  doc: DocumentoWord; onFechar: () => void;
  /**
   * QUEM CHAMA A ROTA É A TELA, e não esta folha.
   *
   * A primeira versão recebia a rota como texto e chamava `api(rotaExport)`.
   * Compilava e funcionava — e escondia as cinco rotas de exportação do
   * `contrato-rotas.spec`, que confere as chamadas do frontend contra as
   * rotas do servidor lendo o código. Foi ele quem pegou, no mesmo dia.
   * Rota escrita por extenso, na tela que a chama: duas linhas custam menos
   * que um 404 na casa às onze da noite.
   *
   * Sem esta função o botão de baixar não aparece: uma folha que se deixa
   * baixar sem passar pelo servidor é uma cópia que saiu sem registro.
   */
  exportar?: (finalidade: string) => Promise<ArquivoGerado>;
  /**
   * Quando o download precisa passar pelo servidor — porque a exportação é um
   * ato auditado, com finalidade declarada —, a tela entrega a própria função
   * e a folha não gera o arquivo por conta própria. Gerar aqui pularia o
   * registro, e o registro é o que responde "quem tirou este documento do
   * sistema?" seis meses depois.
   */
  onBaixar?: () => void;
}) {
  const [pedindo, setPedindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-doc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-doc">Pré-visualização · {doc.titulo}</h3>
        <p className="mutetxt" style={{ marginTop: 0 }}>
          É exatamente esta folha que sai no arquivo do Word, com o timbre da Fundação.
        </p>

        <div className="papel">
          <div className="papel-timbre">
            <b>FUNDAÇÃO O PÃO DOS POBRES DE SANTO ANTÔNIO</b>
            <span>Programa de Acolhimento Institucional · Porto Alegre — RS</span>
          </div>

          {doc.rascunho && (
            <p className="papel-rascunho">
              RASCUNHO — documento sem aprovação. Não deve ser entregue.
            </p>
          )}

          <h4 className="papel-titulo">{doc.titulo}</h4>
          {doc.subtitulo && <p className="papel-sub">{doc.subtitulo}</p>}

          {doc.identificacao.length > 0 && (
            <>
              <h5 className="papel-secao">1  Identificação</h5>
              {doc.identificacao.map((i) => (
                <p className="papel-ident" key={i.rotulo}>
                  <b>{i.rotulo}:</b> {i.valor}
                </p>
              ))}
            </>
          )}

          {doc.secoes.map((s, n) => (
            <div key={s.titulo + n}>
              <h5 className="papel-secao">
                {(doc.identificacao.length ? n + 2 : n + 1)}  {s.titulo}
              </h5>
              {(s.paragrafos ?? []).map((p, i) => <p className="papel-par" key={i}>{p}</p>)}
              {(s.itens ?? []).length > 0 && (
                <ul className="papel-itens">
                  {s.itens!.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              )}
              {s.tabela && (
                <div className="rolar">
                  <table className="papel-tabela">
                    <thead>
                      <tr>{s.tabela.cabecalho.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {s.tabela.linhas.map((l, i) => (
                        <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.aPreencher && (
                <>
                  <p className="papel-preencher">[a preencher — {s.aPreencher}]</p>
                  <div className="papel-linha" /><div className="papel-linha" />
                </>
              )}
              {s.procedencia && <p className="papel-fonte">Fonte: {s.procedencia}</p>}
            </div>
          ))}

          {doc.ressalva && <p className="papel-fonte">{doc.ressalva}</p>}

          {doc.assinatura !== false && (
            <div className="papel-assina">
              <div className="papel-linha" />
              <b>{doc.geradoPor}</b>
              <span>{doc.cargo}</span>
            </div>
          )}
        </div>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Fechar</button>
          {(onBaixar || exportar) && (
            <button className="btn grow" disabled={ocupado}
                    onClick={() => (onBaixar ? onBaixar() : setPedindo(true))}>
              {ocupado ? 'Gerando…' : 'Baixar em Word'}
            </button>
          )}
        </div>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}
      </div>

      {pedindo && exportar && (
        <FolhaFinalidade
          titulo={doc.titulo}
          onFechar={() => setPedindo(false)}
          onConfirmar={async (finalidade) => {
            setPedindo(false); setOcupado(true); setErro(''); setAviso('');
            try {
              const r = await exportar(finalidade);
              entregarArquivo(r.nomeArquivo, r.conteudoBase64);
              setAviso(r.aviso);
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível gerar o documento.');
            } finally {
              setOcupado(false);
            }
          }}
        />
      )}
    </div>
  );
}

/*
 * OS MONTADORES SAÍRAM DAQUI — 02/09/2026.
 *
 * Até esta data, a folha da ATA, da ocorrência, da saúde, da grade e dos
 * combinados era montada nesta tela, e o .docx era escrito no navegador.
 * Funcionava, e deixava o sistema sem resposta para a pergunta que importa
 * meses depois: **quem tirou esta cópia daqui, e para quê?** Arquivo gerado
 * no navegador não passa por auditoria nenhuma.
 *
 * Agora cada partição do servidor monta a folha do documento que é dela
 * (`ata-folha.ts`, `ocorrencia-folha.ts`, `saude-folha.ts`, `grade-folha.ts`,
 * `combinados-folha.ts`), e o kernel a transforma em .docx registrando a
 * saída. A tela pede a folha e a desenha; o download passa pelo servidor e
 * exige a finalidade escrita.
 */
