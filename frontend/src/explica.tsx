/**
 * A EXPLICAÇÃO RECOLHIDA (fase 230, pedido de 19/10: "o sistema possui muitas
 * informações, parece poluído; não quero tirar nenhuma ferramenta, quero apenas
 * deixar menos poluído e mais fácil de usar").
 *
 * Medido com todas as telas de todos os cargos abertas: 35% das palavras eram
 * explicação, e não dado. A explicação continua inteira, mas recolhida: a
 * primeira frase fica à vista, e "Como funciona" abre o resto. Texto curto, de
 * uma frase só, fica como estava, sem botão.
 *
 * Não passa por aqui o que não pode esperar um toque: o recado de que algo foi
 * registrado, o alerta (`c-crit`, `c-warn`) e o aviso que traz o número do dia
 * ("18 turnos sem ninguém"). Esses continuam à vista, como antes.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { resumoDoTexto } from './explica-regra';

export function Explica({ children, resumo, className = 'mutetxt', style, role }: {
  /** O texto inteiro, como era. */
  children: ReactNode;
  /** O que fica à vista. Sem ele, e com texto puro, é a primeira frase. */
  resumo?: ReactNode;
  /** A caixa de antes: `mutetxt`, ou `notice c-info` para o aviso azul. */
  className?: string;
  style?: CSSProperties;
  role?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const texto = typeof children === 'string' ? children : null;
  const curto = resumo ?? (texto ? resumoDoTexto(texto) : null);
  if (!curto) return <div className={className} style={style} role={role}>{children}</div>;
  return (
    <div className={className} style={style} role={role} data-explica>
      {aberto ? children : curto}{' '}
      <button type="button" className="explica-mais" aria-expanded={aberto}
              onClick={() => setAberto(!aberto)}>
        {aberto ? 'Mostrar menos' : 'Como funciona'}
      </button>
    </div>
  );
}
