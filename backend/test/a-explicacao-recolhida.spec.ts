/**
 * A EXPLICAÇÃO RECOLHIDA (fase 230, pedido de 19/10: "o sistema parece poluído;
 * não quero tirar nenhuma ferramenta, quero apenas deixar menos poluído").
 *
 * O texto que explica a tela continua inteiro, mas recolhido: a primeira frase
 * fica à vista, e "Como funciona" abre o resto (`frontend/src/explica.tsx`).
 * Esta suíte cobra quatro coisas: a regra de quando recolher, que a frase que
 * diz o que o número NÃO é fica à vista, que o alerta nunca se recolhe, e que
 * toda tela que usa a caixa a importa do mesmo lugar.
 *
 * A segunda nasceu do primeiro `ensaio:uso` da fase: recolhidas pela primeira
 * frase, três telas passaram a mostrar o número de visitas sem dizer que quem
 * avalia é a equipe técnica, e a folha da atividade sem dizer que não é
 * avaliação da criança.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { FRASE_QUE_PROTEGE, primeiraFrase, resumoDoTexto } from '../../frontend/src/explica-regra';

const TELA = join(__dirname, '..', '..', 'frontend', 'src');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

describe('A explicação recolhida', () => {
  it('recolhe só o texto longo de mais de uma frase, e deixa a primeira à vista', () => {
    expect(resumoDoTexto('Cada pessoa assina a sua passagem.')).toBeNull();
    const umaSo = 'A criança internada continua da casa e continua na contagem e na vaga '
      + 'enquanto estiver no hospital com a equipe acompanhando cada dia dela';
    expect(resumoDoTexto(umaSo)).toBeNull();
    const duas = 'Quem fecha esta ATA é o Líder Diurno. O que faltar assinar fica registrado '
      + 'como pendência, e a ATA fechada não se reabre depois por ninguém da casa.';
    expect(resumoDoTexto(duas)).toBe('Quem fecha esta ATA é o Líder Diurno.');
    /* A frase que termina no fim do texto não deixa resto: não há o que abrir. */
    expect(primeiraFrase('Uma frase só, sem continuação.')).toBeNull();
  });

  it('a frase que diz o que o número não é fica à vista', () => {
    expect(resumoDoTexto('O número diz quantas visitas aconteceram. O que elas significam para a '
      + 'criança, a equipe técnica conversa e escreve no acompanhamento.')).toBeNull();
    expect(resumoDoTexto('Como a criança estava ao chegar e ao sair é observação de dois momentos, '
      + 'para a Enfermagem comparar. Não é avaliação da criança, e não é contada em painel nenhum.'))
      .toBeNull();
    /* Com resumo escrito à mão, a frase que protege vai no resumo. */
    const faltando: string[] = [];
    for (const p of arquivos(TELA)) {
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/<Explica[^>]*?resumo=\{<>([\s\S]*?)<\/>\}[^>]*>([\s\S]*?)<\/Explica>/g)) {
        if (FRASE_QUE_PROTEGE.test(m[2]) && !FRASE_QUE_PROTEGE.test(m[1])) {
          faltando.push(`${relative(TELA, p)}: ${m[1].trim()}`);
        }
      }
    }
    expect(faltando).toEqual([]);
  });

  it('o alerta, o recado de que deu certo e o aviso com número ficam à vista', () => {
    const achados: string[] = [];
    for (const p of arquivos(TELA)) {
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/<Explica[^>]*className="[^"]*\bc-(crit|warn|ok)\b/g)) {
        achados.push(`${relative(TELA, p)}: ${m[0]}`);
      }
    }
    expect(achados).toEqual([]);
  });

  it('toda tela que usa a caixa a importa do explica.tsx, e o botão diz o que faz', () => {
    const sem: string[] = [];
    let usos = 0;
    for (const p of arquivos(TELA)) {
      const s = readFileSync(p, 'utf8');
      if (!/<Explica[\s>]/.test(s) || p.endsWith('explica.tsx')) continue;
      usos += (s.match(/<Explica[\s>]/g) ?? []).length;
      if (!/import \{ Explica \} from '\.\.?\/explica';/.test(s)) sem.push(relative(TELA, p));
    }
    expect(sem).toEqual([]);
    expect(usos).toBeGreaterThan(40);
    const caixa = readFileSync(join(TELA, 'explica.tsx'), 'utf8');
    expect(caixa).toContain('aria-expanded={aberto}');
    expect(caixa).toContain("'Como funciona'");
  });
});
