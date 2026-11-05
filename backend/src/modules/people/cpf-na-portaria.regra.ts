/**
 * O CPF INTEIRO NA PORTARIA (fase 277, decisão de 05/11, avaliação humana).
 *
 * O CPF do visitante é dado de terceiro. Na lista do portão ele vem com os
 * dígitos do meio escondidos, para todos. Quem confere a identidade no portão
 * (a portaria) e quem responde pelo cadastro (a equipe técnica e a coordenação)
 * vê o número inteiro ao tocar em Ver o CPF, e cada abertura fica na auditoria,
 * com quem viu e quando. A regra mora aqui, sem importar nada: o servidor, a
 * tela e o protótipo leem a mesma lista.
 */
export const QUEM_VE_CPF_INTEIRO = ['portaria', 'equipe_tecnica', 'coordenador'];
