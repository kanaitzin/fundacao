/**
 * O QUE FALTA (fase 319, pedido de 13/11: "revise o resto do cadastro e do
 * perfil"). A sonda dos formulários do perfil achou quinze folhas em que o
 * botão de gravar nascia apagado e nada dizia por quê: quem está com pressa
 * toca, nada acontece, e desiste. Esta linha fica logo acima do botão, e
 * some quando não falta mais nada.
 *
 * Cada item é uma ação ("escrever o motivo"), para a frase ler como colega:
 * "Falta escolher o tipo e escrever como a criança voltou."
 */
export function OQueFalta({ itens }: { itens: (string | false | null | undefined)[] }) {
  const falta = itens.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (!falta.length) return null;
  const frase = falta.length === 1
    ? falta[0]
    : `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}`;
  return (
    <p className="notice c-info o-que-falta" role="status" style={{ margin: '10px 0 0' }}>
      Falta {frase}.
    </p>
  );
}
