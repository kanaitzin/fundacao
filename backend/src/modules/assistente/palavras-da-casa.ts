/**
 * O BANCO DE PALAVRAS DA CASA (fase 238, pedido de 23/10: "cadastre um banco de
 * palavras para ela poder entender as conversas com as pessoas").
 *
 * É o jeito de falar do plantão em Porto Alegre: a gíria gaúcha, as siglas da rede
 * de proteção e os outros nomes das coisas da casa. Cada linha diz as formas que a
 * equipe usa e o que elas querem dizer, numa forma que a Acolhe+AI já entende.
 *
 * As duas pontas leem esta mesma lista: o modo próprio da Acolhe+AI (`acolhe-guia.ts`)
 * acrescenta ao pedido o que as palavras querem dizer, sem apagar o que a pessoa
 * escreveu; e o modelo, quando houver, recebe o glossário nas instruções fixas.
 * Palavra nova entra aqui, com teste em `a-acolhe-conhece-o-sistema.spec.ts`.
 *
 * Tudo sem acento e em minúsculas: o texto chega assim depois da normalização.
 */

export interface PalavraDaCasa {
  /** As formas que a equipe usa. */
  diz: string[];
  /** O que querem dizer, na forma que a Acolhe+AI entende. */
  querDizer: string;
  /** Quando o texto tem alguma destas, a palavra quer dizer outra coisa e não se traduz. */
  menosQuando?: string[];
}

export const PALAVRAS_DA_CASA: PalavraDaCasa[] = [
  // Quem é quem
  { diz: ['pia', 'pias', 'guri', 'guris', 'gurizinho', 'moleque', 'menor'], querDizer: 'crianca menino',
    menosQuando: ['pia da cozinha', 'pia do banheiro', 'pia da lavanderia', 'torneira', 'vazou', 'vazando', 'entupiu', 'entupida'] },
  { diz: ['guria', 'gurias', 'gurizinha', 'menina'], querDizer: 'crianca menina' },
  { diz: ['nene', 'nenem', 'bebe'], querDizer: 'crianca bebe' },
  { diz: ['vo', 'voh', 'vovo', 'vozinha'], querDizer: 'avo familiar' },
  { diz: ['prof', 'profe', 'sora'], querDizer: 'professora da escola' },
  // O corpo e a saúde
  { diz: ['piripaque', 'treco', 'mal estar', 'mal-estar', 'ruim do estomago', 'enjoada', 'enjoado', 'enjoo'], querDizer: 'passando mal' },
  { diz: ['febrao', 'ardendo em febre', 'quentinho', 'quentinha', 'pelando'], querDizer: 'febre' },
  { diz: ['golfou', 'golfando', 'botou pra fora', 'gomitou', 'gomitando'], querDizer: 'vomitou' },
  { diz: ['caganeira', 'dor de barriga', 'soltura'], querDizer: 'diarreia' },
  { diz: ['apagou', 'caiu duro', 'caiu dura', 'ficou mole e nao responde'], querDizer: 'desmaiou' },
  { diz: ['se cortou', 'se riscou', 'se machucou de proposito'], querDizer: 'automutilacao' },
  { diz: ['bombinha', 'remedio da asma'], querDizer: 'remedio inalatorio' },
  { diz: ['gotinha', 'xarope', 'comprimido', 'capsula', 'medicacao', 'medicamento'], querDizer: 'remedio dose' },
  // A saída sem autorização
  { diz: ['se mandou', 'meteu o pe', 'deu no pe', 'picou a mula', 'se escafedeu', 'fugiu de casa'], querDizer: 'fugiu' },
  // O comportamento e a emoção
  { diz: ['se desorganizou', 'desorganizou', 'deu crise', 'deu um piti', 'piti', 'chilique', 'barraco', 'quebrou tudo', 'se atirou no chao'], querDizer: 'crise descontrolado' },
  { diz: ['berreiro', 'aos prantos', 'chorao', 'chorona', 'chorando muito'], querDizer: 'chorando' },
  { diz: ['brigaram', 'se pegaram', 'saiu no tapa', 'sairam no tapa', 'se bateram', 'deu porrada'], querDizer: 'briga entre criancas ocorrencia' },
  // A rotina da casa
  { diz: ['livro do plantao', 'caderno do plantao', 'caderno de ocorrencias', 'livro da casa'], querDizer: 'ata' },
  { diz: ['passar o plantao', 'virada do plantao', 'troca de turno', 'troca de plantao'], querDizer: 'passagem de plantao' },
  { diz: ['as fotos dela', 'as fotos dele', 'album', 'memorias', 'momentos'], querDizer: 'vivencias' },
  { diz: ['papel', 'papelada', 'xerox', 'certidao', 'oficio'], querDizer: 'documento' },
  // As siglas da rede de proteção
  /* Sem acento, a sigla PIA e o piá (menino) viram a mesma palavra: no texto vale o
     piá, e a sigla fica só no glossário do modelo, que lê pelo contexto. */
  { diz: ['PIA, a sigla, quando se fala de plano ou prazo'], querDizer: 'plano individual de atendimento da crianca' },
  { diz: ['ct', 'conselho tutelar', 'conselheira', 'conselheiro'], querDizer: 'conselho tutelar' },
  { diz: ['cras'], querDizer: 'centro de referencia de assistencia social' },
  { diz: ['creas'], querDizer: 'centro de referencia especializado de assistencia social' },
  { diz: ['caps', 'capsi', 'caps i'], querDizer: 'centro de atencao psicossocial, saude mental' },
  { diz: ['ubs', 'postinho', 'posto de saude'], querDizer: 'unidade basica de saude' },
  { diz: ['samu'], querDizer: 'emergencia de saude, telefone 192' },
  { diz: ['mp', 'promotoria', 'promotor', 'promotora'], querDizer: 'ministerio publico' },
  { diz: ['juizado', 'vara', 'juiz', 'juiza', 'forum', 'audiencia'], querDizer: 'judiciario' },
  { diz: ['eca'], querDizer: 'estatuto da crianca e do adolescente' },
  { diz: ['cns', 'cartao do sus', 'cartaozinho do sus'], querDizer: 'cartao sus' },
  /*
   * FASE 311 (pedido de 11/11: "pense como uma psicóloga, como um coordenador, um
   * educador social e uma assistente social"). O que cada um diz no plantão e na
   * reunião, levado ao cuidado ou ao lugar certo. Nada aqui rotula a criança: o
   * sentido é sempre o que a equipe faz, nunca o que a criança é.
   */
  // A psicóloga: o que a criança sente e mostra
  { diz: ['ideacao suicida', 'pensamento de morte', 'pensando em morrer', 'falou em morrer', 'nao quer mais viver', 'quer sumir do mundo', 'tirar a propria vida', 'se machucar de novo'],
    querDizer: 'quer morrer, risco, cuidado imediato' },
  { diz: ['crise de ansiedade', 'ataque de panico', 'crise de panico', 'tremendo de nervoso', 'falta de ar de nervoso', 'coracao disparado de medo'], querDizer: 'ansiosa com medo' },
  { diz: ['se isolou', 'isolada', 'isolado', 'retraida', 'retraido', 'calada o dia todo', 'calado o dia todo', 'nao fala com ninguem', 'cabisbaixa', 'cabisbaixo', 'chorosa', 'choroso'],
    querDizer: 'triste, tristeza' },
  { diz: ['luto', 'falecimento', 'faleceu', 'morreu a mae', 'morreu o pai', 'morreu a avo', 'morreu o avo', 'perdeu a mae', 'perdeu o pai'], querDizer: 'tristeza saudade, luto' },
  { diz: ['insonia', 'acordou de madrugada', 'terror noturno', 'sonambulo', 'sonambula', 'acordou gritando'], querDizer: 'nao consegue dormir, pesadelo' },
  { diz: ['saudade da mae', 'saudade do pai', 'saudade de casa', 'quer ir pra casa', 'quer voltar pra casa', 'pediu pela mae', 'chamou pela mae'], querDizer: 'saudade da familia' },
  { diz: ['enurese', 'xixi na cama', 'molhou a cama', 'fez xixi na roupa', 'escape de xixi', 'encoprese'], querDizer: 'enurese, evolucao de saude, cuidado sem castigo' },
  { diz: ['escuta especializada', 'depoimento especial', 'escuta protegida'], querDizer: 'judiciario, escuta da crianca com protecao' },
  { diz: ['psicoterapia', 'terapia', 'atendimento psicologico', 'psicologa', 'psicologo', 'sessao de terapia', 'psiquiatra', 'neuro', 'neuropediatra'],
    querDizer: 'atendimento tecnico, perfil da crianca' },
  // A coordenação: o caso, a rede e a vaga
  { diz: ['estudo de caso', 'discussao de caso', 'reuniao de rede', 'reuniao de equipe', 'reuniao tecnica', 'supervisao', 'reuniao de casa'], querDizer: 'reuniao, pauta' },
  { diz: ['guia de acolhimento', 'termo de acolhimento', 'oficio do juizado', 'relatorio circunstanciado', 'relatorio informativo', 'relatorio de reavaliacao', 'relatorio para o juizado'],
    querDizer: 'documento para o judiciario' },
  { diz: ['desacolhimento', 'desligamento', 'reintegracao', 'reintegracao familiar', 'retorno a familia', 'familia extensa', 'familia substituta', 'familia acolhedora', 'adocao', 'guarda provisoria'],
    querDizer: 'saida da crianca, perfil da crianca, judiciario' },
  { diz: ['lotada', 'superlotada', 'casa cheia', 'sem vaga', 'capacidade da casa'], querDizer: 'vagas, ocupacao' },
  { diz: ['cobrir o plantao', 'cobrir a folga', 'dobrar o plantao', 'dobra', 'troca de folga', 'trocar a folga', 'banco de horas'], querDizer: 'escala, substituicao' },
  { diz: ['acolhimento novo', 'acolhimento emergencial', 'chegou uma crianca', 'vai chegar uma crianca', 'crianca nova'], querDizer: 'chegada de crianca, acolhido' },
  // O educador social: a rotina, a escola e a convivência
  { diz: ['tema de casa', 'dever de casa', 'licao de casa', 'para casa da escola', 'boletim', 'nota da escola', 'reuniao de pais', 'conselho de classe', 'bilhete da escola', 'agenda da escola'],
    querDizer: 'escola, documento da crianca', menosQuando: ['boletim de ocorrencia'] },
  { diz: ['higiene', 'escovar os dentes', 'cortar o cabelo', 'corte de cabelo', 'cortar as unhas', 'hora do banho', 'hora de dormir', 'hora do silencio', 'toque de recolher'],
    querDizer: 'rotina da casa' },
  { diz: ['regra da casa', 'regras da casa', 'combinado da casa', 'assembleia', 'roda de conversa'], querDizer: 'combinado, regra de convivencia' },
  { diz: ['de castigo', 'castigar', 'tirar o celular', 'tirar a televisao', 'sem sobremesa'], querDizer: 'combinado, regra de convivencia, sem punicao' },
  { diz: ['passeio', 'pracinha', 'saida coletiva', 'saida de lazer', 'cinema', 'parque', 'oficina'], querDizer: 'vivencias, atividade' },
  // A assistente social: a família, a rede e os direitos
  { diz: ['visita domiciliar', 'vd', 'ida a casa da familia', 'visita a familia', 'busca ativa'], querDizer: 'acompanhamento, visita domiciliar' },
  { diz: ['encaminhamento', 'encaminhar', 'contrarreferencia', 'rede socioassistencial', 'rede de protecao'], querDizer: 'acompanhamento, rede' },
  { diz: ['cadunico', 'cad unico', 'cadastro unico', 'nis', 'bolsa familia', 'bpc', 'loas', 'auxilio', 'beneficio'], querDizer: 'beneficio social, documento da crianca' },
  { diz: ['segunda via', 'certidao de nascimento', 'cpf', 'rg', 'carteira de identidade', 'titulo de eleitor', 'carteira de trabalho'], querDizer: 'documento da crianca' },
  { diz: ['genograma', 'ecomapa', 'arvore da familia', 'arvore genealogica'], querDizer: 'familia, contatos no perfil da crianca' },
  { diz: ['medida protetiva', 'medida de protecao', 'destituicao', 'destituicao do poder familiar', 'poder familiar', 'defensoria', 'defensor', 'defensora', 'advogado', 'advogada'],
    querDizer: 'judiciario' },
  { diz: ['aproximacao restrita', 'proibido de visitar', 'proibida de visitar', 'nao pode visitar', 'nao pode ver a crianca'], querDizer: 'quem pode visitar, visita' },
  { diz: ['scfv', 'convivencia e fortalecimento de vinculos', 'jovem aprendiz', 'menor aprendiz', 'estagio', 'curso profissionalizante'], querDizer: 'vinculo educacional, escola, documento da crianca' },
  // Mais siglas e lugares da rede em Porto Alegre
  { diz: ['paefi', 'paif'], querDizer: 'acompanhamento da familia pelo creas ou cras' },
  { diz: ['fasc'], querDizer: 'fundacao de assistencia social e cidadania de porto alegre' },
  { diz: ['cmdca', 'conselho municipal'], querDizer: 'conselho municipal dos direitos da crianca e do adolescente' },
  { diz: ['deca', 'delegacia', 'boletim de ocorrencia', 'registrar bo', 'fazer bo'], querDizer: 'ocorrencia, delegacia da infancia e juventude' },
  { diz: ['hps', 'pronto socorro', 'pronto atendimento', 'upa', 'clinicas', 'hcpa', 'emergencia do hospital'], querDizer: 'atendimento de saude, evolucao de saude' },
  { diz: ['caps ad', 'drogadicao', 'uso de drogas', 'usando droga', 'fumando maconha', 'cheirando cola'], querDizer: 'centro de atencao psicossocial, saude mental, cuidado' },
  { diz: ['nasf', 'esf', 'agente comunitario', 'acs'], querDizer: 'unidade basica de saude' },
  // FIM DA LISTA
];

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** As palavras que a equipe ensinou e a coordenação aprovou (fase 244), na forma da lista. */
export function palavrasEnsinadas(ensinadas: readonly { diz: string; querDizer: string }[]): PalavraDaCasa[] {
  return ensinadas.filter((p) => semAcento(p.diz).length >= 2)
    .map((p) => ({ diz: [semAcento(p.diz)], querDizer: semAcento(p.querDizer) }));
}

/** Acrescenta ao texto (já sem acento e em minúsculas) o que as palavras da casa querem dizer. */
export function traduzirPalavrasDaCasa(t: string, ensinadas: readonly PalavraDaCasa[] = []): string {
  const extras: string[] = [];
  for (const p of [...PALAVRAS_DA_CASA, ...ensinadas]) {
    if (p.menosQuando?.some((m) => t.includes(m))) continue;
    if (p.diz.some((d) => new RegExp(`(^|[^a-z])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t))) {
      extras.push(p.querDizer);
    }
  }
  return extras.length ? `${t} ${extras.join(' ')}` : t;
}

/** O glossário que vai nas instruções fixas do modelo, gerado da mesma lista. */
export const GLOSSARIO_DA_CASA = PALAVRAS_DA_CASA
  .map((p) => `${p.diz.join(', ')}: ${p.querDizer}`)
  .join('\n');
