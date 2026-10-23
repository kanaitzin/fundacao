/**
 * A ACOLHE+AI NO COMPUTADOR DO PÃO (fase 239; decisão de 23/10: só o computador
 * do Pão, sem custo e sem limite por pessoa).
 *
 * O modelo é um servidor local que faz o papel do Ollama, no padrão de conversa
 * aberto (`/v1/chat/completions`): guarda o que recebeu e devolve respostas
 * roteirizadas. O que se cobra é o que o NOSSO servidor faz:
 *  - traduz a conversa da tela (texto, foto, PDF, pedido e resultado de
 *    ferramenta) e as ferramentas para o padrão aberto, e a resposta de volta;
 *  - só passa ferramenta conhecida, com argumento legível;
 *  - não tem limite por pessoa, e segura a máquina com uma fila;
 *  - diz em português quando a máquina não responde, e a auditoria leva só o uso.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { createServer, Server, ServerResponse } from 'node:http';
import { AppModule } from '../src/app.module';
import { FERRAMENTAS, NOMES_DAS_FERRAMENTAS } from '../src/modules/assistente/ferramentas';
import {
  FilaCheia, FilaDoModelo, MotorLocalFalhou, PDF_NAO_LIDO, SEM_RESPOSTA,
  daRespostaAberta, ferramentasAbertas, paraOPadraoAberto, perguntarAoMotorLocal,
} from '../src/modules/assistente/motor-local';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const SENHA = 'senha-dev-123';

describe('A tradução para o modelo do Pão', () => {
  it('leva texto, foto, PDF, pedido e resultado de ferramenta, e deixa de fora o raciocínio de outro modelo', () => {
    const m = paraOPadraoAberto(['o guia', 'quem fala'], [
      { role: 'user', content: [
        { type: 'text', text: 'olha esta receita' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } },
      ] },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: 'pensando', signature: 'x' },
        { type: 'text', text: 'Vou ver.' },
        { type: 'tool_use', id: 'call_1', name: 'consultar_sistema', input: { rota: '/people' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: '[{"nome":"Theo"}]' }] },
        { type: 'text', text: 'e agora?' },
      ] },
    ]);
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'tool', 'user']);
    expect(m[0]).toEqual({ role: 'system', content: 'o guia\n\nquem fala' });
    expect(m[1].content).toEqual([
      { type: 'text', text: 'olha esta receita' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
      { type: 'text', text: PDF_NAO_LIDO },
    ]);
    expect(m[2]).toEqual({ role: 'assistant', content: 'Vou ver.', tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'consultar_sistema', arguments: '{"rota":"/people"}' } },
    ] });
    expect(m[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '[{"nome":"Theo"}]' });
    expect(m[4]).toEqual({ role: 'user', content: 'e agora?' });
    expect(JSON.stringify(m)).not.toContain('pensando');
  });

  it('a ferramenta que falhou chega dita como falha', () => {
    const m = paraOPadraoAberto(['g'], [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c', content: 'sem acesso', is_error: true }] },
    ]);
    expect(m[1]).toEqual({ role: 'tool', tool_call_id: 'c', content: 'A ferramenta falhou: sem acesso' });
  });

  it('as ferramentas vão todas, com o mesmo formulário', () => {
    const f = ferramentasAbertas(FERRAMENTAS);
    expect(f.map((x) => x.function.name)).toEqual([...NOMES_DAS_FERRAMENTAS]);
    expect(f[0].function.parameters).toEqual(FERRAMENTAS[0].input_schema);
  });

  it('a resposta volta em blocos, sem o raciocínio escrito no texto e sem ferramenta inventada', () => {
    const r = daRespostaAberta({
      choices: [{ finish_reason: 'tool_calls', message: {
        content: '<think>a pessoa quer a lista</think>Vou ver quem está na casa.',
        tool_calls: [
          { id: 'call_9', function: { name: 'consultar_sistema', arguments: '{"rota":"/people","motivo":"ver"}' } },
          { id: 'call_8', function: { name: 'apagar_tudo', arguments: '{}' } },
          { id: 'call_7', function: { name: 'abrir_tela', arguments: '{"tela": ' } },
        ],
      } }],
      usage: { prompt_tokens: 900, completion_tokens: 40 },
    }, NOMES_DAS_FERRAMENTAS);
    expect(r.content).toEqual([
      { type: 'text', text: 'Vou ver quem está na casa.' },
      { type: 'tool_use', id: 'call_9', name: 'consultar_sistema', input: { rota: '/people', motivo: 'ver' } },
    ]);
    expect(r.stop_reason).toBe('tool_use');
    expect(r.descartadas).toBe(2);
    expect(r.usage).toEqual({ input_tokens: 900, output_tokens: 40 });
  });

  it('resposta vazia vira uma frase, e a cortada pelo tamanho é dita', () => {
    expect(daRespostaAberta({ choices: [{ message: { content: '' } }] }, NOMES_DAS_FERRAMENTAS).content)
      .toEqual([{ type: 'text', text: SEM_RESPOSTA }]);
    expect(daRespostaAberta({ choices: [{ finish_reason: 'length', message: { content: 'Até aqui' } }] }, NOMES_DAS_FERRAMENTAS).stop_reason)
      .toBe('max_tokens');
    expect(daRespostaAberta('lixo', NOMES_DAS_FERRAMENTAS).content).toEqual([{ type: 'text', text: SEM_RESPOSTA }]);
  });

  it('a fila deixa passar poucas de cada vez, faz as outras esperarem, e recusa quando enche', async () => {
    const fila = new FilaDoModelo(2, 1);
    const soltar: (() => void)[] = [];
    const segura = () => new Promise<string>((ok) => soltar.push(() => ok('feito')));
    const a = fila.executar(segura);
    const b = fila.executar(segura);
    const c = fila.executar(segura);
    await new Promise((ok) => setImmediate(ok));
    expect(fila.ocupadas).toBe(2);
    expect(fila.naFila).toBe(1);
    await expect(fila.executar(segura)).rejects.toBeInstanceOf(FilaCheia);
    soltar.shift()!();
    await a;
    await new Promise((ok) => setImmediate(ok));
    expect(soltar).toHaveLength(2); /* a terceira começou quando a primeira acabou */
    soltar.splice(0).forEach((s) => s());
    await expect(Promise.all([b, c])).resolves.toEqual(['feito', 'feito']);
    expect(fila.ocupadas).toBe(0);
  });

  it('a máquina que não responde a tempo é dita como demora', async () => {
    const parado = createServer(() => { /* nunca responde */ });
    await new Promise<void>((ok) => parado.listen(0, '127.0.0.1', ok));
    try {
      const url = `http://127.0.0.1:${(parado.address() as any).port}/v1`;
      await expect(perguntarAoMotorLocal({ url, modelo: 'm', esperaMs: 300, maxTokens: 100 }, [], []))
        .rejects.toMatchObject({ motivo: 'demorou' });
    } finally {
      parado.closeAllConnections();
      await new Promise((ok) => parado.close(ok));
    }
    await expect(perguntarAoMotorLocal({ url: 'http://127.0.0.1:1/v1', modelo: 'm', esperaMs: 2000, maxTokens: 100 }, [], []))
      .rejects.toBeInstanceOf(MotorLocalFalhou);
  });
});

describe('A Acolhe+AI pelo computador do Pão', () => {
  let app: INestApplication, http: any, admin: Client, modelo: Server;
  const recebidos: any[] = [];
  let proxima: any = null;
  let segurar = false;
  let lidos = 12000;
  const presas: ServerResponse[] = [];
  const ids: Record<string, string> = {};
  const tok: Record<string, string> = {};
  const envAntes = { ...process.env };
  const marca = `Pergunta-do-pao-${Date.now()}`;

  const resposta = (message: any, finish_reason = 'stop') => ({
    id: 'chatcmpl-teste', object: 'chat.completion', model: 'modelo-do-pao',
    choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason }],
    usage: { prompt_tokens: lidos, completion_tokens: 60, total_tokens: lidos + 60 },
  });
  const responder = (res: ServerResponse) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(proxima ?? resposta({ content: 'Oi! Sou a Acolhe+AI, no computador do Pão.' })));
  };
  const conversar = (t: string, corpo: any) =>
    request(http).post('/api/v1/assistente/conversa').set({ Authorization: `Bearer ${t}` }).send(corpo);

  beforeAll(async () => {
    modelo = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => {
        recebidos.push({ url: req.url, cabecalhos: req.headers, corpo: JSON.parse(Buffer.concat(partes).toString('utf8')) });
        if (segurar) presas.push(res); else responder(res);
      });
    });
    await new Promise<void>((ok) => modelo.listen(0, '127.0.0.1', ok));
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ACOLHE_AI_MOTOR = 'local';
    process.env.ACOLHE_AI_LOCAL_URL = `http://127.0.0.1:${(modelo.address() as any).port}/v1`;
    process.env.ACOLHE_AI_LOCAL_MODELO = 'modelo-do-pao';
    process.env.ACOLHE_AI_LOCAL_SIMULTANEAS = '1';
    process.env.ACOLHE_AI_LOCAL_FILA = '1';

    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    ids.AI3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    for (const [k, e] of [['edu', 'educador.ai3'], ['coord3', 'coord.ai3']] as const) {
      const email = `${e}@paodospobres.dev`;
      ids[k] = (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email])).rows[0]?.id;
      tok[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
  });

  afterAll(async () => {
    process.env = envAntes;
    await app.close(); await admin.end();
    modelo.closeAllConnections();
    await new Promise((ok) => modelo.close(ok));
  });

  it('diz que está ligada no computador do Pão, e desligada sem o modelo escrito', async () => {
    const estado = () => request(http).get('/api/v1/assistente/estado').set({ Authorization: `Bearer ${tok.edu}` });
    expect((await estado()).body).toMatchObject({ ligada: true, motor: 'local' });
    delete process.env.ACOLHE_AI_LOCAL_MODELO;
    try {
      expect((await estado()).body).toMatchObject({ ligada: false, motor: 'local' });
      const r = await conversar(tok.edu, { mensagens: [{ role: 'user', content: 'oi' }] });
      expect(r.status).toBe(503);
      expect(r.body.message).toMatch(/responde só pelo guia/);
    } finally {
      process.env.ACOLHE_AI_LOCAL_MODELO = 'modelo-do-pao';
    }
  });

  it('repassa o guia, quem fala e as ferramentas no padrão aberto, sem chave nenhuma', async () => {
    recebidos.length = 0; proxima = null;
    const r = await conversar(tok.edu, { mensagens: [{ role: 'user', content: marca }], contexto: { casaId: ids.AI3 } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ parada: 'end_turn', guardar: true });
    expect(r.body.conteudo).toEqual([{ type: 'text', text: 'Oi! Sou a Acolhe+AI, no computador do Pão.' }]);
    const { url, cabecalhos, corpo } = recebidos[0];
    expect(url).toBe('/v1/chat/completions');
    expect(cabecalhos.authorization).toBeUndefined();
    expect(corpo.model).toBe('modelo-do-pao');
    expect(corpo.stream).toBe(false);
    expect(corpo.messages[0].role).toBe('system');
    expect(corpo.messages[0].content).toContain('Acolhe+AI');
    expect(corpo.messages[0].content).toContain('piripaque'); /* o banco de palavras da casa */
    expect(corpo.messages[1]).toEqual({ role: 'user', content: marca });
    expect(corpo.tools.map((t: any) => t.function.name)).toEqual([...NOMES_DAS_FERRAMENTAS]);
  });

  it('o pedido de ferramenta volta para a tela, e o resultado chega ao modelo como resposta da ferramenta', async () => {
    proxima = resposta({ content: null, tool_calls: [{ id: 'call_1', type: 'function',
      function: { name: 'consultar_sistema', arguments: JSON.stringify({ rota: `/people?houseId=${ids.AI3}`, motivo: 'ver as crianças' }) } }] },
    'tool_calls');
    const r = await conversar(tok.edu, { mensagens: [{ role: 'user', content: 'quem está na casa?' }], contexto: { casaId: ids.AI3 } });
    expect(r.body.parada).toBe('tool_use');
    expect(r.body.conteudo).toEqual([{ type: 'tool_use', id: 'call_1', name: 'consultar_sistema',
      input: { rota: `/people?houseId=${ids.AI3}`, motivo: 'ver as crianças' } }]);

    recebidos.length = 0; proxima = null;
    const volta = await conversar(tok.edu, { mensagens: [
      { role: 'user', content: 'quem está na casa?' },
      { role: 'assistant', content: r.body.conteudo },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '[{"nome":"Theo"}]' }] },
    ] });
    expect(volta.status).toBe(200);
    expect(recebidos[0].corpo.messages.slice(1)).toEqual([
      { role: 'user', content: 'quem está na casa?' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: {
        name: 'consultar_sistema', arguments: JSON.stringify({ rota: `/people?houseId=${ids.AI3}`, motivo: 'ver as crianças' }) } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '[{"nome":"Theo"}]' },
    ]);
  });

  it('não tem limite por pessoa: quarenta perguntas seguidas da mesma educadora são respondidas', async () => {
    proxima = null;
    for (let i = 0; i < 40; i++) {
      const r = await conversar(tok.edu, { mensagens: [{ role: 'user', content: `pergunta ${i}` }] });
      expect(r.status).toBe(200);
    }
  });

  it('a fila segura a máquina: uma responde, uma espera a vez, e a que não cabe ouve que está ocupada', async () => {
    recebidos.length = 0; proxima = null; segurar = true;
    try {
      const perguntas = [0, 1, 2].map((i) => conversar(i === 2 ? tok.coord3 : tok.edu,
        { mensagens: [{ role: 'user', content: `ao mesmo tempo ${i}` }] }).then((r) => r));
      const inicio = Date.now();
      while (recebidos.length < 1 && Date.now() - inicio < 5000) await new Promise((ok) => setTimeout(ok, 20));
      await new Promise((ok) => setTimeout(ok, 300));
      expect(recebidos).toHaveLength(1); /* só uma por vez, como a instalação disse */
      segurar = false;
      presas.splice(0).forEach(responder);
      const r = await Promise.all(perguntas);
      const codigos = r.map((x) => x.status).sort();
      expect(codigos).toEqual([200, 200, 503]);
      expect(r.find((x) => x.status === 503)!.body.message).toMatch(/atendendo muitas pessoas agora/);
      expect(recebidos).toHaveLength(2);
    } finally {
      segurar = false;
      presas.splice(0).forEach(responder);
    }
  });

  it('a máquina desligada é dita para a TI, sem o endereço nem a conversa', async () => {
    const antes = process.env.ACOLHE_AI_LOCAL_URL;
    process.env.ACOLHE_AI_LOCAL_URL = 'http://127.0.0.1:1/v1';
    try {
      const r = await conversar(tok.edu, { mensagens: [{ role: 'user', content: marca }] });
      expect(r.status).toBe(503);
      expect(r.body.message).toBe('O computador da Acolhe+AI não está respondendo. Avise a TI.');
    } finally {
      process.env.ACOLHE_AI_LOCAL_URL = antes;
    }
  });

  it('a janela curta de fábrica do Ollama, que corta o guia sem avisar, fica anotada', async () => {
    lidos = 2048; proxima = null;
    try {
      expect((await conversar(tok.coord3, { mensagens: [{ role: 'user', content: 'oi' }] })).status).toBe(200);
      const { rows: [a] } = await admin.query(
        `SELECT detail FROM audit_event WHERE action = 'assistente.conversa' AND actor_id = $1 ORDER BY at DESC LIMIT 1`, [ids.coord3]);
      expect(a.detail).toMatchObject({ motor: 'local', entrada: 2048, janelaCurta: true });
    } finally {
      lidos = 12000;
    }
  });

  it('a auditoria diz o motor e o uso, nunca a conversa', async () => {
    const { rows } = await admin.query(
      `SELECT house_id, detail FROM audit_event WHERE action = 'assistente.conversa' AND actor_id = $1
        AND detail->>'motor' = 'local' ORDER BY at DESC LIMIT 60`, [ids.edu]);
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.some((x) => (x.detail.ferramentas as string[]).includes('consultar_sistema'))).toBe(true);
    expect(rows.find((x) => x.house_id)?.house_id).toBe(ids.AI3);
    expect(rows[0].detail).toMatchObject({ motor: 'local', entrada: 12000, saida: 60, descartadas: 0, janelaCurta: false });
    expect(JSON.stringify(rows)).not.toMatch(new RegExp(`${marca}|Theo|quem está na casa`));
  });
});
