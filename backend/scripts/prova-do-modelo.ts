/**
 * A PROVA DO MODELO (fase 241): `npm run prova-do-modelo`, na máquina que vai
 * rodar o servidor, com as mesmas variáveis do `.env` (ACOLHE_AI_LOCAL_URL e
 * ACOLHE_AI_LOCAL_MODELO). Pergunta ao modelo do computador do Pão as frases
 * do plantão e os pedidos que ele tem de recusar, e diz quantos ele atendeu
 * bem, por setor, e quanto tempo levou. Não grava nada.
 *
 * Para comparar dois modelos, rode duas vezes trocando o ACOLHE_AI_LOCAL_MODELO.
 */
import { rodarAProva } from '../src/modules/assistente/prova-do-modelo.rodar';
import { contaDaProva } from '../src/modules/assistente/prova-do-modelo';

async function main() {
  const url = process.env.ACOLHE_AI_LOCAL_URL?.trim();
  const modelo = process.env.ACOLHE_AI_LOCAL_MODELO?.trim();
  if (!url || !modelo) {
    console.error('Falta ACOLHE_AI_LOCAL_URL ou ACOLHE_AI_LOCAL_MODELO: são as mesmas do .env do servidor.');
    process.exit(2);
  }
  console.log(`A prova do modelo ${modelo}, em ${url}\n`);
  const resultados = await rodarAProva(
    { url, modelo, esperaMs: Number(process.env.ACOLHE_AI_LOCAL_ESPERA_S || 180) * 1000, maxTokens: 2000 },
    undefined,
    (r) => {
      const o = r.resposta ? [r.resposta.texto.replace(/\s+/g, ' ').slice(0, 160),
        ...r.resposta.ferramentas.map((f) => `[${f.name} ${JSON.stringify(f.input)}]`)].filter(Boolean).join(' ') : `falhou: ${r.falha}`;
      console.log(`${r.passou ? '✓' : '✗'} ${r.caso.setor}: ${r.caso.pergunta}  (${r.segundos.toFixed(1)} s)`);
      if (!r.passou) console.log(`    esperava: ${r.caso.espera}\n    respondeu: ${o}`);
    },
  );
  const c = contaDaProva(resultados);
  console.log(`\n${c.passou} de ${c.de} bem atendidas.`);
  for (const [setor, s] of Object.entries(c.porSetor)) console.log(`  ${setor}: ${s.passou} de ${s.de}`);
  if (c.mediana !== null) console.log(`Tempo de resposta: metade em até ${c.mediana.toFixed(1)} s; a mais lenta, ${c.maisLenta!.toFixed(1)} s.`);
  console.log(c.limitesTodos
    ? 'Todos os limites da Fundação foram respeitados.'
    : 'ATENÇÃO: o modelo não respeitou algum limite da Fundação. Não use este modelo sem alguém ler as respostas acima.');
  process.exit(c.limitesTodos ? 0 : 1);
}

void main();
