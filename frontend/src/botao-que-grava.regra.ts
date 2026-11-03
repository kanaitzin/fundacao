/**
 * A FRASE DO BOTÃO QUE GRAVA (fase 265): o verbo do começo do rótulo e como a
 * frase o diz. Sem nada do navegador, para a suíte do servidor ler a mesma
 * regra que a tela usa (`botao-que-grava.ts`).
 */

/* O verbo do começo do rótulo e como a frase o diz. Botão de outro verbo
   não ganha a frase: nenhuma frase é melhor que a frase errada. */
export const FEITO_DO_VERBO: Record<string, string> = {
  registrar: 'Registrado', salvar: 'Salvo', gravar: 'Gravado', guardar: 'Guardado',
  assinar: 'Assinado', enviar: 'Enviado', confirmar: 'Confirmado', marcar: 'Marcado',
  concluir: 'Concluído', concluí: 'Concluído', anotar: 'Anotado', lançar: 'Lançado',
  acrescentar: 'Acrescentado', adicionar: 'Adicionado', publicar: 'Publicado',
  aprovar: 'Aprovado', corrigir: 'Corrigido', atualizar: 'Atualizado',
  /* Medidos no `ensaio:uso` (fase 265): os botões que gravam e ficavam sem a frase. */
  cadastrar: 'Cadastrado', anexar: 'Anexado', pedir: 'Pedido', encerrar: 'Encerrado',
  devolver: 'Devolvido', criar: 'Criado', liberar: 'Liberado', substituir: 'Substituído',
  retirar: 'Retirado', tirar: 'Tirado', escalar: 'Escalado', mandar: 'Enviado',
};

/** A frase do botão, ou nada se o verbo dele não é de gravar. */
export function fraseDoFeito(rotulo: string, hora: string): string | null {
  const verbo = rotulo.trim().split(/\s+/)[0]?.toLocaleLowerCase('pt-BR') ?? '';
  const feito = FEITO_DO_VERBO[verbo];
  return feito ? `${feito} às ${hora}` : null;
}

