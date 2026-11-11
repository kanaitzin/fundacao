/**
 * O GUIA DO SISTEMA (fase 231, pedido de 19/10: "um menu com todas as
 * explicações, com links para onde quer ir, o que dá para fazer em cada menu e
 * pela Acolhe+AI, como fica o perfil, e que se atualize a cada atualização").
 *
 * O Guia junta três fontes, e só uma delas mora aqui:
 *
 * O QUE CADA TELA É vem da lista de telas que a Acolhe+AI já lê
 * (`GUIA_DA_ACOLHE`, seção "As telas do sistema"). O que a pessoa lê no Guia é
 * o mesmo que a assistente sabe, e o `a-acolhe-conhece-o-sistema.spec.ts` já
 * reprova tela nova que não estiver lá.
 *
 * O QUE CADA CARGO FAZ NA TELA vem do mapa de alcance (`alcance.ts`), o mesmo
 * da página "O que cada setor enxerga" e do menu.
 *
 * O QUE A ACOLHE+AI FAZ EM CADA TELA, as abas do perfil e as novidades moram
 * aqui. O `o-guia-do-sistema.spec.ts` reprova tela ou aba do perfil sem
 * explicação, e reprova a fase que terminou sem a linha dela nas Novidades:
 * é o que faz o Guia acompanhar cada atualização.
 */
import { GUIA_DA_ACOLHE } from '../../backend/src/modules/assistente/guia';

/** Uma tela, como a lista da Acolhe+AI a descreve. */
export interface TelaDescrita { chave: string; titulo: string; texto: string }

/** As telas da seção "As telas do sistema" do guia da Acolhe+AI, pela chave. */
export function telasDescritas(): Map<string, TelaDescrita> {
  const ini = GUIA_DA_ACOLHE.indexOf('# As telas do sistema');
  const fim = GUIA_DA_ACOLHE.indexOf('# As rotas que você pode ler');
  const mapa = new Map<string, TelaDescrita>();
  for (const linha of GUIA_DA_ACOLHE.slice(ini, fim).split('\n')) {
    const m = /^- (.+?) \(([a-z_]+)\): (.+)$/.exec(linha);
    if (!m) continue;
    const texto = m[3].trim();
    mapa.set(m[2], { chave: m[2], titulo: m[1], texto: texto.charAt(0).toUpperCase() + texto.slice(1) });
  }
  return mapa;
}

/**
 * O que a Acolhe+AI faz em cada tela. Ela sempre pode explicar a tela e levar
 * a pessoa até ela; aqui fica o que ela faz de mais, e o que ela não faz.
 * Ela nunca salva: preenche à vista e a pessoa confere e salva.
 */
export const COM_A_ACOLHE: Record<string, string> = {
  guia: 'Pergunte a ela como se faz qualquer coisa do sistema. Ela explica o passo a passo e leva você até a tela certa.',
  avisos: 'Ela lê os seus avisos e diz o que cada um pede, e leva você à tela de onde o aviso veio.',
  metricas: 'Ela lê os números das casas e monta tabela com as contas feitas, que você baixa como planilha. Casa não se compara com casa: ela mostra cada uma no seu contexto.',
  dia: 'Ela lê o dia da casa e diz o que ainda espera alguém. Para o que apareceu agora no turno, abre o formulário de atividade urgente e preenche com você.',
  chamada: 'Ela abre uma chamada nova da casa e preenche o formulário com você. Quem marca a presença é você, criança por criança.',
  acolhidos: 'Ela acha a criança pelo nome, abre o perfil e a aba do assunto (pedir um documento abre a aba Documentos e o dossiê), e abre o formulário que você pedir (alergia, contato, conquista, atendimento, escola). Também cadastra a chegada de uma criança com você.',
  passagem: 'Ela redige com você o complemento da passagem, a partir do que você contar, e mostra o rascunho para você conferir. A assinatura é sempre sua.',
  unidades: 'Ela lê o dia das unidades que você acompanha e conta o que ainda espera alguém, casa por casa.',
  plantao: 'Ela diz quem está em cada atividade agora e o que ficou para o próximo turno.',
  agenda: 'Ela marca o compromisso com você: abre o formulário, preenche a data, a hora e quem vai, e você confere e salva.',
  rotina: 'Ela lê o molde do dia e, para quem altera a rotina, abre o formulário de item novo e preenche com você.',
  escala: 'Ela lê a escala, conta as horas de cada pessoa com a conta feita, e inclui alguém no rascunho do mês com você.',
  equipe: 'Ela abre o cadastro de pessoa nova e preenche com você. Senha e desativação ficam com você, na própria tela.',
  trabalho: 'Ela lê o que cada setor registrou no período e resume, sem pôr pessoas em ordem de quem fez mais.',
  periodo: 'Ela lê o período escolhido e resume a semana ou o mês, com os números conferidos pela conta.',
  cozinha: 'Ela abre o pedido de lanche ou de cesta básica e preenche com você, e lembra as restrições da casa.',
  campos_do_perfil: 'Ela explica o que cada campo mostra para quem está no turno. Ligar e desligar fica com você.',
  portaria: 'Ela diz quem pode visitar cada criança e o que vale para a saída de cada uma. Entrada e saída se registram na própria tela.',
  setores: 'Ela responde o que cada setor vê e faz, pela mesma lista desta tela.',
  ocorrencias: 'Ela abre o registro de ocorrência e ajuda a escrever o fato como aconteceu, sem adjetivo nem julgamento. Em urgência, ela diz primeiro o que fazer pela criança, e o registro vem depois.',
  ata: 'Ela redige a linha da ATA a partir do que você contar, mostra para você conferir, e abre o registro de episódio do turno com você.',
  impacto: 'Ela lê o que o acolhimento produziu e abre o registro de conquista com você.',
  internacao: 'Ela abre o registro da internação e o diário do dia, e escreve com você o que aconteceu no hospital.',
  saude: 'Ela lê a grade de doses e o armário, soma as notas de compra com a conta feita e abre o registro de compra com você. Dose, conduta e remédio são da Enfermagem: ela não orienta.',
  alinhamentos: 'Ela abre o registro de reunião, de combinado ou de assunto para a pauta, e preenche com você.',
  acompanhamentos: 'Ela gera com você o relatório do período e registra a entrega feita. A avaliação é escrita pela equipe técnica.',
  painel: 'Ela lê a ocupação e o quadro de cada mês e monta a tabela, com cada casa no seu contexto.',
  sincronizacao: 'Ela explica o que ficou pendurado entre o aparelho e o servidor e quem decide cada caso.',
  sugestoes: 'Quando você disser que algo podia ser melhor, ela anota a sugestão com as suas palavras, e ela aparece aqui com o seu nome.',
  implantacao: 'Ela lê os sinais da implantação e diz qual está parado e a quem avisar.',
  arquivo: 'Ela diz o que já foi copiado e o que espera na fila de envio.',
  transferencias: 'Ela abre o pedido de transferência e preenche com você. Quem aceita é a coordenação da casa que recebe.',
  cofre: 'A Acolhe+AI não abre o cofre. Ela só explica como pedir o acesso.',
  casas: 'Ela diz quais unidades você alcança e leva você à casa que você escolher.',
};

/**
 * A linha curta das abas do turno, que não estão na lista das portas (as
 * portas têm a delas em `portas.ts`). É a linha que fica à vista no Guia; o
 * resto abre com um toque.
 */
export const CURTA_DO_TURNO: Record<string, string> = {
  metricas: 'Os números das oito casas, sem ranking.',
  dia: 'A linha do dia da casa e o que ainda espera alguém.',
  chamada: 'As chamadas da casa: quem está e quem está fora.',
  acolhidos: 'O perfil de cada criança, em abas.',
  passagem: 'A passagem do plantão e o calendário dos turnos.',
};

/** As abas do perfil da criança, na ordem em que aparecem. */
export const ABAS_DO_PERFIL_NO_GUIA: { id: string; titulo: string; texto: string; quem?: string }[] = [
  { id: 'geral', titulo: 'Geral',
    texto: 'A primeira aba: idade, casa, há quanto tempo está no acolhimento, escola, a equipe de referência, a família, os cuidados essenciais, os próximos compromissos e a identificação, e o botão do dossiê. O PIA aparece para a equipe técnica.' },
  { id: 'familia', titulo: 'Família e visitas',
    texto: 'Os contatos da família, as visitas com o relatório, as saídas, a convivência familiar e os números da convivência. O familiar se edita com o motivo, e o de antes fica guardado; ele também se retira, com o motivo. Toda lista vem com o mais recente em cima.' },
  { id: 'saude', titulo: 'Saúde',
    texto: 'Os números dos últimos trinta dias, as alergias, condições e restrições com o laudo ou a receita anexados, os remédios em uso com as receitas, e o histórico de saúde (consultas e registros de quem acompanhou), com a data e a hora, o mais recente em cima.' },
  { id: 'rotina', titulo: 'Dia a dia',
    texto: 'O que a casa registrou num dia escolhido (refeição, remédio, chamada, saídas), para consultar, e as chamadas dos últimos trinta dias.' },
  { id: 'educacao', titulo: 'Educação',
    texto: 'A escola, a evolução educacional e o conceito de cada bimestre, com o porquê.' },
  { id: 'vivencias', titulo: 'Vivências',
    texto: 'A vida dela na casa: o aniversário, o tempo de casa, as conquistas, as fotos (com quem aparece em cada uma) e as memórias, o mais recente em cima.' },
  { id: 'atendimentos', titulo: 'Atendimentos',
    texto: 'O relatório da equipe técnica (psicologia, psicopedagogia, Assistência Social e pedagogia), o mais recente em cima, com a data e a hora de cada atendimento, onde foi e quem atendeu, a busca por palavra e por período, os números por área e os arquivos à vista em cada cartão; a técnica e a coordenação baixam os atendimentos de um período em Word.',
    quem: 'Aparece para a equipe técnica, a coordenação e a gestão.' },
  { id: 'judiciario', titulo: 'Judiciário',
    texto: 'Como a criança chegou, a área restrita com o prazo da reavaliação ao Juízo e os documentos que a equipe técnica guarda ali (a guia, as decisões, o relatório de acolhimento, os relatórios de reavaliação) e os ofícios, cada parte num bloco que abre com o triângulo, com uma linha do que tem dentro.',
    quem: 'A área restrita abre para a equipe técnica e a coordenação.' },
  { id: 'documentos', titulo: 'Documentos',
    texto: 'Começa pelo dossiê (certidão, RG, carteira de vacina, receitas, laudos, PIA, cada um com a validade e o que falta) e pela lista dos documentos da criança. Depois, corrigir e atualizar o cadastro, as correções feitas, quem mexeu no perfil, com data e nome, e a saída da casa, com a folha de transição e o livro da vida.' },
];

/** O alto do perfil, que vem antes das abas. */
export const ALTO_DO_PERFIL = 'No alto do perfil, sempre à vista, ficam a alergia, a restrição alimentar e os cuidados que protegem a criança. Embaixo vêm as abas, cada uma com uma cor e o nome escrito. O dia de hoje da casa (o remédio da próxima hora, a chamada do almoço) fica no Dia, na Chamada e na ATA.';

/** O que a Acolhe+AI faz em qualquer tela, contado em frases. */
export const A_ACOLHE_EM_TODA_TELA: string[] = [
  'A Acolhe+AI fica no botão do canto da tela, em todas as telas. Ela conversa por texto e pela voz, e vê só o que você vê: lê os dados com o seu acesso, pelas mesmas telas que você usa.',
  'Ela explica qualquer tela, leva você até ela e abre o formulário que você pedir. Na primeira vez ela pergunta se pode mexer na tela; depois escreve à vista, campo por campo, e no fim você confere e salva. Ela nunca salva sozinha.',
  'Ela redige relatório pela voz: você conta à vontade, ela organiza o texto na linguagem da equipe e mostra o rascunho para você editar, completar falando ou ilustrar com foto.',
  'Ao abrir, ela se apresenta e oferece frases prontas para começar e os documentos que monta com você: o rascunho da ATA, o relatório pela voz, o relatório do período, o de visitas, o das vivências, a trajetória, o da internação e a tabela que vira planilha. Um toque na frase é o mesmo que escrever.',
  'Embaixo de cada resposta há Ouvir, que lê a resposta em voz alta e para com um toque, e Copiar. Ao lado do microfone fica a Conversa por voz: você fala, ela responde falando e volta a ouvir, para quando as mãos estão ocupadas, e Encerrar a conversa por voz volta à conversa escrita.',
  'Ela faz contas e monta tabelas que você baixa como planilha, lê foto ou PDF que você anexar (receita, nota de compra, alta do hospital) e propõe onde guardar.',
  'Ela não decide diagnóstico, culpa, risco, punição, remédio ou destino de criança, não compara crianças nem casas, não assina no lugar de ninguém e não apaga nada. Em urgência, ela diz primeiro o que fazer pela criança.',
];

/** O botão das duas visões, no alto (fase 299): só para quem atende mais de uma casa. */
export const AS_DUAS_VISOES_NO_GUIA: string[] = [
  'No alto da tela, ao lado do seu nome, o botão da cor da marca diz o que você está vendo: Todas as casas, ou a casa aberta. Um toque nele abre a folha O que você quer ver?, e a troca vale na hora, em todas as telas.',
  'Todas as casas juntas é o cartão de cima. Para o Gestor Geral, ele abre o Painel com os números e os gráficos das oito, no período escolhido; para a Coordenação Geral, a Enfermagem e o Líder Noturno Geral, abre o dia das oito casas numa tela só.',
  'Uma casa por inteiro são os cartões de baixo, na ordem do código. A casa escolhida abre no Dia da Casa, e o resto do menu passa a mostrar essa casa: os acolhidos, a ATA, a saúde, a escala. A faixa azul no alto da tela lembra qual casa está aberta, e o Trocar de casa dela abre a mesma folha.',
];

/** A conta e os avisos, que não são tela do menu. */
export const MINHA_CONTA_NO_GUIA: string[] = [
  'Na Minha conta, no topo, você escolhe a cor e o tamanho da letra da tela, troca a senha, liga o aviso no celular ou no computador e sai do sistema.',
  'O sino, no topo, guarda os avisos que pedem alguém: dose sem confirmação, ocorrência à espera de revisão, PIA, receita e vacinação chegando ao vencimento.',
];

/**
 * As novidades, a mais recente em cima. Toda fase que termina põe a linha
 * dela aqui: o `o-guia-do-sistema.spec.ts` reprova quando a fase do
 * `CLAUDE.md` não é a primeira desta lista.
 */
export const NOVIDADES: { fase: number; dia: string; texto: string; aba?: string }[] = [
  { fase: 311, dia: '11/11/2026',
    texto: 'A Acolhe+AI conversa sem o aviso do alto e entende melhor o jeito de falar da casa: o que a psicóloga, a coordenação, o educador social e a assistente social dizem, como estudo de caso, visita domiciliar, escuta especializada, boletim, CadÚnico e desligamento. Quando a criança fala em morrer, ela diz primeiro o cuidado: não deixar sozinha, escutar sem julgar e chamar a equipe. Em Voz da leitura, no alto da conversa, você escolhe a voz e a velocidade com que ela lê as respostas. E o relatório pedido pela conversa é feito ali mesmo: conte o que aconteceu e ela monta o rascunho para você conferir.' },
  { fase: 310, dia: '11/11/2026',
    texto: 'O cartão do que mudou desde o seu último plantão mostra quem registrou cada ocorrência. Ao registrar uma ocorrência, você diz a hora em que aconteceu, quem da equipe estava, quem foi avisado e o que ficou pendente, e o detalhe mostra tudo isso com o nome de quem registrou.' },
  { fase: 309, dia: '10/11/2026',
    texto: 'O atendimento diz a forma: individual, familiar ou coletivo. No coletivo, marque as outras crianças da casa que participaram, e o atendimento entra no perfil de cada uma, com os mesmos arquivos e quem mais estava.' },
  { fase: 308, dia: '10/11/2026',
    texto: 'No perfil da criança, logo acima das abas, os botões do que você registra para ela: atendimento, saúde, documento, familiar e conquista, conforme o seu cargo. Um toque abre a folha certa.' },
  { fase: 307, dia: '10/11/2026',
    texto: 'O educador, o Líder Diurno e o Líder Noturno Geral registram o atendimento comportamental da casa pela aba Geral do perfil, logo depois de conversar com a criança. Quem lê continua sendo a equipe técnica e a coordenação.' },
  { fase: 306, dia: '10/11/2026',
    texto: 'O atendimento ganhou a área Atendimento comportamental da casa: a conversa com a criança sobre o que aconteceu e o combinado dali para frente, no lugar da advertência. E o arquivo do atendimento, depois de aberto, também se baixa.' },
  { fase: 305, dia: '10/11/2026',
    texto: 'Na aba Atendimentos do perfil, cada atendimento vira um cartão com a faixa da área e a data, quem cadastrou, onde foi, quem atendeu, o relato e os arquivos à vista com o olho. E os documentos postos no dossiê entram na mesma linha, em ordem de data, com Ver e Baixar.' },
  { fase: 304, dia: '10/11/2026',
    texto: 'O PDF anexado agora abre com as páginas na tela também no celular, no atendimento, no dossiê e em todo anexo: role para ver as outras páginas. Antes, no Android a área ficava em branco e no iPhone aparecia só a primeira página.' },
  { fase: 303, dia: '10/11/2026',
    texto: 'A Acolhe+AI responde ao bom dia com bom dia, explica a tela que você pediu numa frase de colega, ajuda quem atende várias casas a trocar de casa pelo botão do alto, e avisa quando espera a sua resposta para mexer na tela. Ela também faz a conta das doses (3 doses de 5 ml por dia em 7 dias), diz onde ficam os remédios de cada criança, explica como falar com a coordenação e, quando duas telas têm o mesmo nome, mostra as duas. A frase pronta Marcar um compromisso aparece só para quem marca.' },
  { fase: 302, dia: '10/11/2026',
    texto: 'Na demonstração, as oito casas abrem cada uma com as suas crianças, a sua equipe e seis meses de ATAs, e o acervo de cada casa agora tem os nomes dela.' },
  { fase: 301, dia: '10/11/2026',
    texto: 'Sem mudança nas telas: as perguntas que esperam a Fundação foram postas em ordem para a reunião com o Marcelo, com as duas que se contradiziam no alto, onde o sistema roda e qual inteligência artificial a Acolhe+AI usa.' },
  { fase: 300, dia: '09/11/2026',
    texto: 'A Acolhe+AI agora se apresenta pelo seu nome e oferece frases prontas e os documentos que monta com você, de um toque. Cada resposta tem Ouvir e Copiar, e ao lado do microfone fica a Conversa por voz: você fala, ela responde falando e volta a ouvir.' },
  { fase: 299, dia: '09/11/2026',
    texto: 'Quem atende mais de uma casa vê no alto o que está olhando, Todas as casas ou a casa aberta. Um toque ali abre as duas visões: as oito casas juntas, com os números ou o dia de todas, e cada casa por inteiro, para entrar nela. E na Portaria, o documento do visitante aberto em Ver o documento agora se fecha de novo pelo Fechar o documento.' },
  { fase: 298, dia: '09/11/2026',
    texto: 'Sem mudança nas telas: o que se grava fica na casa de quem grava. A estadia, a receita, a atividade, a internação, a síntese da ocorrência e o relatório não podem mais ser levados para uma criança ou uma casa que a pessoa não atende, e o que já foi encerrado não se reescreve.' },
  { fase: 297, dia: '09/11/2026',
    texto: 'O conteúdo do registro de saúde sigiloso passa a ser escondido também pelo banco, e não só pela tela. O retorno de uma consulta sigilosa já nasce sigiloso, o relatório preenchido sozinho escreve só Registro sigiloso no lugar do conteúdo, e na Sincronização os registros sem internet que esperam decisão aparecem só para a equipe técnica e a coordenação.', aba: 'sincronizacao' },
  { fase: 296, dia: '09/11/2026',
    texto: 'Sem mudança nas telas: o esqueci minha senha passa a ter limite. Do mesmo lugar saem no máximo dez pedidos por hora, e quando muitos e-mails de senha nova saem na mesma hora, quem já recebeu um espera; o primeiro de cada pessoa sempre sai. Se o e-mail não chegar, a coordenação continua podendo reenviar o acesso.' },
  { fase: 295, dia: '09/11/2026',
    texto: 'Sem mudança nas telas: quando a casa abrir pela internet, a tela chega com as proteções do navegador ligadas (nada de fora roda dentro dela, ninguém a põe dentro de outra página, a localização fica fechada), e a câmera, a leitura do papel e o PDF continuam abrindo. Um arquivo que não é PDF nem foto passa a pedir para baixar, em vez de abrir na tela.' },
  { fase: 294, dia: '09/11/2026',
    texto: 'Sem mudança nas telas: toda foto guardada sai sem o lugar onde foi tirada. O celular grava na foto a localização, que numa casa é o endereço dela; agora essa parte sai antes de guardar, e a foto continua em pé e do mesmo jeito.' },
  { fase: 293, dia: '09/11/2026',
    texto: 'Sem mudança nas telas: a senha passa a ser conferida dentro do banco, e a senha guardada de cada pessoa não sai mais de lá. Quando muitas tentativas erradas chegam ao mesmo tempo, a entrada trava no limite certo, e a resposta da tela é a mesma para e-mail com e sem conta.' },
  { fase: 292, dia: '09/11/2026', aba: 'equipe',
    texto: 'Quando alguém da equipe muda de casa pela Equipe, a senha de antes deixa de valer e as sessões abertas se encerram, porque a casa de antes sabia a senha; quem fez a mudança recebe uma senha nova para entregar em mãos. E quando alguém de uma casa passa a atender todas as casas, o cartão da pessoa mostra e-mail a confirmar: o Gestor Geral ou a Coordenação Geral confere com ela em Confirmar o e-mail, e até lá o esqueci minha senha e o convite não vão para aquele e-mail.' },
  { fase: 291, dia: '08/11/2026', aba: 'equipe',
    texto: 'A senha passa a ter pelo menos 8 caracteres, com uma letra maiúscula e um símbolo, e a tela diz o que falta enquanto você escreve. Quem entra pela primeira vez com a senha que recebeu da coordenação cria a sua antes de começar: até criar, só aparece a folha da senha, com Sair ao lado. A senha que a Equipe gera é sorteada no formato Farol-pipa-0427, fácil de ditar. E quando muitas contas diferentes erram a senha a partir do mesmo lugar, a entrada dali espera alguns minutos; errar a senha atual na troca também conta para a sua conta.' },
  { fase: 290, dia: '08/11/2026',
    texto: 'Sem mudança nas telas: a cópia de segurança do banco passa a voltar com as permissões de cada setor. Até aqui, um banco restaurado da cópia não abria para ninguém. O ensaio da restauração, que a TI roda todo mês, agora confere também que o sistema restaurado abre e que cada setor continua vendo só o que via.' },
  { fase: 289, dia: '08/11/2026', aba: 'equipe',
    texto: 'Na Equipe, cadastrar uma pessoa na Enfermagem, ou passar alguém para a Enfermagem, ficou com o Gestor Geral e a Coordenação Geral, porque essa conta alcança as oito casas. Quem passa alguém da casa para a Enfermagem ou para a coordenação, ou marca a Coordenação Geral, recebe uma senha nova para entregar à pessoa, e a senha de antes deixa de valer. A coordenação e a equipe técnica de cada casa seguem cadastrando a equipe da casa, e a lista de cargos para cadastrar mostra só o que cada um pode fazer.' },
  { fase: 288, dia: '08/11/2026',
    texto: 'Sem mudança nas telas: a conta de cada pessoa ficou mais protegida. Ninguém consegue mudar o próprio cargo, as casas que alcança nem o próprio e-mail, e a coordenação não consegue pôr uma pessoa de outra casa na sua, nem por fora das telas. A conta de quem atende todas as casas, como a da Enfermagem, só é alterada pelo Gestor Geral ou pela Coordenação Geral. A troca da própria senha segue igual.' },
  { fase: 287, dia: '07/11/2026', aba: 'acolhidos',
    texto: 'O registro de saúde sigiloso: ao registrar uma consulta, quem levou a criança pode marcar Registro sigiloso, e a Enfermagem, a técnica e a coordenação podem marcar depois um registro que já existe. O conteúdo fica só com essas três; os outros veem no histórico de saúde do perfil que existe um registro sigiloso, o dia e quem registrou. Tirar o sigilo é da técnica e da coordenação, com o motivo, e quem marcou e quem tirou fica escrito no registro.' },
  { fase: 286, dia: '07/11/2026', aba: 'cozinha',
    texto: 'O plano de hoje no alto da Cozinha: as refeições da casa com a hora, quantas crianças estão em casa (as que estão com a família ou internadas não comem aqui), o que não servir a quem está em casa, com a substituição, e os lanches e cestas pedidos para hoje. Quando a chamada da refeição já foi feita, a linha diz como foi. Na aba Refeições, os números do período ficam num cartão por refeição.' },
  { fase: 285, dia: '06/11/2026', aba: 'acolhidos',
    texto: 'A aba Judiciário do perfil em blocos que se abrem: Como ela chegou, Episódios de acolhimento e Comunicações a órgãos externos aparecem fechados, cada um com uma linha do que tem dentro, e o triângulo abre e fecha. Dentro da área restrita, a situação e o motivo vêm abertos, e a medida e o processo ficam num bloco à parte. Nada saiu da aba.' },
  { fase: 284, dia: '06/11/2026', aba: 'acolhidos',
    texto: 'Os atendimentos da equipe técnica, na aba Atendimentos do perfil: a área se chama Assistência Social, e cada atendimento diz se foi interno, na casa, ou externo, fora dela, o local e quem atendeu, quando não foi quem registrou. Os arquivos aparecem no próprio cartão, com Ver os arquivos, e quem registrou pode juntar um arquivo depois, como o laudo que chegou na semana seguinte. A técnica e a coordenação baixam os atendimentos do mês, do mês passado, de todo o acolhimento ou de datas escolhidas em Word, dizendo para quê.' },
  { fase: 283, dia: '06/11/2026', aba: 'dia',
    texto: 'Foi à aula hoje? No Dia da Casa, as crianças com aula no dia, de cada vínculo educacional. O plantão toca em Foi, Não foi (com o motivo informado) ou Não teve aula (feriado, recesso, suspensão), e pode juntar o bilhete ou o atestado. Sem marca, fica Ainda não verificado, e nunca vira falta. No perfil, na aba Educação, cada vínculo mostra os dias de aula do último mês, e a técnica e a coordenação marcam os dias de antes e corrigem com o motivo; a marca anterior continua legível.' },
  { fase: 282, dia: '06/11/2026', aba: 'acolhidos',
    texto: 'Os vínculos educacionais na aba Educação do perfil: escola, educação infantil, fundamental, médio, superior, EJA, técnico, educação integral, SCFV, aprendizagem, estágio e curso, em linha, do mais novo ao mais antigo, como contratos de tal época a tal época. A criança pode ter mais de um ao mesmo tempo, e Agora mostra o que vale em cada turno. O triângulo abre o vínculo inteiro: turma, série, dias, endereço, empresa, as notas da escola e o histórico. Corrigir pede o motivo e guarda o que estava antes; encerrar pede o dia e o porquê, e o vínculo continua na linha. A técnica, a coordenação e o Líder Diurno recebem o aviso no último mês e na última semana antes do fim previsto.' },
  { fase: 281, dia: '06/11/2026', aba: 'ata',
    texto: 'Quem escreve na ATA de outro turno: na ATA de cada turno escreve quem está na escala dele, e também a equipe técnica, a coordenação, a Enfermagem e o líder do turno. Quem não está na escala toca em Pedir para escrever neste turno e diz o motivo; o líder do turno ou a coordenação vê o pedido na própria ATA e autoriza ou recusa, e as duas coisas ficam registradas com o nome e a hora. Sem escala lançada no turno, ninguém é travado. Ler continua como era.' },
  { fase: 280, dia: '06/11/2026', aba: 'agenda',
    texto: 'A agenda com o compromisso inteiro: cada data diz com quem, o tipo, o horário de início e de fim com a duração, a hora de sair da casa, o local, o endereço, quem responde (o nome, ou quem estiver no plantão) e se está marcado ou desmarcado. Em cima, o período em grade, com quantos compromissos tem cada dia, e o toque leva até o dia. Ver mais 30 dias vai até um ano à frente.' },
  { fase: 279, dia: '06/11/2026', aba: 'escala',
    texto: 'A escala de plantão em calendário: o período em grade, e cada dia diz quantas pessoas estão de dia e de noite, com falta escrito no turno sem ninguém. Tocar num dia abre só aquele dia embaixo, com quem está, os horários e o líder do turno. As datas ficam em dois botões, Próximos 30 dias e Mês passado, e Outras datas abre o resto; o horário dos turnos e montar um mês vêm depois da grade.' },
  { fase: 278, dia: '06/11/2026', aba: 'dia',
    texto: 'O Dia da Casa abre em Pendentes: só o que ainda espera alguém. O que foi feito sai dessa lista e continua em Toda a rotina, em verde, com quem fez e a hora; Toda a rotina mostra o dia inteiro ou só a manhã, a tarde ou a noite. Cada linha diz Você quando a atividade é sua e Coletivo quando é de quem estiver no plantão, e Ver detalhes abre o resumo com o botão que leva ao registro de origem, na Saúde, na Chamada, na Agenda, nas Ocorrências ou na rotina da casa.' },
  { fase: 277, dia: '05/11/2026', aba: 'portaria',
    texto: 'As decisões da avaliação de 05/11. Na Portaria, o CPF e o RG do visitante aparecem escondidos para todos, e a portaria, a equipe técnica e a coordenação tocam em Ver o documento para ler os números inteiros; cada abertura fica registrada com o nome de quem abriu. A folha impressa para a guarita continua com o CPF inteiro. Nomes novos, sem tirar nada: O Dia da Casa (a tela do Dia), Vivências (uma aba do perfil com a vida na casa, as conquistas, as fotos e as memórias), Registro Educacional (na aba Educação) e Atas do Mês (o antigo Arquivo da ATA). E a demonstração fica mais parecida com uma casa de verdade: a Casa 03 com quinze acolhidos, as outras cinco crianças no acervo de quem saiu, e os nomes sem a palavra fictício, que fica só na faixa do alto.' },
  { fase: 276, dia: '05/11/2026', aba: 'chamada',
    texto: 'O funcionamento, como a avaliação pediu. A chamada confirmada diz no próprio cartão quem a abriu e quem a confirmou, com a hora, e ao confirmar a tela volta para a lista com o recado do que foi feito. A data e a hora ficam no alto de toda tela. As saídas de hoje dizem o dia, desde quando valem, quem decidiu e para onde. E o botão do recorte já escolhido, como os Próximos 30 dias da escala, fica marcado, para não parecer que não faz nada.' },
  { fase: 275, dia: '05/11/2026', aba: 'acolhidos',
    texto: 'O perfil da criança em ordem: em todas as abas, cada lista vem com o mais recente em cima e o mais antigo embaixo, com a data e, quando há, a hora. A aba Saúde ganha o histórico de saúde, com as consultas e os registros de quem acompanhou. Cada atendimento da equipe técnica tem o dia e a hora em que aconteceu e quando foi registrado, e a aba Atendimentos ganha a busca por palavra e por período. E o cadastro de acolhido avança: o CPF se confere sozinho ao completar os onze números, sem CPF a identificação aparece na hora, e o que falta para continuar fica escrito logo acima do botão.' },
  { fase: 274, dia: '05/11/2026', aba: 'acolhidos',
    texto: 'A foto grande: no perfil da criança, nos familiares, em quem visitou e na Portaria, tocar no rosto abre a foto do tamanho da tela, e o X fecha. No cartão de cada familiar, a equipe técnica e a coordenação põem, trocam e tiram a foto, e o familiar novo já pode nascer com ela. Tirar pede o motivo, e a foto de antes, a cada troca ou retirada, fica guardada no histórico com quem a pôs e quem a tirou. Os outros cargos veem a foto e não mexem. E o cartão do familiar diz o que faz: Editar (nome, vínculo, telefone, CPF e observação, com o motivo) e Retirar este familiar.' },
  { fase: 273, dia: '05/11/2026',
    texto: 'O que já foi feito fica verde: no Dia, a atividade concluída, a dose dada, a chamada confirmada e a ATA fechada; na Chamada, a chamada que alguém da equipe confirmou fica verde para todos. O verde vem sempre com o visto e a palavra. O que não foi feito, como não realizada, recusa, cancelada ou reagendada, continua em cinza.' },
  { fase: 272, dia: '05/11/2026',
    texto: 'A letra Grande e a Maior, escolhidas em Cor e letra da tela, agora cabem: no celular e no computador, nada passa da borda nem vaza dos botões, o que não cabe ao lado de um título desce para a linha de baixo, e o botão do fim de cada folha fica sempre à vista.' },
  { fase: 271, dia: '03/11/2026', aba: 'acolhidos',
    texto: 'No perfil da criança, na aba Família e visitas, a equipe técnica e a coordenação veem quando foi a última visita da família e a última ida à casa dela, e há quantos dias, para procurar a família a tempo. Só no perfil de cada criança, sem cor e sem lista entre crianças.' },
  { fase: 270, dia: '03/11/2026', aba: 'acolhidos',
    texto: 'A saída com a história: na aba Documentos do perfil, e na própria folha da saída, a equipe técnica e a coordenação preparam a folha de transição, para quem recebe a criança (cuidados, alergias, alimentação, remédios com os horários, escola e os documentos, com o recibo), e o livro da vida, para ela (as conquistas e as vivências, só com as fotografias autorizadas). Nada da área restrita vai em nenhuma das duas.' },
  { fase: 269, dia: '03/11/2026', aba: 'acolhidos',
    texto: 'O prazo da reavaliação ao Juízo: a área restrita do perfil, na aba Judiciário, diz quando foi o último relatório de reavaliação e até quando vai o próximo, no máximo a cada três meses, e há quanto tempo a criança está em acolhimento. A técnica e a coordenação são avisadas quinze dias antes. Anexe o relatório enviado no dossiê como Relatório de reavaliação, com a data do envio.' },
  { fase: 268, dia: '03/11/2026',
    texto: 'Conferimos, em todas as telas e em todos os cargos, no celular e no computador, o botão que grava uma vez só, o motivo da recusa perto do dedo e a frase de quando falta internet. Nada mudou no que você vê.' },
  { fase: 267, dia: '03/11/2026',
    texto: 'Sem internet, a tela diz a verdade: a linha da ATA, a ocorrência e os outros registros mostram, perto do botão, que NÃO foram salvos, e o texto continua no campo para você tocar de novo quando o sinal voltar. Só a chamada, a passagem e o Concluí do Dia ficam guardados no aparelho, e dizem isso.' },
  { fase: 266, dia: '03/11/2026',
    texto: 'Quando um registro não pode ser gravado e o motivo ficou fora da vista, lá no alto da tela ou da folha, o motivo aparece também logo acima do botão que você tocou, com um Entendi.' },
  { fase: 265, dia: '03/11/2026',
    texto: 'O botão que grava não grava duas vezes: enquanto o registro vai, ele fica pálido e não aceita outro toque, mesmo com a internet lenta. E quando gravou, o próprio botão diz Registrado às e a hora, por um instante, ali onde o dedo está.' },
  { fase: 264, dia: '03/11/2026',
    texto: 'Sem mudança nas telas: o servidor passou para a versão nova da peça que o sustenta, e com ela fecharam as últimas correções de segurança que faltavam. Tudo o que funcionava continua igual.' },
  { fase: 263, dia: '02/11/2026',
    texto: 'Uma revisão do sistema inteiro e do banco de dados, sem mudança nas telas. O servidor ganhou as correções de segurança de cinco peças que ele usa, entre elas uma que permitia esconder de onde vinha um acesso. O resto conferido está em ordem.' },
  { fase: 262, dia: '02/11/2026',
    texto: 'Uma conferência, sem mudança na tela: trinta dias da Casa 03 simulados contra o sistema de verdade, todas as telas de todos os cargos abertas no celular, e a Acolhe+AI pedida por texto e por voz em cada uma. Nada fora do lugar.' },
  { fase: 261, dia: '02/11/2026',
    texto: 'O mesmo cuidado chegou às abas de dentro das telas: as Saídas das crianças na Portaria, as Compras na Saúde e as Comunicações externas nas Ocorrências esperam a resposta antes de dizer que não há nada.' },
  { fase: 260, dia: '02/11/2026',
    texto: 'Com a internet lenta, as telas não dizem mais que não há nada antes de a resposta chegar. Antes, por um instante, a tela dizia Nenhum acolhido ou Nenhum plantão aberto enquanto ainda buscava. E a Cozinha avisa quando não conseguiu buscar os pedidos, em vez de dizer que ninguém pediu.' },
  { fase: 259, dia: '01/11/2026',
    texto: 'Quando um aviso, a linha do dia ou a busca levam você a outra tela, o que você foi buscar aparece contornado por um instante. O número do sino acende quando muda, a Acolhe+AI mostra três pontinhos enquanto pensa, o microfone ligado ganha um anel em volta, e o Como funciona abre o texto suave.' },
  { fase: 258, dia: '01/11/2026',
    texto: 'As telas respondem ao toque: o botão afunda quando se aperta, a folha sobe de baixo e a tela que se abre aparece de leve. Tudo rápido, para não atrasar o plantão. Quem ligou Reduzir movimento no celular vê só a mudança de cor.' },
  { fase: 257, dia: '01/11/2026', aba: 'acolhidos',
    texto: 'No protótipo, os retratos desenhados das crianças foram refeitos: cada um mostra a idade, o tom de pele e o cabelo da criança, e as roupas não usam mais as cores de alerta. Continuam sendo desenhos, e no sistema de verdade aparece a foto ou as iniciais.' },
  { fase: 256, dia: '31/10/2026',
    texto: 'Pequenos acertos de tela: o número do sino muda junto com o aviso marcado como lido, o perfil da criança não dá mais um pulo quando a foto chega, o recado da Chamada sem internet aparece logo acima da barra de baixo, com Fechar, e no protótipo as doses da Saúde ficam na ordem da hora.' },
  { fase: 255, dia: '31/10/2026',
    texto: 'Conferimos que toda tela cabe, rola até o fim e tem como voltar, em cada cargo, no celular e no computador. Ganharam caminho de volta: a folha do acompanhamento (Fechar), a lista inteira das visitas no perfil (Mostrar só as cinco mais recentes), a área restrita do Judiciário (Fechar a área restrita) e a folha das oito casas aberta pelo Arquivo da ATA (Voltar ao Arquivo).' },
  { fase: 254, dia: '30/10/2026',
    texto: 'O tema alto contraste saiu da folha Cor da tela, a pedido da Fundação, e as outras sete cores continuam. E pequenos consertos que a equipe de design achou: a hora da linha do Dia aparece inteira no celular, a borda dos campos de escrever ficou mais visível, a Cozinha tem as suas telas direto na barra de baixo, a tecla Esc fecha a folha que não tem nada escrito, e a Chamada e os Avisos não dizem que está vazio antes de carregar.' },
  { fase: 253, dia: '28/10/2026', aba: 'acolhidos',
    texto: 'Conferimos o cadastro de uma criança de ponta a ponta, o perfil com as oito abas, os documentos do dossiê e todos os menus de todos os cargos. No protótipo, a criança cadastrada agora mostra só o que foi registrado, e o que se escreve na chegada (quem trouxe, a referência familiar e como chegou) aparece no perfil, na aba Judiciário.' },
  { fase: 252, dia: '28/10/2026',
    texto: 'Nada muda na tela. Para quem cuida do sistema: conferimos que todo registro que espera uma resposta tem como terminar e que tudo o que se grava chega a alguém, e corrigimos a descrição da substituição no documento das tabelas.' },
  { fase: 251, dia: '28/10/2026', aba: 'alinhamentos',
    texto: 'O Líder Noturno Geral passa a ter os Combinados da equipe no menu: lê o que a casa combinou em reunião e responde ali a pauta que o educador da noite propõe. O aviso do combinado novo agora leva até a tela.' },
  { fase: 250, dia: '27/10/2026',
    texto: 'Quando uma ocorrência grave pede o relato de quem estava no turno, cada pessoa recebe no sino o aviso O seu relato foi pedido, com o botão que abre as Ocorrências. Escreva o que viu ou marque Não presenciei.' },
  { fase: 249, dia: '27/10/2026',
    texto: 'Os avisos do sino agora dizem em que tela continua e têm o botão Abrir, que leva até lá. Quando um registro feito sem internet não pode ser gravado, a equipe técnica e a coordenação são avisadas para decidir. E no atendimento de saúde, diga se a consulta é o retorno marcado: ele fica como Retorno feito e deixa de aparecer como data passada.' },
  { fase: 248, dia: '27/10/2026',
    texto: 'No Painel do plantão, o pedido de substituição agora se resolve ali mesmo: passe a atividade para outra pessoa ou recuse com o motivo. As quantidades aparecem por extenso, como 1 passagem assinada e 3 vagas, a Portaria ficou mais curta de rolar e a regra das doses na Saúde deixou de aparecer em vermelho.' },
  { fase: 247, dia: '26/10/2026',
    texto: 'Para quem cuida do servidor: a conferência da instalação pergunta ao computador da Acolhe+AI se ele responde e se tem o modelo escrito na configuração, e reprova quando a Acolhe+AI ficaria só no modo guia sem ninguém perceber.' },
  { fase: 246, dia: '26/10/2026',
    texto: 'Cada setor vê só o que é dele. O Gestor Geral acompanha a ATA, o Dia, a internação, a Cozinha, os combinados, a rotina e a escala de cada casa sem registrar nelas, e continua escrevendo a regra que vale para as oito casas. Saíram os botões que apareciam e não funcionavam para o cargo, e os Combinados da equipe ficam numa tela só.' },
  { fase: 245, dia: '25/10/2026', aba: 'saude',
    texto: 'Quem ativa o remédio da receita, e faz a dose entrar na grade, é só a Enfermagem. De noite, a coordenação ou a técnica cadastram o rascunho e anexam a foto da receita, e a Enfermagem é avisada para conferir e ativar. A dose daquela noite, a educadora dá conforme a receita e escreve na ATA.' },
  { fase: 244, dia: '24/10/2026',
    texto: 'Você pode ensinar à Acolhe+AI o jeito de falar da casa: em Ensinar uma palavra, escreva a palavra e o que ela quer dizer. A coordenação confere nas Sugestões de melhoria e, quando aprova, a Acolhe+AI de todo mundo passa a entender.' },
  { fase: 243, dia: '24/10/2026',
    texto: 'Peça à Acolhe+AI o relatório do período da casa, das visitas, da internação ou a trajetória, e ela leva até ele. E, quando você escrever uma palavra que rotula a criança, como agressivo, aparece embaixo do campo a sugestão de escrever o fato. É só sugestão: você salva como quiser.' },
  { fase: 242, dia: '24/10/2026',
    texto: 'No começo do plantão, pergunte à Acolhe+AI o que você precisa saber, e ela leva ao que mudou desde o seu último plantão. No fim, peça o rascunho da ATA. E, com as mãos ocupadas, toque em Conversa por voz: você fala, ela responde em voz alta e volta a ouvir.' },
  { fase: 241, dia: '24/10/2026',
    texto: 'Antes de escolher o modelo da Acolhe+AI no computador do Pão, a TI pode medir: as frases do plantão e os pedidos que ela tem de recusar, com quantas foram bem atendidas e quanto tempo cada uma levou.' },
  { fase: 240, dia: '24/10/2026',
    texto: 'A resposta da Acolhe+AI aparece enquanto ela escreve. E, se o computador dela não responder, ela avisa e segue ajudando pelo guia, sem ler os dados da casa; a pergunta seguinte tenta de novo.' },
  { fase: 239, dia: '23/10/2026',
    texto: 'A Acolhe+AI pode funcionar num computador da própria Fundação, sem custo por pergunta e sem limite por pessoa. Quando muita gente pergunta ao mesmo tempo, as perguntas esperam a vez. Para quem usa, a conversa é a mesma de sempre.' },
  { fase: 238, dia: '23/10/2026',
    texto: 'A Acolhe+AI entende o jeito de falar do plantão: piá, guria, piripaque, pelando, se mandou, deu um piti, saíram no tapa, livro do plantão, e as siglas da rede (CT, CRAS, CREAS, CAPS, UBS, MP). Ela continua respondendo no português de sempre.' },
  { fase: 237, dia: '23/10/2026', aba: 'acolhidos',
    texto: 'O relatório das vivências em Word: no álbum de vivências de cada criança, o botão Relatório das vivências em Word. Você escolhe o período, os tipos, quais vivências entram e se vai com as fotos, confere a folha e baixa. As fotos seguem o seu cargo: técnica, líderes, coordenação e gestão colocam todas; nos outros cargos, a foto sem autorização de imagem sai só com a legenda. E a Acolhe+AI entende quando você pede esse relatório.' },
  { fase: 236, dia: '23/10/2026', aba: 'periodo',
    texto: 'O relatório do período da casa ganhou gráficos no Word, as doses deste período e do anterior e os registros da casa, com o número escrito ao lado de cada barra, e o botão Baixar a planilha, que entrega os mesmos quadros para abrir no Excel. A planilha pede a finalidade e fica registrada como o Word.' },
  { fase: 235, dia: '23/10/2026', aba: 'acolhidos',
    texto: 'Corrigir o cadastro pelo papel: com o texto da certidão, do RG ou do cartão SUS conferido no dossiê, a folha Corrigir o cadastro sugere o nome, a data de nascimento, o RG, o cartão SUS e a filiação, cada um com o trecho de onde saiu. Você marca o que quer, os campos se preenchem, e a correção continua com o seu motivo. Se o nome do papel for bem diferente do cadastro, a folha avisa para conferir se o papel é desta criança.' },
  { fase: 234, dia: '23/10/2026', aba: 'acolhidos',
    texto: 'O texto do papel: na prévia de um documento do dossiê e no Ver de cada anexo, o botão Ler o texto do papel lê a foto ou o PDF neste aparelho, sem mandar a imagem para fora. Você confere com o papel e corrige; a técnica, a coordenação e a Enfermagem guardam o texto conferido, e a busca do dossiê acha o ofício, a guia ou a receita pelo que está escrito neles.' },
  { fase: 233, dia: '22/10/2026', aba: 'ata',
    texto: 'A linha da ATA, o diário da internação, a ocorrência, o atendimento técnico e a conversa com a Acolhe+AI levam até 10 fotos ou documentos por mensagem. A câmera tira várias fotos seguidas, como no WhatsApp, e cada uma aparece em miniatura, com Ver e Tirar, antes de enviar. E o Exportar dos benefícios, no Cofre, agora entrega o documento em Word.' },
  { fase: 232, dia: '20/10/2026', aba: 'acolhidos',
    texto: 'No perfil da criança, a Vida na casa entrou na aba Geral, e a aba Cadastro virou Documentos: abre no dossiê e na lista dos documentos, e o histórico de quem mexeu fica no fim.' },
  { fase: 231, dia: '20/10/2026', aba: 'guia',
    texto: 'Chegou este Guia: cada tela que você alcança, o que você faz nela e o que a Acolhe+AI faz junto, as abas do perfil da criança e as novidades de cada atualização.' },
  { fase: 230, dia: '19/10/2026',
    texto: 'As explicações do alto das telas ficaram recolhidas: a primeira frase fica à vista, e o Como funciona abre o resto. O alerta e o aviso com número continuam à vista.' },
  { fase: 229, dia: '19/10/2026', aba: 'acolhidos',
    texto: 'A folha dos remédios que vão com a criança para a família conta só os dias em que a receita vale.' },
  { fase: 225, dia: '19/10/2026', aba: 'casas',
    texto: 'Cada uma das oito casas tem a sua equipe, as suas crianças e o seu endereço na lista das unidades.' },
  { fase: 221, dia: '14/10/2026', aba: 'acolhidos',
    texto: 'O perfil da criança abre na aba Geral, e cada aba traz os números dela.' },
];
