import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * O ROSTO DE UMA PESSOA NAS LISTAS (fase 198; pedido de 11/10).
 *
 * Vinte crianças, plantão que troca a cada doze horas, gente nova toda semana:
 * reconhecer a criança pelo rosto é a função da foto de identificação, e ela só
 * existia no alto do perfil. Agora aparece também na lista dos acolhidos, nos
 * contatos e nos visitantes.
 *
 * A foto só é pedida quando a lista diz que existe (`temFoto`), e uma vez por
 * sessão: fica num cache em memória, nunca no aparelho (é rosto de criança, e o
 * tablet é da casa). Sem foto, ou enquanto ela chega, ficam as iniciais, na cor
 * neutra da marca: nunca a cor de estado, de autor ou de cargo.
 *
 * A imagem é enfeite de quem já está nomeado ao lado (`alt=""`): o leitor de
 * tela lê o nome uma vez, e não "foto de Alice, Alice".
 */
const cache = new Map<string, string | null>();
const pedidos = new Map<string, Promise<string | null>>();

type Foto = { tipo: string; conteudo: string };
/** De quem é o rosto: uma criança (foto de identificação) ou um contato (foto 3×4). */
export type DeQuem = { acolhido: string } | { contato: string };

const chaveDe = (q: DeQuem) => ('acolhido' in q ? `a:${q.acolhido}` : `c:${q.contato}`);
/* As duas rotas escritas por extenso: o contrato de rotas confere que elas existem no servidor. */
const pedir = (q: DeQuem) => ('acolhido' in q
  ? api<Foto>(`/people/${q.acolhido}/photo`)
  : api<Foto>(`/people/contacts/${q.contato}/photo`));

function buscar(q: DeQuem): Promise<string | null> {
  const chave = chaveDe(q);
  if (cache.has(chave)) return Promise.resolve(cache.get(chave)!);
  let p = pedidos.get(chave);
  if (!p) {
    p = pedir(q)
      .then((f) => `data:${f.tipo};base64,${f.conteudo}`)
      .catch(() => null)
      .then((src) => { cache.set(chave, src); pedidos.delete(chave); return src; });
    pedidos.set(chave, p);
  }
  return p;
}

/** Esquece a foto guardada (depois de trocar a foto). */
export function esquecerFoto(q: DeQuem) { cache.delete(chaveDe(q)); }

export function iniciaisDe(nome: string) {
  return nome.replace(/\(.*?\)/g, '').split(' ').filter(Boolean).slice(0, 2)
    .map((n) => n[0]).join('').toUpperCase();
}

export function Avatar({ nome, de, temFoto, tamanho = 44, className = '' }: {
  nome: string; de?: DeQuem; temFoto?: boolean; tamanho?: number; className?: string;
}) {
  const chave = de ? chaveDe(de) : '';
  const [src, setSrc] = useState<string | null>(chave && cache.has(chave) ? cache.get(chave)! : null);
  useEffect(() => {
    let vivo = true;
    if (!de || !temFoto) { setSrc(null); return () => { vivo = false; }; }
    void buscar(de).then((s) => { if (vivo) setSrc(s); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, temFoto]);
  return (
    <span className={`avatar ${className}`} style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38) }}
          aria-hidden="true">
      {src ? <img src={src} alt="" /> : iniciaisDe(nome)}
    </span>
  );
}
