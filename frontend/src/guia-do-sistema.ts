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
    texto: 'A primeira aba: idade, casa, há quanto tempo está no acolhimento, escola, a equipe de referência, a família, os cuidados essenciais, os próximos compromissos e a identificação. Embaixo, a vida na casa: aniversário, conquistas, fotos (com quem aparece em cada uma) e memórias, e o botão do dossiê. O PIA aparece para a equipe técnica.' },
  { id: 'familia', titulo: 'Família e visitas',
    texto: 'Os contatos da família, as visitas com o relatório, as saídas, a convivência familiar e os números da convivência. O contato se corrige com o motivo, e o de antes fica guardado.' },
  { id: 'saude', titulo: 'Saúde',
    texto: 'Os números dos últimos trinta dias, as alergias, condições e restrições com o laudo ou a receita anexados, e os remédios em uso com as receitas.' },
  { id: 'rotina', titulo: 'Dia a dia',
    texto: 'O que a casa registrou num dia escolhido (refeição, remédio, chamada, saídas), para consultar, e as chamadas dos últimos trinta dias.' },
  { id: 'educacao', titulo: 'Educação',
    texto: 'A escola, a evolução educacional e o conceito de cada bimestre, com o porquê.' },
  { id: 'atendimentos', titulo: 'Atendimentos',
    texto: 'O relatório da equipe técnica (psicologia, psicopedagogia, serviço social e pedagogia), o mais recente em cima, com os números por área e os arquivos de cada atendimento.',
    quem: 'Aparece para a equipe técnica, a coordenação e a gestão.' },
  { id: 'judiciario', titulo: 'Judiciário',
    texto: 'Como a criança chegou, a área restrita com os documentos que a equipe técnica guarda ali (a guia, as decisões, o relatório de acolhimento) e os ofícios.',
    quem: 'A área restrita abre para a equipe técnica e a coordenação.' },
  { id: 'documentos', titulo: 'Documentos',
    texto: 'Começa pelo dossiê (certidão, RG, carteira de vacina, receitas, laudos, PIA, cada um com a validade e o que falta) e pela lista dos documentos da criança. Depois, corrigir e atualizar o cadastro, as correções feitas e quem mexeu no perfil, com data e nome.' },
];

/** O alto do perfil, que vem antes das abas. */
export const ALTO_DO_PERFIL = 'No alto do perfil, sempre à vista, ficam a alergia, a restrição alimentar e os cuidados que protegem a criança. Embaixo vêm as abas, cada uma com uma cor e o nome escrito. O dia de hoje da casa (o remédio da próxima hora, a chamada do almoço) fica no Dia, na Chamada e na ATA.';

/** O que a Acolhe+AI faz em qualquer tela, contado em frases. */
export const A_ACOLHE_EM_TODA_TELA: string[] = [
  'A Acolhe+AI fica no botão do canto da tela, em todas as telas. Ela conversa por texto e pela voz, e vê só o que você vê: lê os dados com o seu acesso, pelas mesmas telas que você usa.',
  'Ela explica qualquer tela, leva você até ela e abre o formulário que você pedir. Na primeira vez ela pergunta se pode mexer na tela; depois escreve à vista, campo por campo, e no fim você confere e salva. Ela nunca salva sozinha.',
  'Ela redige relatório pela voz: você conta à vontade, ela organiza o texto na linguagem da equipe e mostra o rascunho para você editar, completar falando ou ilustrar com foto.',
  'Ela faz contas e monta tabelas que você baixa como planilha, lê foto ou PDF que você anexar (receita, nota de compra, alta do hospital) e propõe onde guardar.',
  'Ela não decide diagnóstico, culpa, risco, punição, remédio ou destino de criança, não compara crianças nem casas, não assina no lugar de ninguém e não apaga nada. Em urgência, ela diz primeiro o que fazer pela criança.',
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
  { fase: 254, dia: '30/10/2026',
    texto: 'O tema alto contraste saiu da folha Cor da tela, a pedido da Fundação. Quem tinha escolhido o alto contraste volta ao claro ou ao escuro do aparelho, e as outras sete cores continuam.' },
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
    texto: 'No começo do plantão, pergunte à Acolhe+AI o que você precisa saber, e ela leva ao que mudou desde o seu último plantão. No fim, peça o rascunho da ATA. E, com as mãos ocupadas, marque Mãos ocupadas: você fala, ela responde em voz alta e volta a ouvir.' },
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
