# Matriz de permissões e escopo (Fase 1)

Fonte: Prompt Master §5 e §5.13. Esta matriz é aplicada em **duas camadas**:
guards/serviços na API e políticas RLS no banco. Escopos transversais são
limitados à **finalidade** do cargo na camada de aplicação.

## Escopo de casas

| Papel | Casas visíveis | Condição | Finalidade |
|---|---|---|---|
| Educador social | própria casa | plantão (janela T±10, `observe` no piloto) | operação do plantão |
| Líder Diurno | própria casa | plantão ativo | operação + fechamento ATA |
| Equipe técnica | própria casa | escala individual (pendência 33.4.3) | técnica |
| Coordenador | própria casa | sem limite de horário | gestão integral da casa |
| Educador volante | própria casa | plantão | operação (deslocamento é do acolhido, não do educador) |
| Enfermagem | **8 casas** | escala própria | somente saúde |
| Líder Noturno Geral | **8 casas** | durante o turno (19h–7h, preliminar) | operacional mínimo |
| Gestor Geral | **8 casas** (abre 1 por vez, auditado) | sem limite | institucional |
| Cozinha | — | — | somente relatório mínimo de alimentação |
| Admin técnico | infraestrutura | emergencial, temporário, auditado | sem acesso comum ao negócio |

## Capacidades por papel (resumo — cresce por fase)

| Capacidade | Edu | Líd.D | Téc | Coord | Enf | Líd.N | Gestor |
|---|---|---|---|---|---|---|---|
| Ver linha do tempo/visão dos 20 | ✅ | ✅ | ✅ | ✅ | saúde | mínimo | ✅ |
| Criar/alterar agenda regular | — | urgente pontual | ✅ | ✅ | — | urgente pontual | — |
| Confirmar medicamento | se administrou | se administrou | — | — | se administrou | — | — |
| Cadastrar/revisar esquema de medicamentos | — | — | acompanha | acompanha | ✅ assina | — | — |
| Editar perfil estrutural do acolhido | — | — | ✅ | ✅ | saúde | — | — |
| Ver narrativas pessoais de educadores | próprias | não navega | ✅ | ✅ | — | não | apuração formal |
| Criar/desativar usuários | — | — | — | ✅ própria casa | — | — | ✅ com auditoria |
| Dados bancários/benefícios | — | — | — | ✅ casa atual + reauth | — | — | ✅ + reauth |
| Baixar Resumo de Saúde | plantão | própria casa | própria casa | própria casa | 8 casas | 8 casas no turno | ✅ |
| Fechar ATA | assina a própria passagem | ✅ diurna | pode confirmar | reabre | — | ✅ noturnas + Geral | — |
| Auditoria (leitura) | — | — | — | própria casa | — | — | ✅ |

## Regras invariantes

- Conta individual; ninguém assina ou confirma por outro (§5.1, §11.2, §12.1).
- Fora de escopo = **404 idêntico a inexistente** (não vaza existência).
- Acesso excepcional (gestor → narrativa pessoal) exige finalidade, justificativa,
  **reautenticação** e auditoria destacada (§5.2).
- Desligado = desativado; autoria e histórico preservados (§5.1).
- Alterar relógio do aparelho não amplia acesso (§5.12) — janela avaliada no servidor.
