/**
 * OS CAMPOS DO CADASTRO SUGERIDOS PELO PAPEL (fase 235).
 *
 * A regra é a mesma na tela e no servidor (`campos-do-papel.regra.ts`). Os papéis
 * abaixo são fictícios, escritos como chegam da leitura: maiúsculas, rótulos com e
 * sem dois-pontos, a data com barra e por extenso, e linhas que não são de ninguém.
 */
import { camposDoPapel, nomeArrumado, nomeDiferente } from '../src/modules/people/campos-do-papel.regra';

const valores = (texto: string) => Object.fromEntries(camposDoPapel(texto).map((s) => [s.campo, s.valor]));

describe('Os campos do papel', () => {
  it('a certidão de nascimento sugere o nome, a data e a filiação, cada um com o trecho', () => {
    const certidao = [
      'REPÚBLICA FEDERATIVA DO BRASIL',
      'CERTIDÃO DE NASCIMENTO',
      'NOME',
      'ALICE FICTÍCIA DOS SANTOS',
      'DATA DE NASCIMENTO: 04/03/2016',
      'FILIAÇÃO',
      'MARIA FICTÍCIA DOS SANTOS',
      'JOÃO FICTÍCIO DA SILVA',
      'AVÓS',
      'ROSA FICTÍCIA',
    ].join('\n');
    const s = camposDoPapel(certidao);
    expect(valores(certidao)).toEqual({
      nome: 'Alice Fictícia dos Santos',
      nascimento: '2016-03-04',
      filiacao: 'Maria Fictícia dos Santos\nJoão Fictício da Silva',
    });
    expect(s.find((x) => x.campo === 'nascimento')?.trecho).toContain('04/03/2016');
    expect(s.find((x) => x.campo === 'filiacao')?.valor).not.toMatch(/Rosa/);
  });

  it('os rótulos de mãe e pai, a data por extenso, o RG e o CNS', () => {
    const papel = [
      'Nome: Bruno Ficticio Lima',
      'Nascido em 12 de março de 2014',
      'Nome da mãe: Carla Ficticia Lima',
      'Pai: Paulo Ficticio Lima',
      'RG 12.345.678-9',
      'Cartão SUS 700 0012 3456 7890',
    ].join('\n');
    expect(valores(papel)).toEqual({
      nome: 'Bruno Ficticio Lima', nascimento: '2014-03-12', rg: '12.345.678-9',
      cns: '700001234567890', filiacao: 'Carla Ficticia Lima\nPaulo Ficticio Lima',
    });
  });

  it('o que o papel não diz claramente não entra', () => {
    expect(camposDoPapel('')).toEqual([]);
    expect(camposDoPapel('Reunião de pais na sexta-feira, às 14h.\nTrazer o caderno assinado.')).toEqual([]);
    /* A data impossível e o cartão com dígitos a menos ficam de fora. */
    expect(valores('Data de nascimento: 31/02/2015\nCNS 1234 5678')).toEqual({});
    /* O nome do pai não vira o nome da criança. */
    expect(valores('Nome do pai: Paulo Ficticio Lima').nome).toBeUndefined();
  });

  it('o nome arrumado e o aviso de nome diferente', () => {
    expect(nomeArrumado('  ANA  PAULA DE   SOUZA ')).toBe('Ana Paula de Souza');
    expect(nomeDiferente('Alice Fictícia dos Santos', 'Alice Ficticia Santos')).toBe(false);
    expect(nomeDiferente('Alice Fictícia dos Santos', 'Bruno Ficticio Lima')).toBe(true);
  });
});
