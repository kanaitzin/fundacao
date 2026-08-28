import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * ARQUIVO DOCUMENTAL (Drive institucional).
 *
 * Não é backup do sistema: banco e arquivos têm backup técnico próprio. Aqui
 * vai a CÓPIA do que a instituição fechou — ATA, passagem, ocorrência,
 * acompanhamento, relatório.
 *
 * Duas coisas que a tela precisa dizer sem letra miúda:
 *
 *  * o educador não entra no Drive. Ele lê o que precisa no perfil do
 *    acolhido, onde a leitura tem permissão e registro. Uma pasta
 *    compartilhada não sabe quem abriu o quê;
 *  * nada é sobrescrito. Correção vira V2_ADENDO, ao lado da V1. E o nome do
 *    arquivo não carrega nome, CPF nem diagnóstico: pasta sincronizada em
 *    computador pessoal não pode virar vazamento por causa de um nome.
 */

interface Item {
  id: string; categoria: string; caminho: string; arquivo: string;
  estado: 'verificado' | 'salvo' | 'enviando' | 'aguardando' | 'falhou';
  restrito: boolean; tentativas: number; erro: string | null;
  fechadoEm: string; visivel: boolean;
}
interface Fila { itens: Item[]; falhas: number; naFila: number }
interface Documento {
  id: string; acolhido: string; categoria: string; titulo: string;
  versoes: { versao: number; arquivo: string; em: string; por: string; vigente: boolean }[];
}
interface Pessoa { id: string; nome: string }

const TOM: Record<string, string> = {
  verificado: 'c-ok', salvo: 'c-info', enviando: 'c-info',
  aguardando: 'c-warn', falhou: 'c-crit',
};
const ROTULO: Record<string, string> = {
  verificado: 'Verificado no Drive', salvo: 'Salvo', enviando: 'Enviando',
  aguardando: 'Na fila', falhou: 'Falhou',
};
const CATEGORIA_DOC: Record<string, string> = {
  saude: 'Saúde', escolar: 'Escolar', pessoal: 'Pessoal',
  judicial_socioassistencial: 'Judicial e socioassistencial',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Arquivo() {
  const [aba, setAba] = useState<'fila' | 'documentos'>('fila');
  const [fila, setFila] = useState<Fila | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [filtro, setFiltro] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregar() {
    setErro('');
    try {
      const [f, d, p] = await Promise.all([
        api<Fila>('/archive'),
        api<Documento[]>('/archive/documents'),
        api<Pessoa[]>('/people').catch(() => [] as Pessoa[]),
      ]);
      setFila(f); setDocumentos(d); setPessoas(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
  }

  const docsFiltrados = filtro
    ? documentos.filter((d) => d.acolhido === pessoas.find((p) => p.id === filtro)?.nome)
    : documentos;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso('')}>
            Entendi
          </button>
        </div>
      )}

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Arquivo documental</h3>
        <div className="mutetxt">Cópia do que fechou, no Drive institucional.</div>
        <div className="notice c-info">
          Não é backup do sistema — banco e arquivos têm backup técnico próprio. Aqui vai
          a cópia documental do que a instituição <b>fechou</b>: ATA, passagem,
          ocorrência, acompanhamento, relatório.
        </div>
        <div className="notice c-med">
          O <b>educador social não abre o Drive</b>. O que ele precisa ler do acolhido
          está no perfil, onde a leitura tem permissão e deixa registro — pasta
          compartilhada não sabe quem abriu o quê.
        </div>
        {fila && (
          fila.falhas > 0
            ? <div className="notice c-crit">
                {fila.falhas} documento(s) fechado(s) ainda não chegaram ao arquivo.
                O documento continua íntegro no sistema; o que faltou foi a cópia.
              </div>
            : <div className="notice c-ok">Tudo o que fechou está arquivado e verificado.</div>
        )}
      </div>

      <div className="filtros" role="tablist" aria-label="Seções do arquivo">
        <button role="tab" aria-selected={aba === 'fila'} className={aba === 'fila' ? 'on' : ''}
                onClick={() => setAba('fila')}>
          Fila de envio{fila?.naFila ? ` · ${fila.naFila}` : ''}
        </button>
        <button role="tab" aria-selected={aba === 'documentos'}
                className={aba === 'documentos' ? 'on' : ''}
                onClick={() => setAba('documentos')}>Documentos por acolhido</button>
      </div>

      {aba === 'fila' && fila && (
        <>
          <div className="stack">
            {fila.itens.map((a) => (
              <div className="card stack" key={a.id}>
                <div className="row">
                  <span className="pill c-mute">{a.categoria}</span>
                  <span className="grow" />
                  <span className={`pill ${TOM[a.estado]}`}>{ROTULO[a.estado]}</span>
                </div>
                {a.visivel ? (
                  <>
                    <b className="ff mono" style={{ fontSize: 13 }}>{a.arquivo}</b>
                    <div className="mutetxt mono">{a.caminho}</div>
                  </>
                ) : (
                  <div className="mutetxt">
                    🔒 Documento em área restrita — outra raiz, outra permissão. Seu cargo
                    vê que ele existe, e não o que ele diz.
                  </div>
                )}
                <div className="mutetxt">Fechado em {quando(a.fechadoEm)}.</div>
                {a.restrito && a.visivel && (
                  <div className="mutetxt">🔒 Área restrita — outra raiz, outra permissão.</div>
                )}
                {a.estado === 'falhou' && (
                  <div className="notice c-crit">
                    {a.tentativas} tentativas · {a.erro}. A equipe técnica e a coordenação
                    foram avisadas. <b>O documento continua íntegro no sistema</b> — o que
                    faltou foi a cópia no Drive.
                    <button className="btn sm" style={{ marginTop: 8 }}
                            onClick={() => acao(() => api(`/archive/${a.id}/retry`, {
                              method: 'POST', body: '{}' }))}>
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            Nunca sobrescreve: correção vira <b>V2_ADENDO</b>, ao lado da V1. O nome do
            arquivo não carrega nome, CPF nem diagnóstico — quem precisa saber de quem é
            abre o sistema.
          </p>
        </>
      )}

      {aba === 'documentos' && (
        <>
          <label className="f" htmlFor="filtro-doc">Acolhido</label>
          <select id="filtro-doc" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>

          <div className="stack" style={{ marginTop: 12 }}>
            {docsFiltrados.map((d) => (
              <div className="card stack" key={d.id}>
                <div className="row">
                  <b className="ff grow">{d.titulo}</b>
                  <span className="pill c-brand">{d.acolhido}</span>
                  <span className="pill c-mute">
                    {CATEGORIA_DOC[d.categoria] ?? d.categoria}
                  </span>
                </div>
                <ul className="lista">
                  {d.versoes.map((v) => (
                    <li key={v.versao} className="row">
                      <span className="grow">
                        <b className="ff mono" style={{ fontSize: 12.5 }}>{v.arquivo}</b>
                        <div className="mutetxt">
                          Versão {v.versao} · {v.por} · {quando(v.em)}
                        </div>
                      </span>
                      <span className={`pill ${v.vigente ? 'c-ok' : 'c-mute'}`}>
                        {v.vigente ? 'Em vigência' : 'Versão anterior'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {docsFiltrados.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhum documento arquivado para este acolhido.
              </p></div>
            )}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            A versão anterior continua no arquivo, legível, mesmo depois de substituída.
            Documento não é apagado: ele deixa de estar em vigência.
          </p>
        </>
      )}
    </>
  );
}
