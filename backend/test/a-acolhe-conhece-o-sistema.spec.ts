/**
 * A ACOLHE+AI CONHECE O SISTEMA DE HOJE (fase 193; pedido de 08/10).
 *
 * O pedido foi uma regra: *"tudo que criamos a mais, atualizar também a nossa
 * IA interna, para ela estar sempre atualizada"*. Regra escrita que o teste
 * não cobra é conselho (fase 167), e por isso ela mora aqui, negando por
 * padrão (fase 153):
 *
 *  1. toda rota GET do servidor está no catálogo do guia, é arquivo (folha,
 *     foto, anexo) ou está em `FORA_DO_CATALOGO` com o motivo escrito. Rota
 *     nova reprova até alguém dizer à assistente o que ela é;
 *  2. toda tela do sistema (as abas do turno, as portas e o sino) está no guia
 *     pela chave, com a frase do que faz. Tela nova reprova do mesmo jeito;
 *  3. toda ferramenta está no guia e é executada pela tela;
 *  4. o guia não usa o travessão que ele próprio proíbe;
 *  5. botão marcado `data-acolhe-abre` só muda estado da tela: é o único que a
 *     assistente aperta, e o nome do botão não diz se ele grava;
 *  6. a conta que ela mostra à pessoa é exata.
 *
 * Estático, como o `contrato-rotas.spec.ts`: precisa reprovar no `npm test`
 * de quem acrescentou a rota, e não numa conversa com a assistente meses
 * depois.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FORA_DO_CATALOGO, GUIA_DA_ACOLHE } from '../src/modules/assistente/guia';
import { FERRAMENTAS, LEITURA_PROIBIDA, MEXEM_NA_TELA, rotaDeLeituraPermitida } from '../src/modules/assistente/ferramentas';
import { calcular } from '../src/modules/assistente/calculo';
import { GLOSSARIO_DA_CASA, PALAVRAS_DA_CASA, palavrasEnsinadas, traduzirPalavrasDaCasa } from '../src/modules/assistente/palavras-da-casa';
import { palavrasQueRotulam, sugestaoDoFato } from '../src/modules/assistente/palavras-que-rotulam';
import { criancasNoPedido, ehPergunta, pedeAcao, pedeFormulario, responderPeloGuia } from '../../frontend/src/acolhe-guia';

const SRC = join(__dirname, '..', 'src');
const FRONT = join(__dirname, '..', '..', 'frontend', 'src');

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, filtro));
    else if (filtro(e)) out.push(p);
  }
  return out;
}

/** As rotas GET do servidor, com `:x` no lugar de todo parâmetro. */
function leiturasDoServidor(): string[] {
  const out = new Set<string>();
  for (const arq of arquivos(SRC, (f) => f.endsWith('.controller.ts'))) {
    const src = readFileSync(arq, 'utf8');
    const blocos = [...src.matchAll(/@Controller\(\s*'([^']*)'/g)].map((m) => ({ pos: m.index ?? 0, base: m[1] }));
    blocos.forEach((b, i) => {
      const trecho = src.slice(b.pos, i + 1 < blocos.length ? blocos[i + 1].pos : src.length);
      for (const m of trecho.matchAll(/@Get\(\s*(?:'([^']*)')?\s*\)/g)) {
        out.add(('/' + [b.base, m[1] ?? ''].filter(Boolean).join('/')).replace(/:\w+/g, ':x'));
      }
    });
  }
  return [...out].sort();
}

const catalogo = GUIA_DA_ACOLHE.split('\n').filter((l) => /^- \/[a-z]/.test(l))
  .map((l) => l.slice(2).split(/\s/)[0].split('?')[0].replace(/\bID\b/g, ':x'));

describe('a Acolhe+AI conhece o sistema de hoje', () => {
  it('toda rota de leitura do servidor está no catálogo, é arquivo, ou está fora com o motivo escrito', () => {
    const rotas = leiturasDoServidor();
    expect(rotas.length).toBeGreaterThan(150);
    const semLugar = rotas.filter((r) => !catalogo.includes(r) && !LEITURA_PROIBIDA.test(r) && !(r in FORA_DO_CATALOGO));
    // Rota nova? Escreva no catálogo do `guia.ts` (com a consulta e a frase), ou
    // em FORA_DO_CATALOGO com o motivo. É assim que a assistente acompanha a fase.
    expect(semLugar).toEqual([]);
  });

  it('a lista do que fica fora não guarda rota que não existe, nem rota que está no catálogo', () => {
    const rotas = leiturasDoServidor();
    const velhas = Object.keys(FORA_DO_CATALOGO).filter((r) => !rotas.includes(r) || catalogo.includes(r));
    expect(velhas).toEqual([]);
    for (const motivo of Object.values(FORA_DO_CATALOGO)) expect(motivo.length).toBeGreaterThan(10);
  });

  it('toda rota do catálogo passa pela conferência que a tela faz antes de ler', () => {
    expect(catalogo.filter((r) => !rotaDeLeituraPermitida(r.replace(/:x/g, 'x')))).toEqual([]);
  });

  it('toda tela do sistema está no guia pela chave', () => {
    const portas = [...readFileSync(join(FRONT, 'portas.ts'), 'utf8').matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    const app = readFileSync(join(FRONT, 'App.tsx'), 'utf8');
    const trecho = app.slice(app.indexOf('const abasDoTurno = ['), app.indexOf('].filter((t) => ve(t.aba))'));
    const doTurno = [...trecho.matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(portas.length).toBeGreaterThan(20);
    expect(doTurno.length).toBeGreaterThanOrEqual(5);
    const telas = [...new Set([...doTurno, ...portas, 'avisos'])];
    const secao = GUIA_DA_ACOLHE.slice(GUIA_DA_ACOLHE.indexOf('# As telas do sistema'), GUIA_DA_ACOLHE.indexOf('# As rotas que você pode ler'));
    expect(telas.filter((t) => !new RegExp(`^- [^\\n]*\\(${t}\\): \\S`, 'm').test(secao))).toEqual([]);
    // E o guia não descreve tela que não existe mais.
    const noGuia = [...secao.matchAll(/^- [^(\n]*\(([a-z_]+)\):/gm)].map((m) => m[1]);
    expect(noGuia.filter((t) => !telas.includes(t))).toEqual([]);
  });

  it('toda ferramenta está explicada no guia e é executada pela tela', () => {
    const tela = readFileSync(join(FRONT, 'acolhe.tsx'), 'utf8');
    for (const f of FERRAMENTAS) {
      expect([f.name, GUIA_DA_ACOLHE.includes(f.name)]).toEqual([f.name, true]);
      const executada = tela.includes(`'${f.name}'`) || (f.name.startsWith('propor_') && tela.includes("nome.startsWith('propor_')"));
      expect([f.name, executada]).toEqual([f.name, true]);
    }
    const nomes = FERRAMENTAS.map((f) => f.name as string);
    expect(MEXEM_NA_TELA.filter((n) => !nomes.includes(n))).toEqual([]);
  });

  it('o guia escreve como pede: sem travessão', () => {
    expect(GUIA_DA_ACOLHE).not.toMatch(/[—–]/);
  });

  it('botão que a assistente pode apertar só abre: o clique dele não grava', () => {
    const achados: string[] = [];
    let total = 0;
    let entradas = 0;
    // O `acolhe.tsx` e o `acolhe-tela.ts` LEEM as marcas; quem as põe são as telas.
    // `data-acolhe-abre` abre um formulário; `data-acolhe-entra` (fase 196) entra
    // num registro (o cartão da internação). A conferência é a mesma: só estado.
    for (const arq of arquivos(FRONT, (f) => f.endsWith('.tsx') && f !== 'acolhe.tsx')) {
      const src = readFileSync(arq, 'utf8');
      for (const marca of ['data-acolhe-abre', 'data-acolhe-entra']) {
        const formato = new RegExp(`<button ${marca}=""[^>]*?onClick=\\{\\(\\) => (\\{[^}]*\\}|[^}]*?)\\}\\s*>`, 'g');
        let conferidos = 0;
        for (const m of src.matchAll(formato)) {
          conferidos++;
          if (marca === 'data-acolhe-abre') total++; else entradas++;
          const corpo = m[1].trim().replace(/^\{\s*|\s*\}$/g, '');
          const soEstado = corpo.split(';').map((x) => x.trim()).filter(Boolean)
            .every((x) => /^set[A-Z]\w*\([^()]*\)$/.test(x));
          if (!soEstado) achados.push(`${arq.slice(FRONT.length + 1)}: ${corpo}`);
        }
        const marcados = (src.match(new RegExp(marca, 'g')) ?? []).length;
        if (marcados !== conferidos) achados.push(`${arq.slice(FRONT.length + 1)}: ${marcados - conferidos} ${marca} fora do formato conferido`);
      }
    }
    expect(entradas).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(15);
    expect(achados).toEqual([]);
  });
});

describe('a conta da Acolhe+AI', () => {
  const v = (c: string) => {
    const r = calcular(c);
    if (!r.ok) throw new Error(r.erro);
    return r.valor;
  };
  it('faz as quatro operações na ordem certa, com parênteses e potência', () => {
    expect(v('2 + 3 * 4')).toBe(14);
    expect(v('(2 + 3) * 4')).toBe(20);
    expect(v('2 ^ 3 ^ 2')).toBe(512);
    expect(v('-3 + 10 / 4')).toBe(-0.5);
    expect(v('17 % 5')).toBe(2);
  });
  it('soma uma nota fiscal sem o erro do ponto flutuante na tela', () => {
    expect(v('arred(soma(12.9, 7.35, 30, 4.1))')).toBe(54.35);
    expect(v('arred(0.1 + 0.2)')).toBe(0.3);
  });
  it('conhece média, mínimo, máximo, porcentagem e raiz', () => {
    expect(v('media(10, 20, 30)')).toBe(20);
    expect(v('média(1, 2)')).toBe(1.5);
    expect(v('min(4, 2, 9)')).toBe(2);
    expect(v('max(4, 2, 9)')).toBe(9);
    expect(v('pct(18, 20)')).toBe(90);
    expect(v('raiz(81)')).toBe(9);
    expect(v('arred(2 / 3, 0)')).toBe(1);
  });
  it('recusa o que não é conta, em português, e nunca executa código', () => {
    for (const c of ['', '1 / 0', 'alert(1)', 'process.exit()', '2 +', '(1 + 2', '1 + 2)', 'soma(1, 2', 'pct(1)', '3 ; 4', 'raiz(-1)']) {
      const r = calcular(c);
      expect([c, r.ok]).toEqual([c, false]);
      if (!r.ok) expect(r.erro).toMatch(/[a-zà-ú]/i);
    }
    expect(calcular('x'.repeat(5000))).toEqual({ ok: false, erro: 'A conta é longa demais: divida em partes.' });
  });
});

/*
 * O MODO GUIA (fases 195 e 196), sem a chave: o que a medição do `ensaio:acolhe`
 * achou pedindo de verdade, guardado aqui para não voltar.
 */
describe('o modo guia entende o pedido', () => {
  const TELAS = [
    { chave: 'dia', titulo: 'Dia' }, { chave: 'ata', titulo: 'ATA do turno' },
    { chave: 'acolhidos', titulo: 'Acolhidos' }, { chave: 'sugestoes', titulo: 'Sugestões de melhoria' },
    { chave: 'internacao', titulo: 'Internação hospitalar' }, { chave: 'cozinha', titulo: 'Cozinha' },
  ];
  const CASA = [
    { id: 'p1', nome: 'Alice' }, { id: 'p2', nome: 'Bruno' }, { id: 'p3', nome: 'Vitória' },
    { id: 'p4', nome: 'Ana Souza' }, { id: 'p5', nome: 'Ana Lima' },
  ];

  it('ir a uma tela vem antes da sugestão, e "ata" não casa dentro de "data"', () => {
    expect(responderPeloGuia('me leva para as Sugestões de melhoria', TELAS, false).ir).toBe('sugestoes');
    expect(responderPeloGuia('qual a data de hoje?', TELAS, false).ir).not.toBe('ata');
  });

  it('a criança nomeada no pedido é achada pelo primeiro nome, sem acento e por palavra inteira', () => {
    expect(criancasNoPedido('abre o perfil do Bruno', CASA).map((c) => c.id)).toEqual(['p2']);
    expect(criancasNoPedido('quero registrar a restrição alimentar da alice', CASA).map((c) => c.id)).toEqual(['p1']);
    expect(criancasNoPedido('abre o perfil da Vitoria', CASA).map((c) => c.id)).toEqual(['p3']);
    // "Brunoso" não é o Bruno.
    expect(criancasNoPedido('abre o perfil do Brunoso', CASA)).toEqual([]);
  });

  it('sem dizer o que quer com ela, o nome é só palavra: "foi uma vitória" não abre perfil', () => {
    expect(criancasNoPedido('foi uma vitória da equipe', CASA)).toEqual([]);
  });

  it('duas crianças com o mesmo primeiro nome: o sobrenome desempata, e sem ele a pessoa escolhe', () => {
    expect(criancasNoPedido('abre o perfil da Ana Lima', CASA).map((c) => c.id)).toEqual(['p5']);
    expect(criancasNoPedido('abre o perfil da Ana', CASA).map((c) => c.id).sort()).toEqual(['p4', 'p5']);
  });

  it('abrir o perfil não é pedir formulário; registrar é', () => {
    expect(pedeFormulario('abre o perfil do Bruno')).toBe(false);
    expect(pedeFormulario('quero registrar uma conquista do Bruno')).toBe(true);
  });

  it('o relatório ditado continua sendo rascunho, mesmo com o nome da criança dentro', () => {
    const r = responderPeloGuia('relatório da ATA: a Alice voltou da escola e lanchou com o grupo', TELAS, false);
    expect(r.rascunho?.tela).toBe('ata');
  });
});

/*
 * UM FUNCIONÁRIO DE CADA SETOR CONVERSANDO COM A ACOLHE+AI (fase 200; pedido de
 * 11/10). Fazendo o papel de cada cargo, com as frases como se fala no plantão,
 * vinte de cinquenta e nove pedidos eram bem atendidos. Os que falharam estão
 * aqui, para não voltar: a urgência que recebia "não achei essa tela", os
 * limites da Fundação tratados como busca, e as palavras que a equipe usa.
 */
describe('o modo guia atende como colega de plantão', () => {
  const TELAS = [
    { chave: 'dia', titulo: 'Dia' }, { chave: 'chamada', titulo: 'Chamada' },
    { chave: 'acolhidos', titulo: 'Acolhidos' }, { chave: 'passagem', titulo: 'Passagem' },
    { chave: 'plantao', titulo: 'Painel do plantão' }, { chave: 'ata', titulo: 'ATA' },
    { chave: 'ocorrencias', titulo: 'Ocorrências' }, { chave: 'escala', titulo: 'A escala de plantão' },
    { chave: 'equipe', titulo: 'Equipe' }, { chave: 'painel', titulo: 'Painel das unidades' },
    { chave: 'saude', titulo: 'Saúde' }, { chave: 'cozinha', titulo: 'Cozinha' },
  ];
  const SEM_SAUDE = TELAS.filter((x) => x.chave !== 'saude');
  const r = (frase: string, telas = TELAS) => responderPeloGuia(frase, telas, false);

  it('a urgência vem antes de qualquer tela, e não navega sozinha', () => {
    for (const frase of ['o kauã fugiu', 'a Gabi desmaiou no banho', 'ele bateu nela no quarto']) {
      const x = r(frase);
      expect(x.cuidado).toBe(true);
      expect(x.ir).toBeUndefined();
      expect(x.texto).toMatch(/líder do plantão/);
      expect(x.texto).toMatch(/\(tela:ocorrencias\)/);
    }
    expect(r('a Gabi desmaiou no banho').texto).toMatch(/SAMU, no 192/);
    expect(r('ele bateu nela no quarto').texto).toMatch(/sem perguntar detalhes/);
  });

  it('no começo do plantão, leva ao que mudou; no fim, monta o rascunho da ATA (fase 242)', () => {
    for (const frase of ['o que eu preciso saber?', 'cheguei agora no plantão', 'passa o plantão pra mim', 'como tá a casa?']) {
      const x = r(frase);
      expect([frase, x.ir]).toEqual([frase, 'dia']);
      expect(x.texto).toMatch(/O que mudou desde o seu último plantão/);
      expect(x.texto).toMatch(/\(tela:passagem\)/);
    }
    for (const frase of ['monta o rascunho da ata do meu turno', 'fim do meu plantão, me ajuda']) {
      expect(r(frase).texto).toMatch(/começando com ATA e dois-pontos/);
      expect(r(frase).rascunho).toBeUndefined();
    }
    const ata = r('ATA: a noite foi tranquila, o Theo teve febre às 2h e foi medicado pela Enfermagem');
    expect(ata.rascunho).toMatchObject({ tela: 'ata', texto: 'A noite foi tranquila, o Theo teve febre às 2h e foi medicado pela Enfermagem.' });
    /* Fechar a ATA continua abrindo a ATA, e quem não tem o Dia não ganha o link. */
    expect(r('me ajuda a fechar a ata').ir).toBe('ata');
    expect(r('o que eu preciso saber?', TELAS.filter((x) => x.chave !== 'dia')).ir).not.toBe('dia');
  });

  it('febre e tombo: não orienta remédio nem diagnóstico, diz quem decide', () => {
    const x = r('a lara ta com febre o que eu faço');
    expect(x.cuidado).toBe(true);
    expect(x.texto).toMatch(/Enfermagem/);
    expect(x.texto).not.toMatch(/dipirona|paracetamol|\bmg\b/i);
    // O sistema que caiu não é tombo.
    expect(r('o sistema caiu de novo').cuidado).toBeFalsy();
  });

  it('os limites da Fundação são ditos, com o porquê', () => {
    expect(r('qual criança dá mais trabalho').texto).toMatch(/não compara nem ordena/);
    expect(r('qual casa tem mais ocorrência').texto).toMatch(/não compara nem ordena/);
    expect(r('o bruno é agressivo?').texto).toMatch(/não dá rótulo/);
    expect(r('qual educador registra menos?').texto).toMatch(/não conta nem compara pessoas da equipe|não compara nem ordena/);
    expect(r('manda no whatsapp da mãe da alice que ela ta bem').texto).toMatch(/WhatsApp/);
    expect(r('apaga o que eu escrevi errado na ata').texto).toMatch(/nada se apaga/);
    expect(r('pode confirmar a dose da lara por mim').texto).toMatch(/Ninguém confirma pelo outro/);
    for (const f of ['qual criança dá mais trabalho', 'pode confirmar a dose da lara por mim']) {
      expect(r(f).cuidado).toBe(true);
    }
  });

  it('agradecer, cumprimentar e perguntar da senha têm resposta', () => {
    expect(r('obrigada').texto).toMatch(/De nada/);
    expect(r('boa noite').texto).toMatch(/^Oi!/);
    expect(r('como troco minha senha').texto).toMatch(/Minha conta/);
  });

  it('as palavras do plantão levam à tela certa', () => {
    // Fechar a ATA grava: a assistente explica a ATA e deixa o link, e não ganha o Dia por causa do "hoje".
    expect(r('fechar a ata de hoje').texto).toMatch(/\(tela:ata\)/);
    expect(r('fechar a ata de hoje').ir).toBeUndefined();
    expect(r('tem pedido de substituição?').texto).toMatch(/Painel do plantão/);
    expect(r('quero mudar o horario do turno').ir).toBe('escala');
    expect(r('cadastrar educador novo').ir).toBe('equipe');
    expect(r('mudar o limite de vagas').ir).toBe('painel');
    expect(r('esqueci de fazer a chamada').ir).toBe('chamada');
    expect(r('o estoque de dipirona').texto).toMatch(/Saúde/);
    // Quem não tem a Saúde acha a dose no Dia.
    expect(r('tem dose atrasada?', SEM_SAUDE).texto).toMatch(/Dia/);
  });

  it('"quem não pode comer amendoim" é pergunta, não pedido de mexer na tela', () => {
    expect(pedeAcao('quem não pode comer amendoim')).toBe(false);
    expect(r('quem não pode comer amendoim').texto).toMatch(/Cozinha/);
  });

  it('pergunta sobre a criança não é pedido de registrar', () => {
    expect(ehPergunta('a lara é alergica a que')).toBe(true);
    expect(ehPergunta('a gabi tomou a insulina das 22?')).toBe(true);
    expect(ehPergunta('quero registrar a alergia da lara')).toBe(false);
  });

  it('"registrar que" vira rascunho com o relato, e não abre o perfil', () => {
    const x = r('preciso registrar que o bruno caiu no patio e machucou o joelho');
    expect(x.rascunho?.texto).toBe('O bruno caiu no patio e machucou o joelho.');
  });

  it('a primeira pergunta não reconhecida diz que não reconheceu, antes de se apresentar', () => {
    expect(responderPeloGuia('xpto zzz', TELAS, true).texto).toMatch(/Esse pedido eu não reconheci/);
    expect(responderPeloGuia('oi', TELAS, true).texto).not.toMatch(/não reconheci/);
  });

  it('o que o plantão diz e o guia não ouvia (fase 205)', () => {
    const portaria = [{ chave: 'portaria', titulo: 'Portaria' }];
    // Alguém no portão dizendo ser da família: a proteção, nunca a tela.
    const pai = responderPeloGuia('um homem quer entrar dizendo que é pai do felipe', portaria, false);
    expect(pai.cuidado).toBe(true);
    expect(pai.texto).toMatch(/Não abra o portão/);
    expect(r('a mulher no portao quer levar o kaua agora').texto).toMatch(/saída registrada pela equipe técnica/);
    // A família que planeja o fim de semana é convivência familiar, e não alguém no portão.
    const fds = r('a familia da lara quer levar ela no fim de semana');
    expect(fds.texto).toMatch(/convivência familiar/);
    expect(fds.texto).not.toMatch(/Não abra o portão/);
    expect(responderPeloGuia('a tia do bruno ta no portao sem documento', portaria, false).texto).toMatch(/documento conferido/);
    // A criança que chora, o pesadelo: a criança primeiro, sem diagnóstico.
    for (const f of ['a alice ta chorando muito e nao para', 'a maria acordou com pesadelo']) {
      const x = r(f);
      expect(x.cuidado).toBe(true);
      expect(x.texto).toMatch(/fique perto/);
      expect(x.texto).toMatch(/\(tela:ata\)/);
    }
    // A família ao telefone: conferir o contato antes de passar.
    expect(r('a mae do kaua ligou querendo falar com ele').texto).toMatch(/aproximação restrita/);
    // O colega que não veio: a substituição, e nenhuma contagem de faltas.
    const falta = r('o educador da casa 2 nao veio');
    expect(falta.texto).toMatch(/substituição/);
    expect(falta.texto).toMatch(/não conta faltas/);
    // O fato contado no passado leva à ocorrência, sem abrir o perfil de ninguém.
    for (const f of ['o felipe brigou com o bruno no patio', 'o kaua quebrou o vidro da janela']) {
      const x = r(f);
      expect(x.cuidado).toBe(true);
      expect(x.texto).toMatch(/\(tela:ocorrencias\)/);
    }
    // Pedir ajuda para escrever pede o relato, e não a apresentação.
    expect(r('acolhe me ajuda a escrever o que aconteceu na janta').texto).toMatch(/Me conte o que aconteceu/);
    // A Enfermagem fala pelo nome do remédio e pelo que fez com a caixa.
    for (const f of ['o colirio acabou', 'joguei fora uma caixa de dipirona vencida', 'suspender o antibiotico do bruno']) {
      expect(r(f).texto).toMatch(/Saúde/);
    }
    // A falta de passagem é a pergunta de quem fecha a ATA.
    expect(r('quem nao passou o plantao').texto).toMatch(/ATA/);
    // "Fazer o relatório mensal" é ir ao acompanhamento, e não um rascunho com o próprio pedido.
    const tecnica = [...TELAS, { chave: 'acompanhamentos', titulo: 'Acompanhamentos' }];
    const mensal = r('preciso fazer o relatorio mensal da alice', tecnica);
    expect(mensal.rascunho).toBeUndefined();
    expect(mensal.ir).toBe('acompanhamentos');
    // A ocorrência que já existe não é fato novo para registrar.
    expect(r('a ocorrencia de ontem precisa de analise').texto).not.toMatch(/Isso se registra como ocorrência/);
    // O dia de visita é o combinado do contato, no perfil, e não a Portaria.
    expect(r('marcar visita da mae do bruno no sabado').texto).toMatch(/Autorizar a visitar/);
  });

  it('o calendário das ATAs se pede pelo jeito de quem quer olhar para trás (fase 206)', () => {
    for (const f of ['quero ver o calendario das atas', 'como vejo as atas dos dias anteriores',
                     'onde ficam as atas antigas', 'abre a ata de ontem']) {
      const x = r(f);
      // Pedido leva; pergunta explica e deixa o caminho.
      expect(x.ir === 'ata' || /\(tela:ata\)/.test(x.texto)).toBe(true);
    }
  });

  it('a saída das crianças pelo portão se pede pela portaria (fase 207)', () => {
    const comPortaria = [...TELAS, { chave: 'portaria', titulo: 'Portaria' }];
    for (const f of ['quem pode sair sem acompanhante hoje', 'registrar a volta de quem saiu para a escola',
                     'me leva para a saida das criancas']) {
      const x = r(f, comPortaria);
      expect(x.ir === 'portaria' || /\(tela:portaria\)/.test(x.texto)).toBe(true);
    }
  });

  it('as chamadas da casa se pedem pela Chamada, e criar abre o formulário (fase 211)', () => {
    for (const f of ['mudar o horario da chamada da janta', 'quero trocar a cor da chamada do almoco',
                     'onde ficam as chamadas da casa']) {
      const x = r(f);
      expect(x.ir === 'chamada' || /\(tela:chamada\)/.test(x.texto)).toBe(true);
    }
    const criar = r('criar uma chamada da casa para a ceia');
    expect(criar.ir).toBe('chamada');
    expect(criar.abrirFormulario).toBe(true);
  });

  it('não promete formulário antes de abrir: "registrar saída da visita" na portaria (fase 203)', () => {
    const portaria = [{ chave: 'portaria', titulo: 'Portaria' }];
    const x = responderPeloGuia('registrar saída da visita', portaria, false);
    expect(x.ir).toBe('portaria');
    expect(x.abrirFormulario).toBe(true);
    // A frase do formulário vem da tela, e só se ele abrir.
    expect(x.texto).not.toMatch(/formulário/);
  });

  it('nenhuma resposta do guia usa travessão (a Acolhe+AI escreve como colega)', () => {
    for (const f of ['o kauã fugiu', 'a lara ta com febre', 'qual criança dá mais trabalho', 'apaga isso da ata',
      'manda no zap', 'como troco minha senha', 'obrigado', 'o bruno é agressivo?']) {
      expect(r(f).texto).not.toMatch(/—/);
    }
  });
});

/* O banco de palavras da casa (fase 238) e o relatório das vivências (fase 237). */
describe('a Acolhe+AI entende o jeito de falar da casa', () => {
  const TELAS = [
    { chave: 'acolhidos', titulo: 'Acolhidos' }, { chave: 'ata', titulo: 'ATA' },
    { chave: 'ocorrencias', titulo: 'Ocorrências' }, { chave: 'saude', titulo: 'Saúde' },
  ];
  const r = (frase: string) => responderPeloGuia(frase, TELAS, false);

  it('a gíria do plantão chega ao cuidado certo', () => {
    expect(r('o piá tá com piripaque').cuidado).toBe(true);
    expect(r('a guria tá pelando').cuidado).toBe(true);
    expect(r('o guri se mandou').texto).toMatch(/líder do plantão/);
    expect(r('a guria deu um piti').cuidado).toBe(true);
    expect(r('os guris saíram no tapa').texto).toMatch(/Ocorrências/);
    expect(r('abre o livro do plantão').ir).toBe('ata');
  });

  it('a palavra que a equipe ensinou e a coordenação aprovou também se entende (fase 244)', () => {
    const ensinadas = palavrasEnsinadas([{ diz: 'Lavar o Chão', querDizer: 'ocorrência de briga' }, { diz: 'x', querDizer: 'curta demais' }]);
    expect(ensinadas).toEqual([{ diz: ['lavar o chao'], querDizer: 'ocorrencia de briga' }]);
    expect(traduzirPalavrasDaCasa('os guris vao lavar o chao hoje', ensinadas)).toMatch(/ocorrencia de briga/);
    expect(responderPeloGuia('os guris vão lavar o chão', TELAS, false, ensinadas).texto).toMatch(/Ocorr/);
    expect(responderPeloGuia('os guris vão lavar o chão', TELAS, false).texto).not.toMatch(/Ocorr/);
  });

  it('a palavra que quer dizer outra coisa não se traduz', () => {
    expect(traduzirPalavrasDaCasa('a pia da cozinha vazou')).toBe('a pia da cozinha vazou');
    expect(r('a pia da cozinha vazou').cuidado).toBeFalsy();
  });

  it('cada palavra tem forma e sentido, sem acento nem maiúscula onde o texto casa', () => {
    for (const p of PALAVRAS_DA_CASA) {
      expect(p.diz.length).toBeGreaterThan(0);
      expect(p.querDizer).toMatch(/^[a-z0-9 ,]+$/);
    }
    expect(GUIA_DA_ACOLHE).toContain(GLOSSARIO_DA_CASA);
  });

  it('o pedido do relatório das vivências em Word é entendido', () => {
    for (const f of ['faz um relatório da vivência da Alice em word', 'me dá um word com as vivências da Alice']) {
      expect(r(f).texto).toMatch(/Relatório das vivências em Word/);
    }
  });
});


describe('os documentos pela conversa e o cuidado com as palavras (fase 243)', () => {
  const TELAS = [
    { chave: 'acolhidos', titulo: 'Acolhidos' }, { chave: 'periodo', titulo: 'O período da casa' },
    { chave: 'internacao', titulo: 'Internação hospitalar' }, { chave: 'impacto', titulo: 'O trabalho social' },
    { chave: 'portaria', titulo: 'Portaria' }, { chave: 'acompanhamentos', titulo: 'Acompanhamentos' },
  ];
  const r = (frase: string) => responderPeloGuia(frase, TELAS, false);

  it('cada relatório pedido conversando leva ao lugar dele, e quem baixa é a pessoa', () => {
    expect(r('quero o relatório do período da casa em word')).toMatchObject({ ir: 'periodo' });
    expect(r('faz o relatório do mês da casa').texto).toMatch(/Abrir o período, depois Ver a folha antes de baixar/);
    expect(r('relatório de visitas da Alice em word').texto).toMatch(/aba Família e visitas/);
    expect(r('relatório de visitas da Alice em word').texto).toMatch(/quem avalia é a equipe técnica/);
    expect(r('me dá a trajetória do Bruno em word')).toMatchObject({ ir: 'impacto' });
    expect(r('preciso do relatório da internação do Theo')).toMatchObject({ ir: 'internacao' });
  });

  it('as folhas do período e da internação a Acolhe+AI abre a pedido, sem gravar', () => {
    for (const [arq, rotulo] of [['screens/Periodo.tsx', 'Ver a folha antes de baixar'], ['screens/Internacao.tsx', 'Relatório completo da internação']]) {
      const src = readFileSync(join(FRONT, arq), 'utf8');
      const i = src.indexOf(rotulo);
      expect([arq, src.lastIndexOf('<button data-acolhe-abre=""', i) > src.lastIndexOf('<button', i - 1) - 1]).toEqual([arq, true]);
    }
  });

  it('acha a palavra que rotula, com as variações, e não confunde o fato com o rótulo', () => {
    expect(palavrasQueRotulam('O Theo foi agressivo com a colega e depois ficou mal-educado')).toEqual(['agressivo', 'mal educado']);
    expect(palavrasQueRotulam('A Alice é MENTIROSA e sem educação')).toEqual(['mentirosa', 'sem educacao']);
    expect(palavrasQueRotulam('Houve agressão no pátio: o Theo empurrou a colega na fila do almoço.')).toEqual([]);
    expect(palavrasQueRotulam('A educadora usou o violão na roda de música.')).toEqual([]);
    expect(sugestaoDoFato('agressivo')).toBe('Em vez de agressivo, que tal escrever o fato? O que aconteceu, quando, com quem e o que a equipe fez.');
    expect(sugestaoDoFato('agressivo')).not.toMatch(/[—–]/);
  });

  it('a sugestão mora em todo campo de texto longo, só sugere, e não guarda nem conta nada', () => {
    const app = readFileSync(join(FRONT, 'App.tsx'), 'utf8');
    expect(app).toMatch(/<CuidadoComAsPalavras \/>/);
    const c = readFileSync(join(FRONT, 'cuidado-com-as-palavras.tsx'), 'utf8');
    expect(c).not.toMatch(/\bapi\(|fetch\(|localStorage|sessionStorage|indexedDB|preventDefault\(\)\s*;?\s*\}\s*\)\s*;?\s*\/\/\s*submit/);
    expect(c).not.toMatch(/addEventListener\('submit'/);
    expect(GUIA_DA_ACOLHE).toMatch(/O que você escreve sobre uma criança descreve o fato, e nunca a rotula\..*agressivo, agressiva/);
  });
});
