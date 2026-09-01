/**
 * QUEM ASSINA O DOCUMENTO.
 *
 * Todo documento que sai do sistema leva o nome e o cargo de quem o gerou — é
 * o que faz um papel solto continuar dizendo de onde veio. As telas conhecem o
 * CARGO (recebem `papel`), mas não o nome de quem está logado, e enfiar mais
 * uma propriedade em dez telas para carregar duas palavras deixaria a
 * assinatura à mercê de quem esquecesse de passar a propriedade na décima
 * primeira.
 *
 * Então o nome mora aqui, num lugar só, escrito uma vez quando a sessão abre.
 * Se por algum motivo não tiver sido escrito, o documento sai dizendo isso em
 * vez de sair com uma assinatura em branco.
 */
import { cargo as rotuloDoCargo } from './rotulos';

let atual: { nome: string; cargo: string } = {
  nome: '(sessão sem identificação)', cargo: '—',
};

export function definirQuemAssina(nome: string, codigoDoCargo: string) {
  atual = { nome, cargo: rotuloDoCargo(codigoDoCargo) };
}

export function quemAssina(): { nome: string; cargo: string } {
  return atual;
}
