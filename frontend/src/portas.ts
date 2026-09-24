/**
 * AS PORTAS DO SISTEMA — uma lista só (fase 150).
 *
 * ELA EXISTIA EM DOIS LUGARES, e é a lição da fase 145 outra vez: um vetor de
 * chaves (`doMais`) dizia QUAIS telas o cargo alcança, e vinte e cinco blocos
 * escritos à mão no `App.tsx` diziam COMO cada uma se chama. Duas listas sobre
 * a mesma coisa divergem no dia em que alguém acrescenta a tela numa e esquece
 * a outra — e o sintoma seria o pior: a tela existe, o cargo a alcança, e não
 * há porta para ela em lugar nenhum.
 *
 * Aqui é uma só, e três coisas leem dela: a folha "Mais" do celular, a barra
 * lateral do monitor e a conferência. *Medido ao escrever isto: o `doMais`
 * tinha vinte e três chaves e a folha tinha vinte e cinco botões — a rotina da
 * casa e a escala de plantão estavam na folha e fora da contagem.*
 *
 * O TEXTO NÃO FOI REDIGITADO: ele foi extraído do que já estava na tela, em
 * código. Redigitar rótulo de memória é como se inventa nome de tela — e a
 * casa já pagou por isso (fases 1450 e 1460, com SQL).
 *
 * `grupo` é só da barra lateral: no celular a folha continua sendo uma lista
 * corrida, porque rolar é mais barato que decidir em qual seção olhar.
 */
export interface Porta {
  /** A mesma chave do `setAba` e do `alcanca()` — é ela que liga tudo. */
  aba: string;
  /** Nome em `icones.tsx`. Sem desenho, a porta aparece só com a palavra. */
  icone: string;
  grupo: 'cotidiano' | 'registro' | 'gestao' | 'sistema';
  titulo: string;
  descricao: string;
}

/** Como cada grupo se chama na barra lateral. */
export const GRUPOS: { cod: Porta['grupo']; titulo: string }[] = [
  { cod: 'cotidiano', titulo: 'O dia a dia' },
  { cod: 'registro', titulo: 'Registro e cuidado' },
  { cod: 'gestao', titulo: 'Equipe e gestão' },
  { cod: 'sistema', titulo: 'Sistema' },
];

/** A ordem é a que a equipe já conhece — a da folha "Mais" de hoje. */
export const PORTAS: Porta[] = [
  { aba: 'unidades', icone: 'linha_do_dia', grupo: 'cotidiano',
    titulo: 'O dia, em ordem',
    descricao: 'Todas as unidades que você acompanha, das 00h às 23h59.' },
  { aba: 'plantao', icone: 'bussola', grupo: 'cotidiano',
    titulo: 'Painel do plantão',
    descricao: 'Quem está em quê agora, neste turno.' },
  { aba: 'agenda', icone: 'agenda', grupo: 'cotidiano',
    titulo: 'Agenda',
    descricao: 'O que está marcado e o que vem pela frente.' },
  { aba: 'rotina', icone: 'rotina', grupo: 'cotidiano',
    titulo: 'A rotina da casa',
    descricao: 'O molde do dia — e as versões que a casa já seguiu.' },
  { aba: 'escala', icone: 'escala', grupo: 'cotidiano',
    titulo: 'A escala de plantão',
    descricao: 'Quem assume cada dia e cada turno — e o que já passou.' },
  { aba: 'equipe', icone: 'equipe', grupo: 'gestao',
    titulo: 'Equipe',
    descricao: 'Quem trabalha nesta casa, por setor.' },
  { aba: 'trabalho', icone: 'trabalho', grupo: 'gestao',
    titulo: 'O trabalho da equipe',
    descricao: 'O que cada pessoa e cada setor registrou, em ordem. Sem contar nada.' },
  { aba: 'periodo', icone: 'periodo', grupo: 'gestao',
    titulo: 'O período da casa',
    descricao: 'Como foi a casa na semana, no mês ou no intervalo que você escolher.' },
  { aba: 'cozinha', icone: 'cozinha', grupo: 'cotidiano',
    titulo: 'Cozinha',
    descricao: 'Pedir lanche e cesta básica, e gerar as folhas para a cozinha.' },
  { aba: 'campos_do_perfil', icone: 'olho', grupo: 'gestao',
    titulo: 'O que o plantão vê',
    descricao: 'Liga e desliga campos do perfil para quem está no turno.' },
  { aba: 'portaria', icone: 'portaria', grupo: 'cotidiano',
    titulo: 'Portaria',
    descricao: 'Quem pode visitar cada criança, e a folha em Word para a guarita.' },
  { aba: 'setores', icone: 'setores', grupo: 'gestao',
    titulo: 'O que cada setor enxerga',
    descricao: 'A resposta escrita, sem entrar com a conta de ninguém.' },
  { aba: 'ocorrencias', icone: 'ocorrencias', grupo: 'registro',
    titulo: 'Ocorrências',
    descricao: 'Abrir, acompanhar e encerrar com análise — nunca sozinha.' },
  { aba: 'ata', icone: 'ata', grupo: 'registro',
    titulo: 'ATA',
    descricao: 'A da casa e a Geral Noturna, com pendência quando for o caso.' },
  { aba: 'impacto', icone: 'impacto', grupo: 'gestao',
    titulo: 'O trabalho social',
    descricao: 'As oito casas pelo que o acolhimento produziu, e não pelo turno de hoje.' },
  { aba: 'internacao', icone: 'internacao', grupo: 'registro',
    titulo: 'Internação hospitalar',
    descricao: 'Quem está no hospital, o diário do período e a medicação de lá.' },
  { aba: 'saude', icone: 'saude', grupo: 'registro',
    titulo: 'Saúde',
    descricao: 'Doses do dia, estoque, triagem e resumo de saúde.' },
  { aba: 'alinhamentos', icone: 'alinhamentos', grupo: 'registro',
    titulo: 'Combinados da equipe',
    descricao: 'O que ficou estabelecido nas reuniões, e o que está valendo agora.' },
  { aba: 'acompanhamentos', icone: 'acompanhamentos', grupo: 'registro',
    titulo: 'Acompanhamentos',
    descricao: 'Eixos obrigatórios, aprovação e relatórios.' },
  { aba: 'painel', icone: 'unidades', grupo: 'gestao',
    titulo: 'Painel das unidades',
    descricao: 'Ocupação, entradas e saídas, e o quadro de cada mês. Sem ranking.' },
  { aba: 'sincronizacao', icone: 'sincronizacao', grupo: 'sistema',
    titulo: 'Sincronização',
    descricao: 'O que ficou pendurado entre o aparelho e o servidor, e o que espera decisão da equipe.' },
  { aba: 'arquivo', icone: 'arquivo', grupo: 'sistema',
    titulo: 'Arquivo documental',
    descricao: 'Cópia do que fechou, com versões e fila de envio.' },
  { aba: 'transferencias', icone: 'transferencias', grupo: 'sistema',
    titulo: 'Transferências',
    descricao: 'Pedidos enviados e recebidos, com conversa entre coordenações.' },
  { aba: 'cofre', icone: 'cofre', grupo: 'sistema',
    titulo: 'Cofre de acessos',
    descricao: 'Contas do acolhido. Pede a sua senha de novo e é auditado.' },
  { aba: 'casas', icone: 'casas', grupo: 'gestao',
    titulo: 'Unidades',
    descricao: 'As unidades no seu alcance.' },
];
