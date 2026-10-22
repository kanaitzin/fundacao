/**
 * A FOLHA DOS BENEFÍCIOS E DADOS BANCÁRIOS (conserto de 22/10).
 *
 * O Exportar da área de benefícios registrava a finalidade e não entregava
 * arquivo nenhum. A folha é montada aqui, sem importar nada do servidor, e o
 * protótipo lê a MESMA (como a da internação): as duas não podem divergir.
 */
import { Folha, AutorDaFolha, diaBR, hhmmBR } from '../../kernel/documentos/folha';

export interface BeneficioNaFolha {
  tipoRotulo: string; situacaoRotulo: string; numero: string | null;
  banco: string | null; agencia: string | null; agenciaNome: string | null;
  conta: string | null; operacao: string | null;
  pendenciaBancaria: boolean; pendenciaNota: string | null;
  temAcessoGov: boolean; responsavelPeloAcesso: string | null; observacoes: string | null;
}

export function folhaDosBeneficios(acolhido: string, finalidade: string, registros: BeneficioNaFolha[],
                                   autor: AutorDaFolha, agora = new Date()): Folha {
  /* O travessão do rótulo da tela não vai ao papel (§5 item 10). */
  const semTravessao = (t: string) => t.replace(/ — /g, ': ');
  return {
    titulo: `Benefícios e dados bancários de ${acolhido}`,
    identificacao: [
      { rotulo: 'Acolhido', valor: acolhido },
      { rotulo: 'Emitida em', valor: `${diaBR(agora)}, às ${hhmmBR(agora)}` },
      { rotulo: 'Finalidade', valor: finalidade.trim() },
      { rotulo: 'Registros', valor: String(registros.length) },
    ],
    secoes: registros.length ? registros.map((r) => ({
      titulo: semTravessao(r.tipoRotulo),
      paragrafos: [
        `Situação: ${r.situacaoRotulo}.`,
        ...(r.numero ? [`Número do benefício: ${r.numero}.`] : []),
        ...(r.banco || r.agencia || r.conta ? [[
          r.banco ? `Banco: ${r.banco}` : '',
          r.agencia ? `agência ${r.agencia}${r.agenciaNome ? ` (${r.agenciaNome})` : ''}` : '',
          r.conta ? `conta ${r.conta}${r.operacao ? `, operação ${r.operacao}` : ''}` : '',
        ].filter(Boolean).join(', ') + '.'] : []),
        ...(r.pendenciaBancaria ? [`Pendência bancária: ${r.pendenciaNota || 'a regularizar junto ao banco'}.`] : []),
        ...(r.temAcessoGov ? [`Acesso ao gov.br sob a responsabilidade de ${r.responsavelPeloAcesso || 'pessoa a confirmar'}.`] : []),
        ...(r.observacoes ? [`Observações: ${r.observacoes}`] : []),
      ],
    })) : [{ titulo: 'Registros', paragrafos: ['Não há benefício nem conta registrados para este acolhido.'] }],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Documento de uso restrito da coordenação. Contém dados bancários do acolhido e deve '
      + 'ser entregue somente ao órgão indicado na finalidade, sem cópias.',
  };
}
