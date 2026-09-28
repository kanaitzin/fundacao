/**
 * UMA CASA NASCE E VIVE NOVENTA DIAS (fase 173).
 *
 * Pedido de 28/09: simular o uso do sistema como uma casa real, desde o dia em
 * que a coordenação recebe o acesso, com a equipe, os acolhidos, os anexos, as
 * visitas, as internações, a transferência, a escala, o remédio, a cozinha e os
 * relatórios da gestão; e conferir no fim se o que o sistema devolve é o que
 * aconteceu.
 *
 * A casa é a ARM1, vazia na semente. Tudo passa pelas ROTAS de verdade, com o
 * cargo de quem faria cada coisa, e com o RELÓGIO ANDANDO: antes de cada ato a
 * simulação reescreve o arquivo que o `faketime` lê, e o banco e o servidor vão
 * juntos para aquele dia e hora (ver `scripts/simulacao-da-casa.sh`). O relógio
 * do dia (`RelogioService.rodarODia`) roda às 05h, como o cron da implantação.
 *
 * O que a simulação NÃO faz: não afirma. Ela anota. Toda recusa que não era
 * esperada, toda mensagem que não está em português, todo relatório que não bate
 * com o que ela contou vira um ACHADO, e a lista sai no fim. Quem decide se o
 * achado é defeito é quem lê. Dados fictícios, banco recriado no começo.
 *
 * Uso: bash scripts/simulacao-da-casa.sh [dias]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { RelogioService } from '../src/modules/relogio';

const RELOGIO = process.env.SIM_RELOGIO!;
const DIAS = Number(process.argv[2] ?? 90);
const INICIO = (process.argv[3] ?? '2026-11-16 07:00:00').slice(0, 10);
const SAIDA = process.env.SIM_SAIDA ?? '/tmp/simulacao-da-casa';
const CAIXA = join(process.env.EMAIL_DIR ?? '/tmp/rede-acolher-email', 'caixa-de-saida.txt');
const SENHA_SEMENTE = 'senha-dev-123';
const SENHA_NOVA = 'minha-senha-da-casa-1';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** PNG 1x1 e um PDF de uma página: a foto do documento e o laudo do hospital. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n'
  + '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (Laudo ficticio) Tj ET\nendstream endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n').toString('base64');

// ================================================================ o relógio

let agoraLocal = `${INICIO} 07:00`;
/** Leva o banco e o servidor para `dia hh:mm` na hora de Porto Alegre (UTC-3). */
function relogio(dia: string, hhmm: string) {
  if (`${dia} ${hhmm}` < agoraLocal) console.log(`    (o relógio voltou: ${agoraLocal} → ${dia} ${hhmm})`);
  const utc = new Date(`${dia}T${hhmm}:00-03:00`).toISOString().slice(0, 19).replace('T', ' ');
  writeFileSync(RELOGIO, `@${utc}`);
  agoraLocal = `${dia} ${hhmm}`;
}
const proximoMes = (dia: string) => {
  const [a, m] = dia.slice(0, 7).split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};
const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const em = (dia: string, hhmm: string) => `${dia}T${hhmm}:00-03:00`;

// ================================================================ os achados

type Achado = { quando: string; quem: string; o_que: string; detalhe: string; tipo: string };
const achados: Achado[] = [];
const contagem: Record<string, number> = {};
function achar(tipo: string, quem: string, o_que: string, detalhe: string) {
  const chave = `${tipo}|${o_que}|${detalhe.slice(0, 80)}`;
  contagem[chave] = (contagem[chave] ?? 0) + 1;
  if (contagem[chave] > 1) return;         // o mesmo achado, uma vez só na lista
  achados.push({ quando: agoraLocal, quem, o_que, detalhe, tipo });
  console.log(`  ✗ [${tipo}] ${agoraLocal} · ${quem} · ${o_que}: ${detalhe.slice(0, 300)}`);
}

/*
 * A VOZ DA TELA. Frase que chega à pessoa (recusa ou aviso) em inglês, ou com
 * o nome de uma tabela, é achado: a tela pode explicar, mas em português e sem
 * mostrar o banco.
 */
const INGLES = /\b(the|failed|expected|is required|must be|should|not found|forbidden|unauthorized|internal server|cannot|invalid|bad request|violates|relation|column)\b/i;
function conferirAVoz(quem: string, o_que: string, corpo: any) {
  const frases: string[] = [];
  const juntar = (v: any) => {
    if (typeof v === 'string') frases.push(v);
    else if (Array.isArray(v)) v.forEach(juntar);
  };
  if (corpo && typeof corpo === 'object') { juntar(corpo.message); juntar(corpo.aviso); }
  for (const f of frases) {
    if (INGLES.test(f)) achar('voz', quem, o_que, `frase fora do português: ${f}`);
    if (/_id\b|app_[a-z_]+|\bSQL\b|row-level/.test(f)) achar('voz', quem, o_que, `frase mostra o banco: ${f}`);
  }
}

// ================================================================ o servidor e as pessoas

let app: INestApplication; let http: any; let admin: Client;
type Pessoa = { email: string; senha: string; cargo: string; nome: string; id?: string };
const gente: Record<string, Pessoa> = {};
const sessoes: Record<string, { token: string; dia: string }> = {};

async function token(quem: string): Promise<string> {
  const p = gente[quem];
  const dia = agoraLocal.slice(0, 10);
  const s = sessoes[quem];
  /* A sessão vence em horas: a simulação entra de novo a cada dia, como a pessoa. */
  if (s && s.dia === dia) return s.token;
  const r = await request(http).post('/api/v1/auth/login').send({ email: p.email, password: p.senha });
  if (r.status !== 201) {
    achar('entrada', quem, 'entrar', `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    throw new Error(`${quem} não entrou`);
  }
  sessoes[quem] = { token: r.body.token, dia };
  return r.body.token;
}

/**
 * Um ATO da pessoa. Devolve o corpo quando a rota aceita; anota e devolve null
 * quando recusa sem que a recusa fosse esperada.
 */
async function ato(quem: string, metodo: 'get' | 'post' | 'patch', rota: string, corpo?: any,
                   opcoes: { espera?: number[]; rotulo?: string; binario?: boolean } = {}) {
  const o_que = opcoes.rotulo ?? `${metodo.toUpperCase()} ${rota.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`;
  let tk: string;
  try { tk = await token(quem); } catch { return null; }
  let req = request(http)[metodo](`/api/v1${rota}`).set({ Authorization: `Bearer ${tk}` });
  if (opcoes.binario) req = req.buffer(true).parse((res, cb) => {
    const partes: Buffer[] = []; res.on('data', (c: Buffer) => partes.push(c)); res.on('end', () => cb(null, Buffer.concat(partes)));
  });
  const r = metodo === 'get' ? await req : await req.send(corpo ?? {});
  const espera = opcoes.espera ?? [200, 201];
  if (!opcoes.binario) conferirAVoz(quem, o_que, r.body);
  if (!espera.includes(r.status)) {
    const msg = opcoes.binario ? '' : JSON.stringify(r.body?.message ?? r.body).slice(0, 400);
    achar(r.status >= 500 ? 'falha 500' : 'recusa', quem, o_que, `${r.status} ${msg}`);
    return null;
  }
  return r.body ?? {};
}
const get = (quem: string, rota: string, o?: any) => ato(quem, 'get', rota, undefined, o);
const post = (quem: string, rota: string, corpo?: any, o?: any) => ato(quem, 'post', rota, corpo, o);

/** O convite lido na caixa de saída, como a pessoa leria no e-mail. */
function conviteDe(email: string): string | null {
  if (!existsSync(CAIXA)) return null;
  const blocos = readFileSync(CAIXA, 'utf8').split('\n=== ').filter((b) => b.includes(`Para: ${email}\n`));
  const ultimo = blocos[blocos.length - 1];
  return ultimo?.match(/convite=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

// ================================================================ o que a simulação conta

/** O que aconteceu, contado pela simulação, para conferir contra os relatórios. */
const fatos = {
  doses: 0, visitas: 0, visitasPorCrianca: {} as Record<string, number>,
  refeicoes: 0, pedidosCozinha: 0, cestas: 0, internacoes: 0, ocorrencias: 0,
  notasNaAta: 0, plantoes: 0, entradasArmario: 0, notasFiscais: 0, admissoes: 0,
  desligamentos: 0, chamadasConfirmadas: 0, transferencias: 0, anexos: 0, downloads: 0, relatorios: 0,
};

// ================================================================ os capítulos

const ids: Record<string, string> = {};
const dosesPorRemedio: Record<string, number> = {};
const entradasPorRemedio: Record<string, number> = {};
type Crianca = { chave: string; id: string; nome: string; social: string; nascimento: string;
                 contatos: string[]; ativa: boolean };
const criancas: Crianca[] = [];
const ativas = () => criancas.filter((c) => c.ativa);

async function criarConta(quem: string, porQuem: string, dados: { chave: string; nome: string; email: string; cargo: string }) {
  const r = await post(porQuem, '/staff',
    { nome: dados.nome, email: dados.email, cargo: dados.cargo, casaId: ids.ARM1 },
    { rotulo: `criar a conta de ${dados.cargo}` });
  if (!r) return false;
  gente[dados.chave] = { email: dados.email, senha: r.senhaInicial, cargo: dados.cargo, nome: dados.nome, id: r.id };
  /* O convite, e não a senha entregue na mão: é o caminho que o §3.3 prefere. */
  const c = await post(porQuem, `/staff/${r.id}/convite`, {}, { rotulo: `convidar ${dados.cargo}` });
  if (!c) return true;
  const tk = conviteDe(dados.email);
  if (!tk) { achar('convite', porQuem, `convite de ${dados.cargo}`, 'o e-mail não chegou à caixa'); return true; }
  const conf = await request(http).post('/api/v1/auth/convite/conferir').send({ convite: tk });
  conferirAVoz(dados.chave, 'conferir o convite', conf.body);
  if (conf.status !== 201 && conf.status !== 200) achar('convite', dados.chave, 'conferir o convite', `${conf.status} ${JSON.stringify(conf.body)}`);
  const fim = await request(http).post('/api/v1/auth/convite/concluir').send({ convite: tk, novaSenha: SENHA_NOVA });
  conferirAVoz(dados.chave, 'criar a senha pelo convite', fim.body);
  if (fim.status === 201 || fim.status === 200) gente[dados.chave].senha = SENHA_NOVA;
  else achar('convite', dados.chave, 'criar a senha pelo convite', `${fim.status} ${JSON.stringify(fim.body)}`);
  /* O convite serve uma vez só. */
  const de_novo = await request(http).post('/api/v1/auth/convite/concluir').send({ convite: tk, novaSenha: 'outra-senha-99' });
  if (de_novo.status < 400) achar('convite', dados.chave, 'convite usado duas vezes', `${de_novo.status}`);
  return true;
}

/** Capítulo 1: a casa nasce. */
async function nascer() {
  const dia = INICIO;
  relogio(dia, '09:00');
  console.log(`\n▸ ${dia} · a ARM1 nasce`);

  /* O gestor cria a coordenação e manda o convite. */
  await criarConta('coord', 'gestor', { chave: 'coord', nome: 'Rosa Coordenadora (fictícia)', email: 'coord.arm1@paodospobres.dev', cargo: 'coordenador' });
  const eu = await get('coord', '/users/me');
  if (eu && eu.role !== 'coordenador') achar('nascer', 'coord', 'quem sou', JSON.stringify(eu).slice(0, 200));

  /* A coordenação monta a equipe. */
  relogio(dia, '10:00');
  const equipe = [
    { chave: 'tecnica', nome: 'Helena Técnica (fictícia)', email: 'tecnica.arm1@paodospobres.dev', cargo: 'equipe_tecnica' },
    { chave: 'lider', nome: 'Paulo Líder (fictício)', email: 'lider.arm1@paodospobres.dev', cargo: 'lider_diurno' },
    { chave: 'edu1', nome: 'Ana Educadora (fictícia)', email: 'ana.arm1@paodospobres.dev', cargo: 'educador' },
    { chave: 'edu2', nome: 'Bruno Educador (fictício)', email: 'bruno.arm1@paodospobres.dev', cargo: 'educador' },
    { chave: 'edu3', nome: 'Carla Educadora (fictícia)', email: 'carla.arm1@paodospobres.dev', cargo: 'educador' },
    { chave: 'edu4', nome: 'Davi Educador (fictício)', email: 'davi.arm1@paodospobres.dev', cargo: 'educador' },
    { chave: 'portaria', nome: 'Jorge da Portaria (fictício)', email: 'portaria.arm1@paodospobres.dev', cargo: 'portaria' },
    { chave: 'cozinha', nome: 'Marta da Cozinha (fictícia)', email: 'cozinha.arm1@paodospobres.dev', cargo: 'cozinha' },
  ];
  for (const p of equipe) await criarConta(p.chave, 'coord', p);

  const lista = await get('coord', '/staff');
  const daCasa = (Array.isArray(lista) ? lista : lista?.equipe ?? []).length;
  if (daCasa < equipe.length + 1) achar('nascer', 'coord', 'a lista da equipe', `mostra ${daCasa}, esperava ${equipe.length + 1}`);

  /* O horário dos turnos da casa: a ARM1 troca às 07h e às 19h. */
  await post('coord', `/houses/${ids.ARM1}/turnos`,
    { diurnoDe: '07:00', diurnoAte: '19:00', motivo: 'Horário da casa-lar combinado com a equipe na abertura.' });

  /* A rotina da casa, versão 1. */
  relogio(dia, '11:00');
  const v = await post('coord', '/routine/versions', { houseId: ids.ARM1, motivo: 'Rotina de abertura da casa.' });
  if (v) {
    ids.rotina = v.versaoId;
    for (const [kind, title, startTime, endTime, weekdays] of [
      ['acordar', 'Acordar e arrumar a cama', '06:30', '07:00', [1, 2, 3, 4, 5]],
      ['refeicao', 'Café da manhã', '07:00', '07:30', [0, 1, 2, 3, 4, 5, 6]],
      ['escola', 'Saída para a escola', '07:30', '12:00', [1, 2, 3, 4, 5]],
      ['refeicao', 'Almoço', '12:00', '13:00', [0, 1, 2, 3, 4, 5, 6]],
      ['educacao', 'Tema de casa', '14:00', '15:30', [1, 2, 3, 4, 5]],
      ['lazer', 'Pátio e brincadeira', '16:00', '17:30', [0, 1, 2, 3, 4, 5, 6]],
      ['banho', 'Banho', '18:00', '19:00', [0, 1, 2, 3, 4, 5, 6]],
      ['refeicao', 'Janta', '19:00', '19:45', [0, 1, 2, 3, 4, 5, 6]],
      ['sono', 'Hora de dormir', '21:30', null, [0, 1, 2, 3, 4, 5, 6]],
    ] as const) {
      await post('coord', `/routine/versions/${v.versaoId}/items`,
        { houseId: ids.ARM1, kind, title, startTime, endTime, weekdays });
    }
  }
}

/** Array de uma resposta que pode vir como lista ou dentro de um objeto. */
function lista(x: any, ...chaves: string[]): any[] {
  if (Array.isArray(x)) return x;
  for (const k of chaves) if (Array.isArray(x?.[k])) return x[k];
  return [];
}
const campo = (o: any, ...ks: string[]) => { for (const k of ks) if (o?.[k] !== undefined && o?.[k] !== null) return o[k]; return undefined; };

/** Capítulo 2: as crianças chegam, com documento, foto, família e saúde. */
const CRIANCAS = [
  { chave: 'lara', nome: 'Lara Menezes (fictícia)', social: 'Lara', nascimento: '2014-05-02', genero: 'menina' },
  { chave: 'caio', nome: 'Caio Menezes (fictício)', social: 'Caio', nascimento: '2016-09-21', genero: 'menino' },
  { chave: 'yasmin', nome: 'Yasmin Prado (fictícia)', social: 'Yasmin', nascimento: '2012-02-29', genero: 'menina' },
  { chave: 'enzo', nome: 'Enzo Farias (fictício)', social: 'Enzo', nascimento: '2011-12-31', genero: 'menino' },
  { chave: 'sofia', nome: 'Sofia Ramos (fictícia)', social: 'Sofi', nascimento: '2018-07-14', genero: 'menina' },
];

async function admitir(quem: string, c: { chave: string; nome: string; social: string; nascimento: string; genero: string },
                       dia: string, trazidaPor = 'Conselho Tutelar') {
  const r = await post(quem, '/people/admission', {
    houseId: ids.ARM1,
    pessoa: { fullName: c.nome, socialName: c.social, birthDate: c.nascimento, gender: c.genero,
              race: 'parda', birthplace: 'Porto Alegre/RS', schoolName: 'Escola municipal do bairro',
              schoolGrade: '4º ano', schoolShift: 'manhã', essentialCare: 'Gosta de dormir com a luz do corredor acesa.' },
    acolhimento: { admittedOn: dia, broughtBy: trazidaPor, originCity: 'Porto Alegre/RS',
                   familyReference: 'Avó materna, com contato autorizado pela técnica',
                   arrivalNote: 'Chegou com uma mochila e a certidão de nascimento.',
                   provisionalReason: 'Chegou sem o CPF; a técnica pede à família na primeira visita.' },
    judicial: { reasonCategory: 'negligencia', reasonDetail: 'Situação descrita na guia de acolhimento.',
                determiningBody: 'vara_da_infancia', courtName: 'Juizado da Infância e Juventude',
                processNumber: '0000000-00.2026.8.21.0001', guideNumber: `GA-${c.chave.toUpperCase()}`,
                guideDate: dia, determinedOn: dia, legalStatus: 'Audiência concentrada a marcar.' },
  }, { rotulo: 'admitir uma criança' });
  if (!r?.personId) return null;
  fatos.admissoes++;
  const k: Crianca = { chave: c.chave, id: r.personId, nome: c.nome, social: c.social, nascimento: c.nascimento, contatos: [], ativa: true };
  criancas.push(k);
  return k;
}

async function completarOPerfil(k: Crianca) {
  /* A foto de identificação e a certidão, pelo mesmo caminho da tela. */
  if (await post('tecnica', `/people/${k.id}/photo`, { conteudo: PNG, nomeArquivo: 'identificacao.png' }, { rotulo: 'foto da criança' })) fatos.anexos++;
  const doc = await post('tecnica', `/people/${k.id}/documents`, {
    chave: 'certidao_nascimento', categoria: 'pessoal', titulo: 'Certidão de nascimento',
    conteudo: PNG, nomeArquivo: 'certidao.png' }, { rotulo: 'anexar a certidão' });
  if (doc) {
    fatos.anexos++;
    const docId = campo(doc, 'id', 'docId', 'documentoId');
    if (docId) {
      await post('coord', `/people/${k.id}/documents/${docId}/accept`, { nota: 'Conferida com o original.' }, { rotulo: 'aceitar o documento' });
      const baixado = await post('tecnica', `/people/${k.id}/documents/${docId}/download`, {}, { rotulo: 'baixar o documento' });
      if (baixado) {
        fatos.downloads++;
        const conteudo = campo(baixado, 'conteudo', 'conteudoBase64');
        if (conteudo !== PNG) achar('anexo', 'tecnica', 'baixar o documento', 'o arquivo baixado não é o que entrou');
      }
    } else achar('forma', 'tecnica', 'anexar a certidão', `sem id na resposta: ${JSON.stringify(doc).slice(0, 150)}`);
  }
  /* A família: a avó, com foto 3x4 e visita autorizada no fim de semana à tarde. */
  const avo = await post('tecnica', `/people/${k.id}/contacts`,
    { nome: `Avó de ${k.social} (fictícia)`, vinculo: 'avo', telefone: '51 90000-2000' }, { rotulo: 'cadastrar a avó' });
  const avoId = campo(avo, 'id', 'contatoId');
  if (avoId) {
    k.contatos.push(avoId);
    if (await post('tecnica', `/people/contacts/${avoId}/photo`, { conteudo: PNG }, { rotulo: 'foto 3x4 da avó' })) fatos.anexos++;
    await post('tecnica', `/people/contacts/${avoId}/visit`, { autorizado: true, dias: [0, 6], de: '14:00', ate: '17:00' },
      { rotulo: 'autorizar a visita da avó' });
  }
}

async function acolher() {
  const dia = INICIO;
  relogio(dia, '14:00');
  console.log(`▸ ${dia} · as primeiras crianças chegam`);
  for (const c of CRIANCAS) {
    const k = await admitir('tecnica', c, dia);
    if (k) await completarOPerfil(k);
  }
  const lara = criancas.find((c) => c.chave === 'lara');
  const caio = criancas.find((c) => c.chave === 'caio');
  const yasmin = criancas.find((c) => c.chave === 'yasmin');
  if (lara) await post('tecnica', `/people/${lara.id}/food-restrictions`,
    { restricao: 'Leite e derivados', substituicao: 'Bebida vegetal', orientacao: 'Oferecer o leite sem lactose da despensa.' },
    { rotulo: 'restrição alimentar' });
  if (caio) await post('enfermagem', `/people/${caio.id}/health-conditions`,
    { tipo: 'alergia', descricao: 'dipirona', gravidade: 'grave', alertaEssencial: true }, { rotulo: 'alergia' });

  /* A Enfermagem: prescrições, a nota da farmácia e o armário. */
  relogio(dia, '16:00');
  for (const [k, remedio, horarios] of [
    [lara, 'Sulfato ferroso 40 mg (fictício)', ['06:00']],
    [yasmin, 'Fluoxetina 10 mg (fictícia)', ['08:00', '20:00']],
  ] as const) {
    if (!k) continue;
    const pr = await post('enfermagem', '/medications/prescriptions', {
      personId: k.id, houseId: ids.ARM1, tipo: 'uso_continuo', medicamento: remedio, dose: '1 comprimido',
      via: 'oral', horarios, prescritor: 'UBS do bairro (fictícia)', inicio: somaDias(dia, 1) }, { rotulo: 'prescrever' });
    if (pr?.id) await post('enfermagem', `/medications/prescriptions/${pr.id}/sign`, {}, { rotulo: 'assinar a prescrição' });
  }
  await comprarRemedio(dia, 1);
}

async function comprarRemedio(dia: string, n: number) {
  const nf = await post('enfermagem', '/medications/purchases', {
    houseId: ids.ARM1, em: dia, fornecedor: 'Farmácia do Bairro (fictícia)', cnpj: '11.222.333/0001-81',
    nota: `NF-ARM1-${n}`, conteudo: PNG, anexoNome: `nota-${n}.png`,
    itensDaNota: [
      { medicamento: 'Sulfato ferroso 40 mg (fictício)', quantidade: 1, unidade: 'caixa', valorUnitarioCentavos: 1890, lote: `LF${n}`, validade: '2027-12-31' },
      { medicamento: 'Fluoxetina 10 mg (fictícia)', quantidade: 2, unidade: 'caixa', valorUnitarioCentavos: 2450, lote: `LX${n}`, validade: '2027-10-31' },
    ] }, { rotulo: 'lançar a nota da farmácia' });
  if (nf) fatos.notasFiscais++;
  for (const [remedio, q, lote] of [['Sulfato ferroso 40 mg (fictício)', 30, `LF${n}`], ['Fluoxetina 10 mg (fictícia)', 56, `LX${n}`]] as const) {
    const e = await post('enfermagem', '/medications/stock', {
      tipo: 'entrada', houseId: ids.ARM1, medicamento: remedio, quantidade: q, origem: 'compra', lote, validade: '2027-10-31' },
      { rotulo: 'entrada no armário' });
    if (e) { fatos.entradasArmario++; entradasPorRemedio[remedio] = (entradasPorRemedio[remedio] ?? 0) + q; }
  }
}

/** A escala: 12x36 de dia (Ana e Bruno) e de noite (Carla e Davi); o líder de segunda a sexta. */
const escalados: Record<string, { diurno: string; noturno: string }> = {};
function quemTrabalha(dia: string) {
  const par = Math.round((new Date(`${dia}T12:00:00Z`).getTime() - new Date(`${INICIO}T12:00:00Z`).getTime()) / 864e5) % 2 === 0;
  return escalados[dia] ?? { diurno: par ? 'edu1' : 'edu2', noturno: par ? 'edu3' : 'edu4' };
}
async function escalaDoPrimeiroMes() {
  relogio(INICIO, '17:00');
  /* Novembro e dezembro à mão; de janeiro em diante, o rascunho repete o mês anterior. */
  const fim = '2026-12-31';
  for (let d = INICIO; d <= fim; d = somaDias(d, 1)) {
    const q = quemTrabalha(d);
    for (const [turno, quem] of [['diurno', q.diurno], ['noturno', q.noturno]]) {
      await post('coord', '/escala', { houseId: ids.ARM1, userId: gente[quem].id, data: d, turno }, { rotulo: 'publicar a escala do mês' });
    }
    if (![0, 6].includes(diaDaSemana(d))) {
      await post('coord', '/escala', { houseId: ids.ARM1, userId: gente.lider.id, data: d, turno: 'diurno' }, { rotulo: 'publicar a escala do mês' });
    }
  }
}

// ================================================================ o dia da casa

/** Quem não está em casa hoje: internado ou com a família. A chamada não o marca. */
const fora = new Set<string>();
const presentes = () => ativas().filter((c) => !fora.has(c.id));
const plantoes: Record<string, { plantaoId: string; ataId: string }> = {};
let relogioDoDia: any = null;
let primeiraOlhada = true;

async function abrirPlantao(quem: string, dia: string, turno: 'diurno' | 'noturno') {
  const r = await post(quem, '/shifts', { houseId: ids.ARM1, turno }, { rotulo: `abrir o plantão ${turno}` });
  if (!r) return null;
  if (r.data !== dia) achar('turno', quem, `abrir o plantão ${turno}`, `às ${agoraLocal} abriu o plantão do dia ${r.data}, esperava ${dia}`);
  if (r.novo) fatos.plantoes++;
  plantoes[`${dia}|${turno}`] = { plantaoId: r.plantaoId, ataId: r.ataId };
  return r;
}

async function escreverNaAta(quem: string, dia: string, turno: 'diurno' | 'noturno', texto: string, restrita = false) {
  const p = plantoes[`${dia}|${turno}`];
  if (!p) return;
  if (await post(quem, `/shifts/ata/${p.ataId}/notes`, { texto, restrita }, { rotulo: 'escrever na ATA' })) fatos.notasNaAta++;
}

async function passarOPlantao(sai: string, entra: string, dia: string, turno: 'diurno' | 'noturno', frase: string) {
  const p = plantoes[`${dia}|${turno}`];
  if (!p) return;
  const situacao = await get(sai, `/shifts/${p.plantaoId}`, { rotulo: 'ver o plantão antes de passar' });
  const exige = situacao?.remedios?.exigeFrase;
  await post(sai, `/shifts/${p.plantaoId}/handover`, {
    contribuicoes: frase, pendencias: 'Nada pendente além do que está na ATA.', orientacoes: 'Seguir a rotina da casa.',
    ...(exige ? { medicacao: 'Uma dose ficou sem resposta na tela; a próxima equipe confere com a Enfermagem.' } : {}),
  }, { rotulo: 'assinar a passagem' });
  await post(entra, `/shifts/${p.plantaoId}/receipt`, { leuOrientacoes: true, assumiuPendencias: true }, { rotulo: 'receber o plantão' });
}

async function darAsDoses(quem: string, dia: string) {
  const grade = await get(quem, `/medications?houseId=${ids.ARM1}&date=${dia}`, { rotulo: 'abrir a grade do remédio' });
  const doses = lista(grade, 'doses', 'itens');
  if (primeiraOlhada && doses[0]) console.log('    (forma da dose)', Object.keys(doses[0]).join(','));
  const agora = Date.now();
  for (const d of doses) {
    const quando = new Date(campo(d, 'scheduled_at', 'scheduledAt', 'horario')).getTime();
    const estado = campo(d, 'state', 'estado');
    if (quando > agora || estado !== 'aguardando_confirmacao') continue;
    const r = await post(quem, `/medications/doses/${d.id}/confirm`, { estado: 'administrado_no_horario' }, { rotulo: 'confirmar a dose' });
    if (r) { fatos.doses++; const m = campo(d, 'medication', 'medicamento'); dosesPorRemedio[m] = (dosesPorRemedio[m] ?? 0) + 1; }
  }
}

async function chamadaDaRefeicao(quem: string, dia: string, hhmm: string, titulo: string) {
  const k = await post(quem, '/checks', { houseId: ids.ARM1, kind: 'alimentacao', titulo, referenceAt: em(dia, hhmm) },
    { rotulo: 'abrir a chamada da refeição' });
  const id = campo(k, 'checkId', 'check_id', 'id');
  if (!id) return;
  for (const c of presentes()) {
    const opcao = c.chave === 'lara' ? 'dieta_adaptada' : 'normal';
    const m = await post(quem, `/checks/${id}/mark`, { personId: c.id, opcao }, { rotulo: 'marcar na chamada da refeição' });
    if (m) fatos.refeicoes++;
  }
  /* A chamada termina confirmada, como na tela. */
  if (await post(quem, `/checks/${id}/confirm`, {}, { rotulo: 'confirmar a chamada da refeição' })) fatos.chamadasConfirmadas++;
}

async function cumprirAsAtividades(quem: string, dia: string) {
  const r = await get(quem, `/activities?houseId=${ids.ARM1}&date=${dia}`, { rotulo: 'abrir o dia da casa' });
  const itens = lista(r, 'atividades', 'itens', 'activities');
  if (primeiraOlhada && itens[0]) console.log('    (forma da atividade)', Object.keys(itens[0]).join(','));
  const agora = Date.now();
  for (const a of itens) {
    const quando = new Date(campo(a, 'scheduledAt', 'scheduled_at', 'inicio')).getTime();
    const estado = campo(a, 'estado', 'state');
    if (quando > agora || !['agendada', 'aguardando_ciencia', 'ciente', 'nao_confirmada'].includes(estado)) continue;
    await post(quem, `/activities/${a.id}/record`, { estado: 'concluida_no_horario' }, { rotulo: 'registrar a atividade' });
  }
}

async function umDia(dia: string, n: number) {
  const ontem = somaDias(dia, -1);
  const hoje = quemTrabalha(dia), antes = quemTrabalha(ontem);
  const semana = diaDaSemana(dia);

  relogio(dia, '05:00');
  const relogioSvc = app.get(RelogioService);
  relogioDoDia ??= await relogioSvc.quemSou(gente.enfermagem.email);
  const r = await relogioSvc.rodarODia(relogioDoDia);
  for (const f of r.falhas) achar('relógio', 'relógio', 'as rotinas do dia', f);

  /* A madrugada: o remédio das 06h é da noite de ontem. */
  relogio(dia, '06:05');
  if (n > 0) await darAsDoses(antes.noturno, dia);

  /* 07h: a troca. A noite passa para o dia. */
  relogio(dia, '07:00');
  await abrirPlantao(hoje.diurno, dia, 'diurno');
  if (n > 0) {
    await passarOPlantao(antes.noturno, hoje.diurno, ontem, 'noturno', 'Noite tranquila, todos dormiram no horário.');
    relogio(dia, '07:30');
    const p = plantoes[`${ontem}|noturno`];
    if (p) await post('noturno', `/shifts/ata/${p.ataId}/close`, {}, { rotulo: 'fechar a ATA noturna' });
  }
  relogio(dia, '07:40');
  await chamadaDaRefeicao(hoje.diurno, dia, '07:00', 'Café da manhã');
  relogio(dia, '08:05');
  await darAsDoses(hoje.diurno, dia);

  await eventosDoDia(dia, n, 'manha');
  relogio(dia, '12:10');
  await chamadaDaRefeicao(hoje.diurno, dia, '12:00', 'Almoço');
  await cumprirAsAtividades(hoje.diurno, dia);

  await eventosDoDia(dia, n, 'tarde');
  relogio(dia, '18:30');
  await escreverNaAta(hoje.diurno, dia, 'diurno', `Tarde de ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][semana]} sem intercorrências; tema de casa feito com os maiores.`);

  relogio(dia, '18:40');
  await cumprirAsAtividades(hoje.diurno, dia);
  relogio(dia, '19:00');
  await abrirPlantao(hoje.noturno, dia, 'noturno');
  await passarOPlantao(hoje.diurno, hoje.noturno, dia, 'diurno', 'Dia cumprido, banho feito, todos em casa.');
  relogio(dia, '19:15');
  await chamadaDaRefeicao(hoje.noturno, dia, '19:00', 'Janta');
  if (![0, 6].includes(semana)) {
    const p = plantoes[`${dia}|diurno`];
    if (p) {
      /* O líder também estava no turno: assina a passagem antes de fechar. */
      await post('lider', `/shifts/${p.plantaoId}/handover`, { contribuicoes: 'Acompanhei o dia; nada a acrescentar.' }, { rotulo: 'assinar a passagem (líder)' });
      await post('lider', `/shifts/ata/${p.ataId}/close`, {}, { rotulo: 'fechar a ATA diurna' });
    }
  }
  if (semana === 1) {
    /* Segunda: as ATAs diurnas do fim de semana que ninguém fechou (decisão de 28/09). */
    const abertas = lista(await get('lider', `/shifts/abertas?houseId=${ids.ARM1}`, { rotulo: 'as ATAs que ficaram abertas' }));
    for (const a of abertas.filter((x: any) => x.podeFechar)) {
      await post('lider', `/shifts/ata/${a.ataId}/close`, {}, { rotulo: 'fechar a ATA do fim de semana' });
    }
  }
  relogio(dia, '20:05');
  await darAsDoses(hoje.noturno, dia);
  await eventosDoDia(dia, n, 'noite');
  relogio(dia, '23:00');
  await escreverNaAta(hoje.noturno, dia, 'noturno', 'Todos dormindo às 22h; ronda feita à meia-noite.');
  await cumprirAsAtividades(hoje.noturno, dia);
  primeiraOlhada = false;
}

// ================================================================ o que acontece no período

const k = (chave: string) => criancas.find((c) => c.chave === chave)!;
const internacoes: { id: string; crianca: string; desde: string; ate?: string; notas: number; anexos: number }[] = [];
const visitasFeitas: { crianca: string; contato: string; dia: string; entrada: string; saida: string }[] = [];

/** As visitas do fim de semana: a portaria confere a foto, registra a entrada e a saída. */
async function visitasDoFimDeSemana(dia: string) {
  relogio(dia, '14:05');
  const hoje = await get('portaria', `/people/portaria/hoje?houseId=${ids.ARM1}`, { rotulo: 'abrir a portaria' });
  const esperados = lista(hoje, 'visitantes');
  const dentro: { visita: string; crianca: string; contato: string }[] = [];
  for (const c of presentes()) {
    for (const contato of c.contatos) {
      const v = esperados.find((x: any) => campo(x, 'contatoId', 'id') === contato);
      if (!v) { achar('portaria', 'portaria', 'visitante autorizado não aparece no portão', `${c.social} · ${dia}`); continue; }
      if (!campo(v, 'temFoto', 'foto', 'fotoUrl', 'comFoto')) achar('portaria', 'portaria', 'a foto do visitante não aparece no portão', JSON.stringify(Object.keys(v)));
      await get('portaria', `/people/portaria/visitante/${contato}/foto`, { rotulo: 'ver a foto do visitante' });
      /* Metade das semanas a avó vem; a outra metade não. */
      if ((c.chave.length + Number(dia.slice(8))) % 2 === 1) continue;
      relogio(dia, '14:10');
      const e = await post('portaria', '/people/portaria/visitas', { contatoId: contato, documento: 'RG' }, { rotulo: 'registrar a entrada da visita' });
      if (e?.id) dentro.push({ visita: e.id, crianca: c.id, contato });
    }
  }
  relogio(dia, '16:20');
  for (const d of dentro) {
    const s = await post('portaria', `/people/portaria/visitas/${d.visita}/saida`, { nota: 'Saiu tranquila, combinou voltar no próximo sábado.' }, { rotulo: 'registrar a saída da visita' });
    if (s) {
      fatos.visitas++;
      fatos.visitasPorCrianca[d.crianca] = (fatos.visitasPorCrianca[d.crianca] ?? 0) + 1;
      visitasFeitas.push({ crianca: d.crianca, contato: d.contato, dia, entrada: '14:10', saida: '16:20' });
    }
  }
  /* Uma visita fora do combinado, numa terça: a portaria não deixa entrar. */
}

async function internar(chave: string, dia: string, hospital: string, motivo: string) {
  relogio(dia, '10:30');
  const c = k(chave);
  const r = await post('tecnica', '/nursing/hospitalizations', {
    personId: c.id, houseId: ids.ARM1, hospital, motivo, desde: em(dia, '10:00') }, { rotulo: 'abrir a internação' });
  if (!r?.id) return null;
  fatos.internacoes++;
  fora.add(c.id);
  const i = { id: r.id, crianca: c.id, desde: dia, notas: 0, anexos: 0 };
  internacoes.push(i);
  await post('tecnica', `/nursing/hospitalizations/${r.id}/companion`, { userId: gente.edu1.id, de: dia }, { rotulo: 'designar o acompanhante' });
  return i;
}
async function diarioDoHospital(i: { id: string; notas: number; anexos: number }, dia: string, quem: string, comLaudo: boolean) {
  relogio(dia, '15:50');
  /* Quem vai ao hospital hoje é designado pela técnica, como na casa. */
  await post('tecnica', `/nursing/hospitalizations/${i.id}/companion`, { userId: gente[quem].id, de: dia }, { rotulo: 'designar o acompanhante do dia' });
  relogio(dia, '16:00');
  const corpo: any = { dia, tipo: 'relato', texto: 'Passou bem o dia, comeu pouco no almoço e brincou com a enfermeira da tarde.' };
  if (comLaudo) Object.assign(corpo, { conteudo: Buffer.from(Buffer.from(PDF, 'base64').toString('latin1') + `% ${dia}\n`, 'latin1').toString('base64'), nomeArquivo: 'boletim-do-hospital.pdf', categoria: 'exame' });
  const n = await post(quem, `/nursing/hospitalizations/${i.id}/notes`, corpo, { rotulo: 'escrever no diário da internação' });
  if (n) { i.notas++; if (comLaudo) { i.anexos++; fatos.anexos++; } }
  if (n?.id && comLaudo) {
    const lido = await get(quem, `/nursing/hospitalizations/${i.id}/notes/${n.id}/anexo`, { rotulo: 'abrir o anexo da internação' });
    if (lido && campo(lido, 'conteudo') !== corpo.conteudo) achar('anexo', quem, 'abrir o anexo da internação', 'o arquivo que volta não é o que entrou');
  }
}
async function alta(i: { id: string; crianca: string; ate?: string }, dia: string) {
  relogio(dia, '15:00');
  const r = await post('tecnica', `/nursing/hospitalizations/${i.id}/close`,
    { desfecho: 'alta', ate: em(dia, '14:30'), observacao: 'Alta com orientação de repouso e retorno na UBS em sete dias.' },
    { rotulo: 'fechar a internação com alta' });
  if (r) { i.ate = dia; fora.delete(i.crianca); }
}

async function ocorrencia(dia: string, quem: string) {
  relogio(dia, '21:40');
  const [a, b] = presentes().filter((c) => ['enzo', 'caio', 'theo', 'davi'].includes(c.chave));
  const o = await post(quem, '/incidents', {
    houseId: ids.ARM1, categoria: 'conflito_agressao', quando: new Date().toISOString(),
    acolhidos: [a.id, b.id], fato: 'Discussão por causa do controle da televisão; Enzo empurrou Caio, que bateu o braço na porta.',
    medidasImediatas: 'Separados, gelo no braço do Caio, conversa com os dois antes de dormir.' }, { rotulo: 'registrar a ocorrência' });
  if (!o?.id) return;
  fatos.ocorrencias++;
  relogio(dia, '22:10');
  await post(quem, '/statements', { houseId: ids.ARM1, context: 'ocorrencia', entity: 'incident', entityId: o.id,
    witness: 'presenciei_integralmente', body: 'Estava na sala e vi o empurrão; separei os dois na hora.' }, { rotulo: 'declarar o que viu' });
  amanha(dia, async () => { relogio(somaDias(dia, 1), '10:00');
  await post('tecnica', `/incidents/${o.id}/synthesis`, { sintese: 'Conflito resolvido com conversa; combinado revezamento da televisão.' }, { rotulo: 'síntese da ocorrência', espera: [200, 201, 400] });
  const f = await get('coord', `/incidents/${o.id}/folha`, { rotulo: 'folha da ocorrência' });
  if (f) fatos.relatorios++; });
}

async function convivenciaFamiliar(chave: string, sai: string, volta: string) {
  const c = k(chave);
  relogio(sai, '09:00');
  const r = await post('tecnica', '/people/family-stays', {
    personId: c.id, contatoId: c.contatos[0], inicio: em(sai, '10:00'), retornoPrevisto: em(volta, '18:00'),
    finalidade: 'Fim de semana com a avó, conforme plano de reaproximação.' }, { rotulo: 'registrar a saída com a família' });
  if (!r?.id) return;
  /* A cesta básica que vai junto. */
  const cesta = await post('tecnica', '/people/kitchen-requests', { houseId: ids.ARM1, tipo: 'cesta_basica', personId: c.id,
    em: sai, quantidade: 1, finalidade: 'Fim de semana com a avó.', entregarA: `Avó de ${c.social}` }, { rotulo: 'pedir a cesta básica' });
  if (cesta) fatos.cestas++;
  await get('tecnica', `/medications/family-stays/${r.id}/to-take`, { rotulo: 'ver o remédio que vai junto' });
  fora.add(c.id);
  saidaAberta = { id: r.id, crianca: c.id, volta };
}
let saidaAberta: { id: string; crianca: string; volta: string } | null = null;
async function voltarDaFamilia(dia: string) {
  if (!saidaAberta) return;
  relogio(dia, '18:10');
  const q = quemTrabalha(dia);
  await post(q.diurno, `/people/family-stays/${saidaAberta.id}/return`, {
    quando: new Date().toISOString(), nota: 'Voltou contente, contou do almoço de domingo.', trouxe: 'Mochila com roupa suja.' },
    { rotulo: 'registrar a volta da família' });
  fora.delete(saidaAberta.crianca); saidaAberta = null;
}

async function transferir(chave: string, dia: string) {
  relogio(dia, '10:00');
  const c = k(chave);
  const t = await post('tecnica', '/transfers', { personId: c.id, toHouseId: ids.AI4,
    reason: 'Aproximação da escola e da família extensa, que mora perto da AI4.' }, { rotulo: 'pedir a transferência' });
  if (!t?.id) return;
  relogio(dia, '11:30');
  const ok = await post('coord4', `/transfers/${t.id}/accept`, {}, { rotulo: 'aceitar a transferência' });
  if (ok) { c.ativa = false; fatos.transferencias++; }
  /* Depois de sair, a ARM1 não abre mais o perfil de quem foi. */
  await get('edu1', `/people/${c.id}`, { rotulo: 'abrir o perfil de quem foi transferido', espera: [200, 404, 403] });
}

async function desligar(chave: string, dia: string) {
  relogio(dia, '11:00');
  const c = k(chave);
  const r = await post('tecnica', `/people/${c.id}/discharge`, { motivo: 'Reintegração familiar com a avó, determinada em audiência.' }, { rotulo: 'desligar por reintegração' });
  if (r) { c.ativa = false; fatos.desligamentos++; }
}
async function reacolher(chave: string, dia: string) {
  relogio(dia, '22:30');
  const c = k(chave);
  /* Chegou de noite: quem está na casa é o educador do plantão. */
  const q = quemTrabalha(dia);
  const tentativa = await post(q.noturno, `/people/${c.id}/readmit`, { houseId: ids.ARM1 }, { rotulo: 'reacolher de noite, pelo educador', espera: [200, 201, 403] });
  if (!tentativa || tentativa.statusCode === 403) {
    amanha(dia, async () => {
      relogio(somaDias(dia, 1), '09:00');
      const r = await post('tecnica', `/people/${c.id}/readmit`, { houseId: ids.ARM1 }, { rotulo: 'reacolher' });
      if (r) { c.ativa = true; fatos.admissoes++; }
    });
  } else { c.ativa = true; fatos.admissoes++; }
}

async function acompanhamentosDoMes(dia: string) {
  relogio(dia, '10:30');
  /* Pelo botão da tela, que manda o corpo vazio. */
  await post('tecnica', '/followups/generate', {}, { rotulo: 'gerar pendências sem a casa', espera: [400] });
  await post('tecnica', '/followups/generate', { houseId: ids.ARM1, data: dia }, { rotulo: 'gerar pendências' });
  const p = lista(await get('tecnica', `/followups?houseId=${ids.ARM1}`, { rotulo: 'abrir os acompanhamentos' }), 'itens', 'pendentes');
  if (!p.length) achar('acompanhamento', 'tecnica', 'abrir os acompanhamentos', 'a lista veio vazia depois de gerar');
  for (const f of p.filter((x: any) => ['pendente', 'rascunho'].includes(campo(x, 'situacao', 'status', 'estado')))) {
    await post('tecnica', `/followups/${f.id}/draft`, { saude: 'Consultas em dia, vacinas conferidas.', escola: 'Frequência regular, tema feito com apoio.',
      convivencia: 'Boa relação com os colegas de casa.', familia: 'Visitas da avó nos fins de semana.' }, { rotulo: 'redigir o acompanhamento' });
    await post('tecnica', `/followups/${f.id}/submit`, {}, { rotulo: 'enviar o acompanhamento para aprovação' });
    await post('coord', `/followups/${f.id}/approve`, {}, { rotulo: 'aprovar o acompanhamento' });
  }
}

async function escalaDoMesSeguinte(dia: string, mes: string) {
  relogio(dia, '10:00');
  const r = await post('coord', '/escala/rascunho', { houseId: ids.ARM1, mes }, { rotulo: 'repetir a escala do mês anterior' });
  const id = campo(r, 'id', 'rascunhoId');
  if (!id) return;
  const pub = await post('coord', `/escala/rascunho/${id}/publicar`, {}, { rotulo: 'publicar a escala' });
  if (pub && !(pub.publicados > 0)) achar('escala', 'coord', 'publicar a escala', `publicou ${pub.publicados}`);
}

async function trocaNaEquipe(dia: string) {
  /* O Bruno sai da casa; entra a Elisa, e herda os dias dele. */
  relogio(dia, '09:00');
  await post('coord', `/staff/${gente.edu2.id}/deactivate`, { motivo: 'Pediu desligamento para trabalhar perto de casa.' }, { rotulo: 'desativar quem saiu' });
  await criarConta('edu5', 'coord', { chave: 'edu5', nome: 'Elisa Educadora (fictícia)', email: 'elisa.arm1@paodospobres.dev', cargo: 'educador' });
  for (let d = dia; d <= somaDias(INICIO, DIAS); d = somaDias(d, 1)) {
    const q = quemTrabalha(d);
    if (q.diurno === 'edu2') {
      escalados[d] = { ...q, diurno: 'edu5' };
      await post('coord', '/escala', { houseId: ids.ARM1, userId: gente.edu5.id, data: d, turno: 'diurno' }, { rotulo: 'pôr a nova educadora na escala' });
    }
  }
  /* Quem saiu não entra mais. */
  const r = await request(http).post('/api/v1/auth/login').send({ email: gente.edu2.email, password: gente.edu2.senha });
  if (r.status < 400) achar('equipe', 'edu2', 'quem foi desativado ainda entra', `${r.status}`);
  delete sessoes.edu2;
}

async function lancheDoPasseio(dia: string) {
  relogio(dia, '09:00');
  const q = quemTrabalha(dia);
  const r = await post(q.diurno, '/people/kitchen-requests', { houseId: ids.ARM1, tipo: 'lanche', pessoas: presentes().map((c) => c.id),
    em: dia, quantidade: 1, finalidade: 'Passeio ao parque da Redenção.' }, { rotulo: 'pedir o lanche do passeio (todos)' });
  if (r) fatos.pedidosCozinha += presentes().length;
  relogio(dia, '09:30');
  await get('cozinha', `/people/kitchen-requests?houseId=${ids.ARM1}`, { rotulo: 'a cozinha abre os pedidos' });
  await get('cozinha', `/people/kitchen-requests/folha/restricoes?houseId=${ids.ARM1}`, { rotulo: 'a cozinha abre a folha das restrições' });
}

/**
 * O calendário, por parte do dia, para o relógio nunca andar para trás:
 * a manhã (09h-11h), a tarde (14h-18h) e a noite (21h-23h).
 */
const depois: Record<string, (() => Promise<void>)[]> = {};
const amanha = (dia: string, f: () => Promise<void>) => { (depois[somaDias(dia, 1)] ??= []).push(f); };

async function eventosDoDia(dia: string, n: number, parte: 'manha' | 'tarde' | 'noite') {
  const semana = diaDaSemana(dia);
  const noMes = dia.slice(8);
  if (parte === 'manha') {
    for (const f of depois[dia] ?? []) await f();
    /* O que se repete o ano inteiro (fase 174): a escala do mês seguinte no dia
       20, a compra do remédio a cada 28 dias, os acompanhamentos no dia 14, o
       lanche do passeio no dia 10. */
    if (noMes === '20' && dia >= '2026-12-20') await escalaDoMesSeguinte(dia, proximoMes(dia));
    if (n > 0 && n % 28 === 0) await comprarRemedio(dia, 1 + n / 28);
    if (noMes === '14') await acompanhamentosDoMes(dia);
    if (noMes === '10') await lancheDoPasseio(dia);
    /* Os acontecimentos, espalhados pelo ano. */
    const internacao = ({ 9: 'sofia', 200: 'caio', 310: 'yasmin' } as Record<number, string>)[n];
    if (internacao && presentes().some((c) => c.chave === internacao)) {
      await internar(internacao, dia, 'Hospital da Criança (fictício)', 'Pneumonia, em observação com antibiótico na veia.');
    }
    const familia = ({ 18: 'yasmin', 130: 'caio', 250: 'sofia' } as Record<number, string>)[n];
    if (familia && presentes().some((c) => c.chave === familia && c.contatos.length)) {
      await convivenciaFamiliar(familia, dia, somaDias(dia, 2));
    }
    if (n === 34) await transferir('enzo', dia);
    if (n === 42) await desligar('lara', dia);
    if (n === 44) await trocaNaEquipe(dia);
    if (n === 150 || n === 280) {
      relogio(dia, '10:00');
      const nova = n === 150
        ? { chave: 'bia', nome: 'Beatriz Souza (fictícia)', social: 'Bia', nascimento: '2013-06-18', genero: 'menina' }
        : { chave: 'davi', nome: 'Davi Rocha (fictício)', social: 'Davi', nascimento: '2015-10-05', genero: 'menino' };
      const k = await admitir('tecnica', nova, dia);
      if (k) await completarOPerfil(k);
    }
  }
  if (parte === 'tarde') {
    if (semana === 0 || semana === 6) await visitasDoFimDeSemana(dia);
    const aberta = internacoes.find((x) => !x.ate);
    if (aberta) {
      const dias = Math.round((new Date(`${dia}T12:00:00Z`).getTime() - new Date(`${aberta.desde}T12:00:00Z`).getTime()) / 864e5);
      if (dias <= 2) await diarioDoHospital(aberta, dia, dias === 1 ? 'edu3' : 'edu1', dias !== 1);
      else await alta(aberta, dia);
    }
    if (saidaAberta && saidaAberta.volta === dia) await voltarDaFamilia(dia);
    /* Uma visita fora do combinado perto do dia 23 e do dia 180, sempre num dia de
       semana: no sábado e no domingo a avó está no combinado. */
    const vez = n >= 23 && n <= 27 ? 23 : n >= 180 && n <= 184 ? 180 : 0;
    if (vez && ![0, 6].includes(semana) && !foraFeitaEm.has(vez)) {
      foraFeitaEm.add(vez);
      await visitaForaDoCombinado(dia);
    }
  }
  if (parte === 'noite') {
    if (n === 2) {
      /* Chega de noite uma criança nova; a técnica completa o perfil de manhã. */
      relogio(dia, '22:40');
      /* A técnica não está: quem registra é o educador do plantão (decisão de 28/09). */
      const r = await post(quemTrabalha(dia).noturno, '/people/chegada', { houseId: ids.ARM1, nome: 'Theo (fictício)',
        idadeAproximada: 7, trazidaPor: 'Conselho Tutelar, plantão noturno',
        chegada: 'Chegou às 22h30 com a roupa do corpo, com fome; jantou e dormiu.' }, { rotulo: 'registrar a chegada de noite' });
      if (r?.personId) {
        fatos.admissoes++;
        const c: Crianca = { chave: 'theo', id: r.personId, nome: 'Theo (fictício)', social: 'Theo', nascimento: '2019-01-01', contatos: [], ativa: true };
        criancas.push(c);
        amanha(dia, async () => {
          relogio(somaDias(dia, 1), '09:00');
          const avisos = await get('tecnica', '/notifications', { rotulo: 'a técnica abre os avisos' });
          if (!lista(avisos, 'itens').some((a: any) => /Chegou uma criança pelo plantão/.test(a.titulo)))
            achar('chegada', 'tecnica', 'o aviso da chegada de noite', 'a técnica não recebeu');
          await post('tecnica', `/people/${c.id}/corrigir-identificacao`, { nome: 'Theo Lima (fictício)',
            nascimento: '2019-03-03', motivo: 'Dados conferidos com a certidão trazida pelo Conselho Tutelar.' },
            { rotulo: 'completar a identificação da chegada' });
          await completarOPerfil(c);
        });
      }
    }
    if (n % 45 === 5 && presentes().filter((c) => ['enzo', 'caio', 'theo', 'davi'].includes(c.chave)).length >= 2) {
      await ocorrencia(dia, quemTrabalha(dia).noturno);
    }
    if (n === 70) await reacolher('lara', dia);
  }
}

const foraFeitaEm = new Set<number>();
async function visitaForaDoCombinado(dia: string) {
  /* A avó chega numa quarta-feira, fora do combinado. A portaria não abre; a
     coordenação abre a exceção com o motivo, e a visita entra. */
  const c = presentes().find((x) => x.contatos.length)!;
  relogio(dia, '15:00');
  const recusa = await post('portaria', '/people/portaria/visitas', { contatoId: c.contatos[0], documento: 'RG' },
    { rotulo: 'visita fora do combinado, pela portaria', espera: [400, 403] });
  if (recusa && !/combinad|autoriza|hor/i.test(String(recusa.message))) achar('voz', 'portaria', 'recusa da visita fora do combinado', String(recusa.message));
  const e = await post('coord', '/people/portaria/visitas', { contatoId: c.contatos[0], documento: 'RG',
    excecao: 'A avó veio trazer o remédio que ficou na casa dela no fim de semana.' }, { rotulo: 'exceção de visita pela coordenação' });
  if (e?.id) {
    relogio(dia, '15:30');
    if (await post('coord', `/people/portaria/visitas/${e.id}/saida`, {}, { rotulo: 'saída da visita de exceção' })) {
      fatos.visitas++; fatos.visitasPorCrianca[c.id] = (fatos.visitasPorCrianca[c.id] ?? 0) + 1;
    }
  }
}

// ================================================================ a conferência

const SIGLAS = new Set(['CPF', 'CNPJ', 'RG', 'ATA', 'ATAS', 'SUS', 'UBS', 'PIA', 'ECA', 'CRAS', 'CREAS',
  'NIS', 'CID', 'CAPS', 'UPA', 'SAMU', 'EJA', 'CEP', 'LGPD', 'MP', 'TJ', 'RS', 'PDF', 'DOCX', 'FASC', 'PAEFI', 'ARM', 'NF', 'RASCUNHO']);
function textoDoDocx(base64: string): string {
  const { dentroDoDocx } = require('../test/setup/dentro-do-docx');
  const { conteudo } = dentroDoDocx(base64);
  return Object.entries(conteudo as Record<string, string>)
    .filter(([n]) => /word\/(document|header\d*|footer\d*)\.xml$/.test(n))
    .map(([, x]) => x.replace(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g, '').replace(/<w:p[ >]/g, '\n$&').replace(/<[^>]+>/g, '')).join('\n');
}
function vozDoPapel(nome: string, texto: string) {
  const problemas: string[] = [];
  /* O traço sozinho numa célula vazia é convenção de tabela; o travessão entre palavras não. */
  if (/\S[ \t][—–][ \t]\S/.test(texto)) problemas.push(`travessão: ${texto.match(/.{0,50}\S[ \t][—–][ \t]\S.{0,30}/)?.[0]}`);
  /* A linha inteira em maiúsculas é título ou timbre; ênfase é a palavra solta no meio da frase. */
  for (const linha of texto.split('\n').filter((l) => /[a-zà-ú]/.test(l))) {
    for (const m of linha.matchAll(/(?<![\wÀ-ú])[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}(?![\wÀ-ú])/g)) if (!SIGLAS.has(m[0])) problemas.push(`maiúsculas: ${m[0]} em ${linha.slice(0, 80)}`);
  }
  if (/["“”]/.test(texto)) problemas.push(`aspas: ${texto.match(/.{0,40}["“”].{0,40}/)?.[0]}`);
  if (/\bsistema\b/i.test(texto)) problemas.push(`fala do sistema: ${texto.match(/.{0,50}\bsistema\b.{0,30}/i)?.[0]}`);
  if (/de propósito|não é avaliação/i.test(texto)) problemas.push('explica a regra');
  if (/undefined|\bnull\b|NaN|\[object|Invalid Date/.test(texto)) problemas.push(`lixo no papel: ${texto.match(/.{0,40}(undefined|\bnull\b|NaN|\[object|Invalid Date).{0,20}/)?.[0]}`);
  for (const p of [...new Set(problemas)]) achar('voz do papel', 'documento', nome, p);
}
async function baixar(quem: string, rota: string, corpo: any, nome: string, deveConter: string[] = []) {
  const r = await post(quem, rota, { finalidade: 'Conferência do trimestre da casa com a coordenação.', ...corpo }, { rotulo: `baixar ${nome}` });
  const b64 = campo(r, 'conteudoBase64');
  if (!b64) return null;
  fatos.downloads++;
  writeFileSync(join(SAIDA, `${nome.replace(/[^a-z0-9]+/gi, '-')}.docx`), Buffer.from(b64, 'base64'));
  const texto = textoDoDocx(b64);
  vozDoPapel(nome, texto);
  for (const d of deveConter) if (!texto.includes(d)) achar('relatório', quem, nome, `não traz: ${d}`);
  return texto;
}
function confere(o_que: string, sistema: unknown, contado: unknown) {
  const ok = JSON.stringify(sistema) === JSON.stringify(contado);
  console.log(`  ${ok ? '✓' : '✗'} ${o_que}: o sistema diz ${JSON.stringify(sistema)}, a casa contou ${JSON.stringify(contado)}`);
  if (!ok) achar('não bate', 'conferência', o_que, `o sistema diz ${JSON.stringify(sistema)}, a casa contou ${JSON.stringify(contado)}`);
}

async function conferir(ultimo: string) {
  relogio(somaDias(ultimo, 1), '09:00');
  const DE = INICIO, ATE = ultimo;
  console.log(`\n▸ ${somaDias(ultimo, 1)} · a conferência`);

  /* As visitas, criança por criança, no perfil dela. */
  for (const c of criancas) {
    const v = await get('tecnica', `/people/${c.id}/visitas?de=${DE}&ate=${ATE}`, { rotulo: 'as visitas no perfil da criança', espera: [200, 404] });
    if (!v?.contagem) continue;
    confere(`visitas de ${c.social}`, v.contagem.noPeriodo, fatos.visitasPorCrianca[c.id] ?? 0);
    const semParametro = await get('tecnica', `/people/${c.id}/visitas`, { rotulo: 'as visitas no perfil, sem período' });
    if (semParametro && (fatos.visitasPorCrianca[c.id] ?? 0) > 0 && semParametro.contagem.noPeriodo < (fatos.visitasPorCrianca[c.id] ?? 0))
      achar('ano novo', 'tecnica', 'as visitas no perfil, sem período', `mostra ${semParametro.contagem.noPeriodo} de ${fatos.visitasPorCrianca[c.id]}: o período padrão começa em 1º de janeiro`);
    const longas = (v.visitas ?? []).filter((x: any) => x.minutos !== 130 && x.minutos !== 30);
    if (longas.length) achar('não bate', 'conferência', `tempo das visitas de ${c.social}`, JSON.stringify(longas.map((x: any) => x.minutos)));
    if ((fatos.visitasPorCrianca[c.id] ?? 0) > 0 && c.ativa)
      await baixar('tecnica', `/people/${c.id}/visitas/export`, { de: DE, ate: ATE }, `visitas de ${c.social}`, [`Avó de ${c.social}`]);
  }

  /* As refeições da casa. */
  const ref = await get('coord', `/reports/period/meals?houseId=${ids.ARM1}&de=${DE}&ate=${ATE}`, { rotulo: 'as refeições do período' });
  if (ref) confere('refeições registradas', ref.total?.registros, fatos.refeicoes);

  /* O armário: o que entrou menos o que foi dado. */
  const armario = lista(await get('enfermagem', `/medications/stock?houseId=${ids.ARM1}`, { rotulo: 'o armário' }), 'itens', 'estoque');
  for (const [m, entrou] of Object.entries(entradasPorRemedio)) {
    const linha = armario.find((x: any) => campo(x, 'medicamento', 'medication') === m);
    confere(`saldo de ${m}`, Number(campo(linha, 'quantidade', 'quantity', 'saldo')), entrou - (dosesPorRemedio[m] ?? 0));
  }
  const { rows: [dadas] } = await admin.query(
    `SELECT count(*)::int AS n FROM medication_administration a
      WHERE a.house_id = $1 AND a.state = 'administrado_no_horario'`, [ids.ARM1]);
  confere('doses dadas no horário', dadas.n, fatos.doses);

  /* Os plantões e as ATAs. */
  const { rows: atas } = await admin.query(
    `SELECT s.period AS turno, a.status::text AS situacao, count(*)::int AS n
       FROM shift s JOIN ata a ON a.shift_id = s.id WHERE s.house_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [ids.ARM1]);
  console.log('  ATAs por turno e situação:', JSON.stringify(atas));
  confere('plantões abertos', atas.reduce((n: number, a: any) => n + a.n, 0), fatos.plantoes);
  const { rows: [esquecidas] } = await admin.query(
    `SELECT count(*)::int AS n FROM shift s JOIN ata a ON a.shift_id = s.id
      WHERE s.house_id = $1 AND a.status = 'rascunho' AND s.on_date < $2::date - 2`, [ids.ARM1, ultimo]);
  confere('ATAs esquecidas abertas (mais de dois dias)', esquecidas.n, 0);
  const { rows: [avisosDeDose] } = await admin.query(
    `SELECT count(*)::int AS avisos, count(DISTINCT entity_id)::int AS doses FROM escalation
      WHERE entity = 'medication_dose' AND house_id = $1`, [ids.ARM1]);
  confere('avisos de dose atrasada por dose (uma vez só, em dois níveis)', avisosDeDose.doses ? avisosDeDose.avisos / avisosDeDose.doses : 2, 2);

  /* Uma ATA de cada turno, no papel. */
  for (const chave of [`${somaDias(INICIO, 5)}|diurno`, `${somaDias(INICIO, 5)}|noturno`, `2026-12-31|noturno`]) {
    const p = plantoes[chave];
    if (p) await baixar('coord', `/shifts/${p.plantaoId}/export`, {}, `ATA ${chave.replace('|', ' ')}`);
  }

  /* A internação, com o diário e os anexos. */
  for (const i of internacoes) {
    const t = await baixar('enfermagem', `/nursing/hospitalizations/${i.id}/export`, {}, 'relatório da internação', ['Hospital da Criança']);
    if (t) {
      const relatos = (t.match(/Passou bem o dia/g) ?? []).length;
      confere('registros do diário no relatório da internação', relatos, i.notas);
    }
  }

  /* A gestão: o período da casa, e a casa no painel. */
  /* O período vai até seis meses (regra do relatório): o ano sai em metades, e a
     soma das metades tem de ser o que a casa contou. */
  const metades: [string, string][] = [];
  for (let de = DE; de <= ATE; ) {
    const ate = [somaDias(de, 180), ATE].sort()[0];
    metades.push([de, ate]); de = somaDias(ate, 1);
  }
  let chamadasConfirmadas = 0, refeicoes = 0, semResposta = 0, lidas = 0;
  for (const [de, ate] of metades) {
    const periodo = await baixar('gestor', '/reports/period/export', { houseId: ids.ARM1, de, ate }, `relatório do período ${de} a ${ate}`);
    if (!periodo) continue;
    lidas++;
    const chamadas = periodo.match(/Chamadas\n(\d+), sendo (\d+) confirmada/);
    if (chamadas) chamadasConfirmadas += Number(chamadas[2]);
    const doses = periodo.match(/Doses confirmadas\n(\d+), com (\d+) sem resposta/);
    if (doses) semResposta += Number(doses[2]);
    const ref = periodo.match(/Refeições conferidas\n(\d+)/);
    if (ref) refeicoes += Number(ref[1]);
  }
  if (lidas === metades.length) {
    confere(`chamadas confirmadas nos ${metades.length} relatórios do período`, chamadasConfirmadas, fatos.chamadasConfirmadas);
    confere(`doses sem resposta nos ${metades.length} relatórios do período`, semResposta, 0);
    confere(`refeições nos ${metades.length} relatórios do período`, refeicoes, fatos.refeicoes);
  }
  const painel = await get('gestor', '/reports/panel', { rotulo: 'o painel da gestão' });
  if (painel) writeFileSync(join(SAIDA, 'painel.json'), JSON.stringify(painel, null, 2));
  const ocup = await get('gestor', `/houses/${ids.ARM1}/occupancy`, { rotulo: 'a ocupação da casa' });
  if (ocup) confere('acolhidos na casa hoje', Number(campo(ocup, 'ocupadas')), ativas().length);

  /* A escala do último mês: quem saiu não está nela, quem entrou está. */
  const esc = await get('coord', `/escala/folha?houseId=${ids.ARM1}&de=2027-02-01&ate=2027-02-13`, { rotulo: 'a escala de fevereiro' });
  const textoEsc = JSON.stringify(esc ?? {});
  if (textoEsc.includes('Bruno Educador')) achar('escala', 'coord', 'a escala de fevereiro', 'traz o Bruno, que saiu em dezembro');
  if (!textoEsc.includes('Elisa Educadora')) achar('escala', 'coord', 'a escala de fevereiro', 'não traz a Elisa, que entrou no lugar dele');
  await baixar('coord', '/escala/export', { houseId: ids.ARM1, de: '2027-02-01', ate: '2027-02-13' }, 'escala de fevereiro', ['Elisa Educadora']);

  /* A portaria, o armário, as compras e a cozinha no papel. */
  await baixar('coord', '/people/portaria/export', { houseId: ids.ARM1 }, 'folha da portaria');
  await baixar('enfermagem', '/medications/stock/report/export', { houseId: ids.ARM1, de: DE, ate: ATE }, 'relatório do armário');
  await baixar('enfermagem', '/medications/purchases/export', { houseId: ids.ARM1, de: DE, ate: ATE }, 'relatório das compras', ['Farmácia do Bairro']);
  await baixar('cozinha', '/people/kitchen-requests/export/restricoes', { houseId: ids.ARM1 }, 'restrições para a cozinha', ['Leite e derivados']);
  await baixar('cozinha', '/people/kitchen-requests/export/cestas', { houseId: ids.ARM1, de: DE, ate: ATE }, 'cestas básicas');

  /* Os acompanhamentos: todos aprovados? */
  const { rows: fu } = await admin.query(
    `SELECT kind, status::text, count(*)::int AS n FROM followup WHERE house_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [ids.ARM1]);
  console.log('  acompanhamentos:', JSON.stringify(fu));

  /* O que se acumula: avisos sem ler, por pessoa. Noventa dias de casa não podem virar mil avisos. */
  const { rows: avisos } = await admin.query(
    `SELECT u.email, count(*) FILTER (WHERE n.read_at IS NULL)::int AS sem_ler, count(*)::int AS total
       FROM notification n JOIN app_user u ON u.id = n.user_id
      WHERE u.email LIKE '%arm1%' OR u.email IN ('gestor@paodospobres.dev','enfermagem@paodospobres.dev','lider.noturno@paodospobres.dev')
      GROUP BY 1 ORDER BY 2 DESC`).catch((e) => ({ rows: [{ erro: String(e.message) }] }));
  console.log('  avisos por pessoa:', JSON.stringify(avisos));
  for (const a of avisos) if (a.sem_ler > 300) achar('avisos', a.email, 'avisos sem ler depois de noventa dias', `${a.sem_ler} de ${a.total}`);

  /* O tamanho do que ficou. */
  const { rows: tamanho } = await admin.query(
    `SELECT relname AS tabela, n_live_tup::int AS linhas FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 12`);
  console.log('  as maiores tabelas:', tamanho.map((t: any) => `${t.tabela} ${t.linhas}`).join(' · '));
}

// ================================================================ o que um ano pesa

/** Quanto ocupa a pasta dos anexos, em bytes. */
function tamanhoDaPasta(dir: string): number {
  const { readdirSync, statSync } = require('node:fs');
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const n of readdirSync(dir)) {
    const c = join(dir, n);
    const st = statSync(c);
    total += st.isDirectory() ? tamanhoDaPasta(c) : st.size;
  }
  return total;
}
let anexosNoInicio = 0;

/**
 * A MEDIÇÃO (fase 174). O pedido: *"ver se os bancos conseguem armazenar e se
 * os relatórios dão conta"*. Mede o tempo de cada leitura e relatório sobre o
 * período inteiro, como a pessoa os abre, e o tamanho do que ficou guardado.
 */
async function medir(ultimo: string) {
  relogio(somaDias(ultimo, 1), '10:00');
  const DE = INICIO, ATE = ultimo;
  const crianca = ativas()[0];
  const tempos: { o_que: string; ms: number; ok: boolean }[] = [];
  const cronometro = async (o_que: string, quem: string, metodo: 'get' | 'post', rota: string, corpo?: any) => {
    const t0 = process.hrtime.bigint();
    const r = await ato(quem, metodo, rota, corpo, { rotulo: o_que });
    const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
    tempos.push({ o_que, ms, ok: r !== null });
  };
  const fin = { finalidade: 'Medição do ano inteiro da casa com a coordenação.' };
  console.log(`\n▸ ${somaDias(ultimo, 1)} · o que ${DIAS} dias pesam`);
  /* O que abre a tela do turno, com o ano todo por trás. */
  await cronometro('o dia da casa', 'edu1', 'get', `/activities?houseId=${ids.ARM1}&date=${ATE}`);
  await cronometro('a grade do remédio', 'edu1', 'get', `/medications?houseId=${ids.ARM1}&date=${ATE}`);
  await cronometro('a ATA anterior', 'edu1', 'get', `/shifts/anterior?houseId=${ids.ARM1}`);
  await cronometro('a linha do tempo', 'edu1', 'get', `/timeline?houseId=${ids.ARM1}&date=${ATE}`);
  await cronometro('a lista da casa', 'edu1', 'get', `/people?houseId=${ids.ARM1}`);
  await cronometro('o perfil de uma criança', 'tecnica', 'get', `/people/${crianca.id}`);
  await cronometro('as visitas da criança desde o acolhimento', 'tecnica', 'get', `/people/${crianca.id}/visitas`);
  await cronometro('a auditoria da criança', 'coord', 'get', `/audit/person/${crianca.id}`);
  await cronometro('o painel da Enfermagem', 'enfermagem', 'get', `/nursing/panel?houseId=${ids.ARM1}`);
  await cronometro('o armário', 'enfermagem', 'get', `/medications/stock?houseId=${ids.ARM1}`);
  await cronometro('o arquivo das ATAs de um mês', 'coord', 'get', `/shifts/ata-archive?houseId=${ids.ARM1}&escala=mes&data=${ATE}`);
  await cronometro('a portaria do dia', 'portaria', 'get', `/people/portaria/hoje?houseId=${ids.ARM1}`);
  await cronometro('o painel da gestão', 'gestor', 'get', '/reports/panel');
  /* Os relatórios do ano inteiro. */
  const meio = [somaDias(ATE, -180), DE].sort().reverse()[0];
  await cronometro('o período da casa, os últimos seis meses (tela)', 'gestor', 'get', `/reports/period?houseId=${ids.ARM1}&de=${meio}&ate=${ATE}`);
  await cronometro('o período da casa, os últimos seis meses (Word)', 'gestor', 'post', '/reports/period/export', { houseId: ids.ARM1, de: meio, ate: ATE, ...fin });
  await cronometro('as refeições do ano', 'coord', 'get', `/reports/period/meals?houseId=${ids.ARM1}&de=${DE}&ate=${ATE}`);
  await cronometro('as métricas do remédio no ano', 'enfermagem', 'get', `/medications/metrics?houseId=${ids.ARM1}&de=${DE}&ate=${ATE}`);
  await cronometro('o armário do ano (Word)', 'enfermagem', 'post', '/medications/stock/report/export', { houseId: ids.ARM1, de: DE, ate: ATE, ...fin });
  await cronometro('as compras do ano (Word)', 'enfermagem', 'post', '/medications/purchases/export', { houseId: ids.ARM1, de: DE, ate: ATE, ...fin });
  await cronometro('as visitas da criança no ano (Word)', 'tecnica', 'post', `/people/${crianca.id}/visitas/export`, { de: DE, ate: ATE, ...fin });
  await cronometro('a trajetória da criança (Word)', 'tecnica', 'post', `/impacto/trajetoria/${crianca.id}/export`, fin);

  for (const t of tempos) console.log(`  ${t.ms > 2000 ? '✗' : '✓'} ${t.o_que}: ${t.ms} ms${t.ok ? '' : ' (recusado)'}`);
  for (const t of tempos.filter((x) => x.ms > 2000)) achar('lento', 'medição', t.o_que, `${t.ms} ms`);

  /* O tamanho do que ficou. */
  const { rows: [banco] } = await admin.query(`SELECT pg_database_size(current_database())::bigint AS b`);
  const { rows: tabelas } = await admin.query(
    `SELECT relname AS tabela, n_live_tup::int AS linhas, pg_total_relation_size(relid)::bigint AS bytes
       FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15`);
  const { rows: [sessoes] } = await admin.query(
    `SELECT (SELECT count(*) FROM user_session)::int AS sessoes, (SELECT count(*) FROM login_attempt)::int AS tentativas,
            (SELECT count(*) FROM audit_event)::int AS auditoria, (SELECT count(*) FROM notification)::int AS avisos`);
  const anexos = tamanhoDaPasta(process.env.ARQUIVOS_DIR ?? '/tmp/arquivos') - anexosNoInicio;
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  console.log(`  o banco inteiro: ${mb(Number(banco.b))} (a semente e as outras casas incluídas)`);
  console.log(`  os anexos desta casa: ${mb(anexos)}`);
  console.log(`  sessões ${sessoes.sessoes} · tentativas de entrada ${sessoes.tentativas} · auditoria ${sessoes.auditoria} · avisos ${sessoes.avisos}`);
  for (const t of tabelas) console.log(`    ${t.tabela.padEnd(34)} ${String(t.linhas).padStart(7)} linhas  ${mb(Number(t.bytes))}`);
  writeFileSync(join(SAIDA, 'medicao.json'), JSON.stringify({ dias: DIAS, tempos, banco: Number(banco.b), anexos, tabelas, sessoes }, null, 2));
}

// ================================================================ o começo e o fim

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  anexosNoInicio = tamanhoDaPasta(process.env.ARQUIVOS_DIR ?? "/tmp/arquivos");
  relogio(INICIO, '07:00');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  http = app.getHttpServer();

  for (const [k, email, cargo] of [
    ['gestor', 'gestor@paodospobres.dev', 'gestor_geral'],
    ['enfermagem', 'enfermagem@paodospobres.dev', 'enfermagem'],
    ['noturno', 'lider.noturno@paodospobres.dev', 'lider_noturno_geral'],
    ['coord4', 'coord.ai4@paodospobres.dev', 'coordenador'],
  ]) gente[k] = { email, senha: SENHA_SEMENTE, cargo, nome: k };
  ({ rows: [{ id: ids.ARM1 }] } = await admin.query(`SELECT id FROM house WHERE code='ARM1'`));
  ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

  try {
    await nascer();
    await acolher();
    await escalaDoPrimeiroMes();
    for (let n = 0; n < DIAS; n++) {
      const dia = somaDias(INICIO, n);
      if (n % 7 === 0) console.log(`▸ ${dia}`);
      await umDia(dia, n);
    }
    await conferir(somaDias(INICIO, DIAS - 1));
    await medir(somaDias(INICIO, DIAS - 1));
  } finally {
    writeFileSync(join(SAIDA, 'achados.json'), JSON.stringify({ fatos, achados, contagem }, null, 2));
    /* As contas para o ensaio de navegador contra o servidor, que roda depois
       (senhas fictícias, de um banco que é recriado a cada rodada). */
    writeFileSync(join(SAIDA, 'contas.json'), JSON.stringify(Object.entries(gente)
      .filter(([k]) => !['edu2', 'coord4'].includes(k))
      .map(([k, p]) => ({ quem: `${k} (${p.cargo})`, email: p.email, senha: p.senha }))));
    writeFileSync(join(SAIDA, 'agora.txt'), new Date(`${agoraLocal.replace(' ', 'T')}:00-03:00`).toISOString());
    console.log(`\n${achados.length} achado(s). Lista em ${SAIDA}/achados.json`);
    await app.close(); await admin.end();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
