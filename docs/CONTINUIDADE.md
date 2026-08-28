# Rede Acolher — Documento de Continuidade

> **Como usar este arquivo:** anexe-o na primeira mensagem de uma conversa nova.
> Ele substitui todo o histórico. Nada anterior precisa ser relido.
>
> Última atualização: 28/08/2026 · commit `4f5c135`

---

## 1. O que é

**Rede Acolher** — plataforma interna de gestão do programa de acolhimento
institucional da **Fundação O Pão dos Pobres** (Porto Alegre).

- **8 unidades**, ~20 acolhidos cada
- **Casa 03** é o piloto
- Contato institucional: **Marcelo Barbosa** — `mbarbosa@paodospobres.com.br`

O sistema substitui planilhas soltas, cadernos de plantão e grupos de WhatsApp
por um registro único, auditado e com autoria.

**Papel do assistente:** equipe digital multidisciplinar — engenheiro sênior,
analista de sistemas, coordenador de acolhimento e psicólogo. As decisões de
produto são discutidas do ponto de vista de quem trabalha na casa, não só do
ponto de vista técnico.

---

## 2. Restrições permanentes (não negociáveis)

Estas regras valem para tudo que for construído. Não são preferências.

### Segurança do processo
- **Nunca publicar, nunca fazer deploy em produção, nunca usar dado real** sem
  autorização expressa. Construir e validar local/dev com **dados fictícios**. (§3.3)
- **Segredos nunca no código.**
- **Logs da aplicação nunca copiam conteúdo sensível** — só IDs e metadados.

### Proibições absolutas
- WhatsApp, ou envio de dados por WhatsApp
- GPS, geolocalização contínua, mapa de deslocamento
- Contas compartilhadas
- Acesso de um funcionário a outra casa fora das exceções funcionais expressas
  (Gestor Geral, Enfermagem, Líder Noturno Geral)
- Ranking de casas, de acolhidos ou de equipe
- Pontuação de comportamento
- Decisão automática sobre diagnóstico, culpa, risco, punição, visita,
  medicação, destino ou transferência
- Exclusão simples ou silenciosa
- Sobrescrever registro fechado
- CPF, diagnóstico ou conteúdo judicial em nome de arquivo
- Dado real em dev/teste
- Envio automático para Judiciário, Conselho Tutelar, MP ou serviços de saúde
- Acesso direto do educador ao Drive
- Módulo de alistamento militar
- Controle de cofre físico
- Microsserviços prematuros

### Dados bancários e benefícios
Visíveis **apenas** para o coordenador da casa atual e o Gestor Geral, com
**reautenticação** e **log por visualização**.

### Arquitetura
> "Quero que você separe as partições das funções, caso seja necessário deletar
> ou adicionar algo, não estraga nenhuma outra parte construída junto."

Cada módulo é uma partição isolada. Mexer em um não pode quebrar outro.

### Design
Cor comunica **estado operacional** e categoria — **nunca julgamento sobre a
pessoa**. Toda ação tem autor e histórico.

---

## 3. Stack e arquitetura

**Monólito modular** — não microsserviços.

| Camada | Tecnologia |
|---|---|
| Backend | NestJS + TypeScript |
| Banco | PostgreSQL 16 |
| Frontend | React PWA (Vite + vite-plugin-pwa) |
| Protótipo | vite-plugin-singlefile → um `.html` |

**Autorização em duas camadas:**
1. Regra de negócio na aplicação
2. **Row-Level Security** no banco — `DatabaseService.asUser()` define
   `app.user_id` por transação. O banco não devolve linha fora do escopo:
   não é filtro de tela.

**Protótipo:** `VITE_PROTOTIPO=1` faz `api()` em `src/api.ts` chamar
`mockApi()` de `src/mock.ts` — um servidor de mentira em memória. O protótipo
**é** o aplicativo de verdade, só com outra fonte de dados. Foi assim que ele
parou de divergir das telas reais.

---

## 4. Estrutura do repositório

```
rede-acolher/
├── backend/src/
│   ├── kernel/          audit, common (cpf, crypto, segredo, tempo),
│   │                    database, events, health
│   └── modules/         16 partições isoladas ↓
├── frontend/src/
│   ├── screens/         16 telas React
│   ├── mock.ts          servidor de mentira do protótipo
│   ├── api.ts           cliente HTTP + classe ErroApi
│   ├── App.tsx          navegação, abas, seletor de cargo
│   └── styles.css       design system, tema claro/escuro
├── prototipo/           rede-acolher-prototipo.html (gerado)
└── docs/                arquitetura, DER, matriz de permissões, backlog…
```

**Módulos do backend (16):** activities, archive, checks, houses, identity,
incidents, medications, notifications, nursing, people, reports, routine,
shifts, statements, sync, timeline

**Telas do frontend (16):** Login, SenhaPessoal, Dia, Chamada, Acolhidos,
Cadastro, Passagem, Agenda, Equipe, Saude, Ocorrencias, Ata, Cofre,
Transferencias, Acompanhamentos, Arquivo

**Comandos:**
```bash
cd frontend && npm run prototipo   # gera o .html de um arquivo só
cd frontend && npx tsc --noEmit    # confere tipos
cd backend  && npm test            # testes
```

---

## 5. Fases concluídas

| Fase | Conteúdo |
|---|---|
| 0–1 | Autenticação, isolamento RLS, auditoria, PWA |
| 2 | Perfil do acolhido: pessoa/episódio/permanência, CPF único, documentos, benefícios restritos, transferência, acervo |
| 3 | Partições isoladas + rotina, atividades, chamadas, linha do tempo, notificações, offline |
| 4 | Medicamentos com confirmação individual, enfermagem com triagem, escalonamento como contrato genérico |
| 5 | Plantão com passagem individual; ATA que fecha com pendência em vez de assinatura presumida; ocorrências que não se encerram sozinhas |
| 6 | Acompanhamentos, relatórios, aprovações, arquivo no Drive |
| 7 | Ensaio geral do piloto e plano da Casa 03 |
| — | Cofre de acessos, formulários reais da Fundação, agenda com responsável nomeado, cadastro completo do acolhido |

**Duas auditorias já rodadas:** uma corrigiu uma classe inteira de defeitos
(JOIN com tabela sob RLS apagava a linha); outra encontrou 21 defeitos de
estado, concorrência e fuso.

---

## 6. Decisões de produto que valem lembrar

**Entrada em dois passos.** A pessoa digita o e-mail; o sistema responde se
aquela conta já tem senha. Quem não tem entra e cria a sua ali mesmo, no
próprio aparelho. Motivo: distribuir senha inicial para 40 pessoas acabaria
virando mensagem de WhatsApp — a senha circula em grupo, some no histórico e
nunca é trocada.
**Falta no servidor:** o primeiro acesso precisa valer **uma vez**, por convite
da coordenação e com prazo. Sem isso, o e-mail sozinho vira porta permanente.

**Cofre de acessos.** As senhas das contas das crianças entram no sistema,
criptografadas, visíveis só para o coordenador da casa, com auditoria.
Raciocínio do Leonardo: *"Se não colocarmos isso no sistema eles ainda vão
fazer isso numa planilha solta, prefiro no nosso sistema unificado e protegido."*

**Cinco abas, não seis.** A barra inferior carrega o turno — Dia, Chamada,
Acolhidos, Passagem. O resto mora em "Mais". Com seis, "Unidades" já saía pela
borda do celular. Aba que não cabe é aba que ninguém acha.

**Cadastro em quatro passos.** 25 campos numa rolagem só é o formulário que
ninguém termina. O CPF é conferido **antes** do resto: se a criança já tem
perfil, cadastrar de novo parte o histórico em dois — e é o histórico partido
que faz a audiência perguntar o que o sistema deveria saber.

---

## 7. Protótipo — estado atual

`prototipo/rede-acolher-prototipo.html` — **431 KB, um arquivo só**. Abre com
dois cliques, sem servidor, sem banco, sem instalar nada.

**Entrar:** `mbarbosa@paodospobres.com.br` — sem senha inicial; ele cria a dele
na hora.

**Recursos exclusivos do protótipo:**
- **👁 Ver como** — barra abaixo do cabeçalho: troca o cargo e o sistema inteiro
  se reorganiza. Permite percorrer as 9 funções sem sair e entrar de novo.
- **🌓** — alterna tema claro/escuro.
- Abre **sempre em tema claro** (`data-theme="light"` no `<html>`), porque o
  arquivo é distribuído por anexo e não pode depender do modo escuro estar
  desligado na máquina de quem recebe.
- Tarja permanente: *"Protótipo · dados fictícios · nada é salvo ao fechar"*.

**O que o protótipo NÃO faz, e é bom que não faça:** isolamento por casa, RLS,
auditoria, criptografia. Essas proteções vivem no banco, e é lá que precisam ser
conferidas. Um protótipo que fingisse tê-las daria uma sensação de segurança que
não tem como sustentar.

### ⚠️ Nota histórica sobre o protótipo
Existiram **duas gerações**. A primeira era um HTML escrito à mão (2.681 linhas)
que cobria todas as áreas, mas divergia do aplicativo real. A segunda, atual, é
o aplicativo React compilado — fiel, porém nasceu com só 7 telas. Isso causou a
impressão de que o protótipo "tinha piorado". **Já corrigido:** as 7 telas
faltantes foram reconstruídas como React (commit `4f5c135`). O protótipo atual
cobre as 16 áreas **e** é o código de verdade.

---

## 8. Pendências

### 8.1 Defeitos do backend — auditoria (12 confirmados, por prioridade)

| # | Onde | Defeito |
|---|---|---|
| 1 | `app_mark_unconfirmed` | SECURITY DEFINER **sem checagem de escopo** — qualquer usuário autenticado afeta atividade de outra casa |
| 2 | `clientOpId` | Contorna a proteção de estado final — a fila offline sobrescreve atividade concluída |
| 3 | `enviarParaAprovacao` | Valida **depois** do commit — acompanhamento trava em `em_aprovacao` com eixos vazios |
| 4 | `medication_stock` | UNIQUE com `person_id` anulável — NULL nunca conflita, duplicatas acumulam |
| 5 | Chamada | `ON CONFLICT DO UPDATE` sobrescreve marcação **e autoria** sem histórico |
| 6 | `atualizarJudicial` | Atualiza **todos** os episódios da pessoa — falta filtro por `episode_id` |
| 7 | Panel service | Corta o mês em UTC, não em America/Sao_Paulo |
| 8 | `requestSubstitution` | Reabre atividade já concluída |
| 9 | Arquivo | Nome do arquivo usa data UTC; o caminho usa data São Paulo |
| 10 | Prescrições | `current_date` em UTC — dose perdida depois das 21h, Resumo de Saúde errado |
| 11 | `listDay` (chamada) | Usa contagem `expected` congelada em vez da contagem viva |
| 12 | `addItem` (rotina) | Aceita qualquer `versionId`, inclusive de versão fechada |

> **Padrão por trás dos defeitos 7, 9 e 10:** o sistema é de Porto Alegre, o
> servidor pensa em UTC. Toda data que vira "o dia de hoje" precisa passar por
> `America/Sao_Paulo`. Vale revisar o `kernel/common/tempo.ts` como fonte única.

### 8.2 Funcionalidades
- Rota `/auth/primeiro-acesso` no backend real, com convite de uso único e prazo
- Segunda auditoria (testes e documentação) — ficou incompleta por limite de taxa

---

## 9. Sugestão de próximo passo

1. **Corrigir os defeitos 1 a 3** — são os de segurança e perda de dado
2. **Fuso horário (7, 9, 10)** em um só passe, via `tempo.ts`
3. **Histórico de autoria (5, 6, 8, 12)** — a família "registro fechado não se
   sobrescreve", que é uma das regras do projeto
4. Rota de primeiro acesso com convite
5. Levar o protótipo ao Marcelo e coletar o retorno por cargo

---

## 10. Prompt para abrir a conversa nova

```
Anexo o documento de continuidade do Rede Acolher (docs/CONTINUIDADE.md).
Ele tem o contexto completo — o que é o projeto, as restrições permanentes,
a arquitetura e o que falta.

O repositório está em /home/user/rede-acolher.

Quero começar por: [SEU PEDIDO]
```
