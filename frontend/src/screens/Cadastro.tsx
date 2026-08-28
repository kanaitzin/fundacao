import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api';

/**
 * CADASTRO COMPLETO DO ACOLHIDO (§6.1, §13.1).
 *
 * É a tela da primeira semana do piloto: vinte perfis migrados do papel, dois
 * por dia, pela equipe técnica, lendo o prontuário. E é a tela do pior
 * momento possível — a criança que chega às 23h, sem documento, com o
 * Conselho Tutelar na porta.
 *
 * As duas situações puxam para lados opostos, e o formulário atende as duas
 * assim:
 *
 *  * **em quatro passos, não numa página só.** Vinte e cinco campos numa
 *    rolagem é o formulário que ninguém termina. Em blocos, cada passo cabe
 *    na tela e quem parou sabe onde parou;
 *  * **o CPF é conferido ANTES de digitar o resto** (§6.1). Se a criança já
 *    tem perfil, cadastrar de novo cria um segundo histórico para a mesma
 *    pessoa — e o histórico partido é o que faz a audiência perguntar coisas
 *    que o sistema deveria saber;
 *  * **sem CPF, entra assim mesmo.** A criança não espera documento. Entra
 *    com ID provisório e uma pendência que não some;
 *  * **casa cheia não bloqueia: pede uma decisão escrita.** Ninguém devolve
 *    criança na porta porque o sistema disse não. Acolhe, e a justificativa
 *    fica registrada com o nome de quem decidiu.
 */

interface Opcoes {
  motivos: { cod: string; label: string }[];
  orgaos: { cod: string; label: string }[];
  medidas: { cod: string; label: string }[];
}
interface Ocupacao {
  capacidade: number; ocupadas: number; vagas: number; acimaDoLimite: boolean;
}
interface ConfereCpf { situacao: string; personId: string | null; acao: string }

const PASSOS = ['Quem é', 'A chegada', 'O que determinou', 'Conferir'] as const;

/** O que o servidor responde ao conferir o CPF, e o que a tela faz com isso. */
const CPF_BLOQUEIA: Record<string, boolean> = {
  livre: false, no_acervo: true, ativo_mesma_casa: true, ativo_outra_casa: true,
};

export function Cadastro({ houseId, casaLabel, onPronto }: {
  houseId: string; casaLabel: string; onPronto: (personId: string, aviso: string) => void;
}) {
  const [passo, setPasso] = useState(0);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Bloco 1 — quem é
  const [cpf, setCpf] = useState('');
  const [confere, setConfere] = useState<ConfereCpf | null>(null);
  const [semCpf, setSemCpf] = useState(false);
  const [motivoSemCpf, setMotivoSemCpf] = useState('');
  const [fullName, setFullName] = useState('');
  const [socialName, setSocialName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [race, setRace] = useState('');
  const [birthplace, setBirthplace] = useState('');
  const [nis, setNis] = useState('');
  const [civilRegistry, setCivilRegistry] = useState('');

  // Bloco 2 — a chegada
  const [admittedOn, setAdmittedOn] = useState(hoje());
  const [broughtBy, setBroughtBy] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [previousShelter, setPreviousShelter] = useState('');
  const [siblingsNote, setSiblingsNote] = useState('');
  const [familyReference, setFamilyReference] = useState('');
  const [arrivalNote, setArrivalNote] = useState('');
  const [essentialCare, setEssentialCare] = useState('');
  const [capacityReason, setCapacityReason] = useState('');

  // Bloco 3 — o que determinou (área restrita)
  const [reasonCategory, setReasonCategory] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [measureType, setMeasureType] = useState('acolhimento_institucional');
  const [determiningBody, setDeterminingBody] = useState('');
  const [courtName, setCourtName] = useState('');
  const [processNumber, setProcessNumber] = useState('');
  const [guideNumber, setGuideNumber] = useState('');
  const [guideDate, setGuideDate] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setOpcoes(await api<Opcoes>('/people/admission/options'));
        setOcupacao(await api<Ocupacao>(`/houses/${houseId}/occupancy`));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível preparar o cadastro.');
      }
    })();
  }, [houseId]);

  const cheia = !!ocupacao && ocupacao.vagas <= 0;

  async function conferirCpf() {
    setErro(''); setConfere(null); setOcupado(true);
    try {
      setConfere(await api<ConfereCpf>('/people/check-cpf', {
        method: 'POST', body: JSON.stringify({ cpf }),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível conferir o CPF.');
    } finally {
      setOcupado(false);
    }
  }

  const cpfResolvido = semCpf
    ? motivoSemCpf.trim().length >= 10
    : (confere !== null && !CPF_BLOQUEIA[confere.situacao]);

  const podeAvancar = [
    cpfResolvido && fullName.trim().length >= 3 && birthDate !== '',
    admittedOn !== '' && (!cheia || capacityReason.trim().length >= 15),
    reasonCategory !== '' && determiningBody !== '',
    true,
  ][passo];

  async function enviar() {
    setOcupado(true); setErro('');
    try {
      const r = await api<{ personId: string; aviso?: string }>('/people/admission', {
        method: 'POST',
        body: JSON.stringify({
          houseId,
          pessoa: {
            cpf: semCpf ? '' : cpf, fullName: fullName.trim(),
            socialName: socialName.trim() || undefined, birthDate,
            gender: gender || undefined, race: race || undefined,
            birthplace: birthplace.trim() || undefined, nis: nis.trim() || undefined,
            civilRegistry: civilRegistry.trim() || undefined,
            essentialCare: essentialCare.trim() || undefined,
          },
          acolhimento: {
            admittedOn, broughtBy: broughtBy.trim() || undefined,
            originCity: originCity.trim() || undefined,
            previousShelter: previousShelter.trim() || undefined,
            siblingsNote: siblingsNote.trim() || undefined,
            familyReference: familyReference.trim() || undefined,
            arrivalNote: arrivalNote.trim() || undefined,
            provisionalReason: semCpf ? motivoSemCpf.trim() : undefined,
            capacityReason: capacityReason.trim() || undefined,
          },
          judicial: {
            reasonCategory, reasonDetail: reasonDetail.trim() || undefined,
            measureType, determiningBody,
            courtName: courtName.trim() || undefined,
            processNumber: processNumber.trim() || undefined,
            guideNumber: guideNumber.trim() || undefined,
            guideDate: guideDate || undefined,
          },
        }),
      });
      onPronto(r.personId, r.aviso ?? 'Acolhido cadastrado.');
    } catch (e) {
      // 409 é a casa no limite: o servidor está pedindo a decisão escrita, e a
      // tela leva de volta ao passo onde ela se escreve — não é recusa.
      //
      // A ocupação é relida junto, e não por capricho: a vaga pode ter sido
      // ocupada por outra pessoa enquanto este formulário estava aberto. Sem
      // reler, a tela voltaria ao passo 2 sem o campo da justificativa —
      // mandando preencher algo que ela mesma não mostra.
      if (e instanceof ErroApi && e.status === 409) {
        setPasso(1);
        try { setOcupacao(await api<Ocupacao>(`/houses/${houseId}/occupancy`)); } catch { /* mantém o que tinha */ }
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível cadastrar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2>Cadastrar acolhido</h2>
        </div>
        {ocupacao && (
          <div className="resumo">
            <span className={`pill ${cheia ? 'c-warn' : 'c-info'}`}>
              {ocupacao.ocupadas} de {ocupacao.capacidade}
            </span>
          </div>
        )}
      </div>

      {/* Os quatro passos ficam à vista: quem parou no meio sabe onde parou, e
          quem está com pressa vê quanto falta. */}
      <nav className="filtros" aria-label="Passos do cadastro">
        {PASSOS.map((p, i) => (
          <button key={p} className={passo === i ? 'on' : ''} aria-pressed={passo === i}
                  disabled={i > passo} onClick={() => setPasso(i)}>
            {i + 1}. {p}
          </button>
        ))}
      </nav>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {passo === 0 && (
        <section className="passagem">
          <div className="eyebrow">Antes de tudo: esta criança já tem perfil?</div>
          <div className="card">
            <p className="mutetxt" style={{ marginTop: 0 }}>
              Cadastrar de novo quem já tem perfil parte o histórico em dois — e é o
              histórico partido que faz a audiência perguntar o que o sistema deveria saber.
            </p>

            <label className="check">
              <input type="checkbox" checked={semCpf}
                     onChange={(e) => { setSemCpf(e.target.checked); setConfere(null); }} />
              <span>Chegou sem CPF</span>
            </label>

            {semCpf ? (
              <>
                <label className="f" htmlFor="msc">
                  Motivo do ingresso urgente <small>— vira pendência até o CPF aparecer</small>
                </label>
                <textarea id="msc" rows={2} value={motivoSemCpf}
                          onChange={(e) => setMotivoSemCpf(e.target.value)}
                          placeholder="Ex.: chegada às 23h pelo Conselho Tutelar, sem documentos com a criança." />
              </>
            ) : (
              <>
                <label className="f" htmlFor="cpf">CPF</label>
                <div className="row" style={{ gap: 8 }}>
                  <input id="cpf" className="field grow" inputMode="numeric" value={cpf}
                         onChange={(e) => { setCpf(e.target.value); setConfere(null); }}
                         placeholder="000.000.000-00" />
                  <button className="btn sec" disabled={cpf.length < 11 || ocupado}
                          onClick={conferirCpf}>
                    Conferir
                  </button>
                </div>

                {confere && (
                  <div className={`notice ${CPF_BLOQUEIA[confere.situacao] ? 'c-warn' : 'c-ok'}`}
                       role="status">
                    <b>{confere.acao}</b>
                    {CPF_BLOQUEIA[confere.situacao] && (
                      <div className="mutetxt">
                        Este cadastro não continua por aqui — é o mesmo perfil, e o caminho
                        certo é o retorno ou a transferência, que preservam o histórico.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {cpfResolvido && (
            <>
              <div className="eyebrow">Identificação</div>
              <div className="card">
                <label className="f" htmlFor="nome">Nome completo</label>
                <input id="nome" className="field" value={fullName}
                       onChange={(e) => setFullName(e.target.value)} />

                <label className="f" htmlFor="social">
                  Nome social <small>— é o que aparece em todas as telas</small>
                </label>
                <input id="social" className="field" value={socialName}
                       onChange={(e) => setSocialName(e.target.value)}
                       placeholder="Como a criança quer ser chamada" />

                <label className="f" htmlFor="nasc">Data de nascimento</label>
                <input id="nasc" type="date" className="field" value={birthDate}
                       onChange={(e) => setBirthDate(e.target.value)} />

                <label className="f" htmlFor="gen">Gênero <small>— opcional</small></label>
                <input id="gen" className="field" value={gender}
                       onChange={(e) => setGender(e.target.value)} />

                <label className="f" htmlFor="raca">Raça/cor <small>— opcional, autodeclarada</small></label>
                <input id="raca" className="field" value={race}
                       onChange={(e) => setRace(e.target.value)} />

                <label className="f" htmlFor="nat">Naturalidade <small>— opcional</small></label>
                <input id="nat" className="field" value={birthplace}
                       onChange={(e) => setBirthplace(e.target.value)} />

                <label className="f" htmlFor="nis">NIS <small>— opcional</small></label>
                <input id="nis" className="field" value={nis}
                       onChange={(e) => setNis(e.target.value)} />

                <label className="f" htmlFor="rc">Registro civil <small>— opcional</small></label>
                <input id="rc" className="field" value={civilRegistry}
                       onChange={(e) => setCivilRegistry(e.target.value)}
                       placeholder="Termo, livro e folha da certidão" />
              </div>
            </>
          )}
        </section>
      )}

      {passo === 1 && (
        <section className="passagem">
          {/* Casa cheia não fecha a porta: pede a decisão, escrita. */}
          {cheia && (
            <div className="notice c-warn" role="status">
              <b>A casa está no limite ({ocupacao!.ocupadas} de {ocupacao!.capacidade}).</b>
              <div>
                O acolhimento continua — ninguém devolve criança na porta porque o sistema
                disse não. A justificativa abaixo fica registrada com o seu nome.
              </div>
            </div>
          )}

          <div className="eyebrow">A chegada</div>
          <div className="card">
            {cheia && (
              <>
                <label className="f" htmlFor="mcap">
                  Por que acolher acima do limite <small>— mínimo de 15 caracteres</small>
                </label>
                <textarea id="mcap" rows={2} value={capacityReason}
                          onChange={(e) => setCapacityReason(e.target.value)}
                          placeholder="Ex.: irmão de acolhido já na casa; separar os dois seria pior." />
              </>
            )}

            <label className="f" htmlFor="dt">Data do acolhimento</label>
            <input id="dt" type="date" className="field" value={admittedOn}
                   onChange={(e) => setAdmittedOn(e.target.value)} />

            <label className="f" htmlFor="trz">Quem trouxe</label>
            <input id="trz" className="field" value={broughtBy}
                   onChange={(e) => setBroughtBy(e.target.value)}
                   placeholder="Ex.: Conselho Tutelar da região leste" />

            <label className="f" htmlFor="cid">Cidade de origem</label>
            <input id="cid" className="field" value={originCity}
                   onChange={(e) => setOriginCity(e.target.value)} />

            <label className="f" htmlFor="ant">Acolhimento anterior <small>— se houve</small></label>
            <input id="ant" className="field" value={previousShelter}
                   onChange={(e) => setPreviousShelter(e.target.value)} />

            <label className="f" htmlFor="irm">
              Irmãos <small>— onde estão, e se estão separados</small>
            </label>
            <textarea id="irm" rows={2} value={siblingsNote}
                      onChange={(e) => setSiblingsNote(e.target.value)}
                      placeholder="Ex.: irmã de 6 anos na Casa 01; visitas quinzenais combinadas." />

            <label className="f" htmlFor="ref">
              Referência familiar autorizada <small>— quem pode visitar e ligar</small>
            </label>
            <textarea id="ref" rows={2} value={familyReference}
                      onChange={(e) => setFamilyReference(e.target.value)}
                      placeholder="Ex.: avó materna, autorizada por decisão de 12/08." />

            <label className="f" htmlFor="cui">
              Cuidados essenciais <small>— o que quem cuida precisa saber já hoje</small>
            </label>
            <textarea id="cui" rows={2} value={essentialCare}
                      onChange={(e) => setEssentialCare(e.target.value)}
                      placeholder="Ex.: usa óculos para leitura; dorme com luz acesa." />

            <label className="f" htmlFor="obs">Como foi a chegada <small>— opcional</small></label>
            <textarea id="obs" rows={2} value={arrivalNote}
                      onChange={(e) => setArrivalNote(e.target.value)}
                      placeholder="Fatos do acolhimento, sem rótulo sobre a criança." />
          </div>
        </section>
      )}

      {passo === 2 && opcoes && (
        <section className="passagem">
          <div className="eyebrow">Área restrita</div>
          <div className="notice c-info" role="status">
            O que você escrever aqui não aparece para quem cuida no dia a dia. Não é
            desconfiança do educador: saber por que a criança foi retirada de casa muda como
            se olha para ela, e isso existe para decidir o caso, não para acompanhar o banho.
          </div>

          <div className="card">
            <label className="f" htmlFor="mot">Motivo do acolhimento</label>
            <select id="mot" className="field" value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value)}>
              <option value="">Escolha…</option>
              {opcoes.motivos.map((m) => <option key={m.cod} value={m.cod}>{m.label}</option>)}
            </select>

            <label className="f" htmlFor="det">Detalhe <small>— o fato, como consta na decisão</small></label>
            <textarea id="det" rows={3} value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)} />

            <label className="f" htmlFor="med">Medida</label>
            <select id="med" className="field" value={measureType}
                    onChange={(e) => setMeasureType(e.target.value)}>
              {opcoes.medidas.map((m) => <option key={m.cod} value={m.cod}>{m.label}</option>)}
            </select>

            <label className="f" htmlFor="org">Quem determinou</label>
            <select id="org" className="field" value={determiningBody}
                    onChange={(e) => setDeterminingBody(e.target.value)}>
              <option value="">Escolha…</option>
              {opcoes.orgaos.map((o) => <option key={o.cod} value={o.cod}>{o.label}</option>)}
            </select>

            <label className="f" htmlFor="vara">Vara <small>— opcional</small></label>
            <input id="vara" className="field" value={courtName}
                   onChange={(e) => setCourtName(e.target.value)} />

            <label className="f" htmlFor="proc">Processo <small>— opcional</small></label>
            <input id="proc" className="field" value={processNumber}
                   onChange={(e) => setProcessNumber(e.target.value)} />

            <div className="row" style={{ gap: 8 }}>
              <div className="grow">
                <label className="f" htmlFor="guia">Guia</label>
                <input id="guia" className="field" value={guideNumber}
                       onChange={(e) => setGuideNumber(e.target.value)} />
              </div>
              <div className="grow">
                <label className="f" htmlFor="guiad">Data da guia</label>
                <input id="guiad" type="date" className="field" value={guideDate}
                       onChange={(e) => setGuideDate(e.target.value)} />
              </div>
            </div>
          </div>
        </section>
      )}

      {passo === 3 && (
        <section className="passagem">
          <div className="eyebrow">Conferir antes de cadastrar</div>
          <div className="card">
            <Linha rotulo="Nome" valor={socialName || fullName} />
            {socialName && <Linha rotulo="Nome civil" valor={fullName} />}
            <Linha rotulo="Nascimento" valor={dia(birthDate)} />
            <Linha rotulo="CPF" valor={semCpf ? 'sem CPF — entra com ID provisório' : cpf} />
            <Linha rotulo="Acolhido em" valor={dia(admittedOn)} />
            <Linha rotulo="Trazido por" valor={broughtBy || '—'} />
            <Linha rotulo="Motivo"
                   valor={opcoes?.motivos.find((m) => m.cod === reasonCategory)?.label ?? '—'} />
            <Linha rotulo="Determinado por"
                   valor={opcoes?.orgaos.find((o) => o.cod === determiningBody)?.label ?? '—'} />
            <Linha rotulo="Casa" valor={casaLabel} />
            {cheia && <Linha rotulo="Acima do limite" valor={capacityReason} />}
          </div>

          {/* O que fica faltando é dito agora, não descoberto na audiência. */}
          {(!familyReference.trim() || !essentialCare.trim()) && (
            <div className="notice c-warn" role="status">
              <b>Este cadastro entra incompleto.</b>
              <div>
                Falta {[!familyReference.trim() && 'referência familiar autorizada',
                        !essentialCare.trim() && 'cuidados essenciais']
                  .filter(Boolean).join(' e ')}. Dá para cadastrar assim — e vale a pena, se
                a criança já está aqui. Só não deixe de voltar: é o que some do sistema e
                reaparece na primeira audiência.
              </div>
            </div>
          )}
        </section>
      )}

      <div className="row rodape">
        {passo > 0 && (
          <button className="btn sec grow" onClick={() => setPasso(passo - 1)}>Voltar</button>
        )}
        {passo < 3 ? (
          <button className="btn grow" disabled={!podeAvancar} onClick={() => setPasso(passo + 1)}>
            Continuar
          </button>
        ) : (
          <button className="btn grow" disabled={ocupado} onClick={enviar}>
            Cadastrar acolhido
          </button>
        )}
      </div>

      {!podeAvancar && passo < 3 && (
        <p className="mutetxt">
          {passo === 0
            ? (!cpfResolvido
                ? 'Confira o CPF, ou marque "chegou sem CPF" e escreva o motivo do ingresso urgente.'
                : 'Falta o nome completo e a data de nascimento.')
            : passo === 1
              ? 'Informe a data do acolhimento e, com a casa no limite, a justificativa.'
              : 'Escolha o motivo do acolhimento e quem o determinou.'}
        </p>
      )}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="conf">
      <span className="mutetxt">{rotulo}</span>
      <b className="ff">{valor || '—'}</b>
    </div>
  );
}

/**
 * Data para conferir.
 *
 * A tela de conferência mostrava "2015-06-20" — o formato do banco, não o do
 * país. É a última leitura antes de gravar, e é exatamente onde um dia
 * trocado por mês passaria batido.
 */
function dia(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function hoje() {
  return new Intl.DateTimeFormat('en-CA',
    { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}
