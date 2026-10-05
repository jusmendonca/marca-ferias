# Marca Férias — Núcleo de Educação EFIN1 — Design

**Data:** 2026-10-05
**Status:** aguardando revisão

## 1. Objetivo

Substituir o controle de férias por planilha/e-mail do Núcleo de Educação da EFIN1 por um app web gratuito, acessado por link compartilhado, em que cada Procurador marca suas férias de **2027** e escolhe o turno de **recesso 2026/2027**, e onde todos enxergam num só lugar os choques e a ocupação de cada setor.

**Público:** algumas dezenas de Procuradores. **Administrador:** um (o autor do pedido).

**Critérios de sucesso**
- Cada Procurador consegue marcar/alterar seus períodos sozinho, protegido por PIN.
- Visualização em barras (Gantt) deixa evidente quem está fora e quantos ficam em cada setor, por dia.
- O admin acompanha quem está pendente/completo e exporta os dados em CSV.
- Custo zero e sem manutenção recorrente (sem hibernação do banco).

## 2. Arquitetura

- **Front-end:** SPA estática em **Vite + TypeScript** (sem framework pesado), publicada no **GitHub Pages** (repositório público).
- **Back-end:** **Supabase (Postgres)**, plano gratuito.
  - RLS habilitado em todas as tabelas; **nenhuma escrita direta** pelo cliente.
  - Leitura pública (via role `anon`) somente de dados não sensíveis, exposta por *views* ou RPCs de leitura que **nunca** retornam `pin_hash`, hashes de senha ou tokens.
  - Toda escrita via **funções RPC `security definer`**, que validam credenciais e regras de negócio.
  - Hash de PIN e de senha admin com bcrypt (`pgcrypto`: `crypt()` + `gen_salt('bf')`).
- **GitHub Actions:**
  - `deploy.yml`: build e publicação no Pages a cada push na `main`.
  - `keep-alive.yml`: a cada 3 dias, consulta leve ao Supabase para evitar a pausa por inatividade do plano gratuito.
- **Configuração do front:** URL do Supabase e chave `anon` injetadas no build por variáveis de ambiente (secrets do repositório).

## 3. Modelo de dados

| Tabela | Campos |
|---|---|
| `setores` | `id`, `nome` (único), `ordem` |
| `procuradores` | `id`, `nome`, `setor_id` → setores, `pin_hash` (nulo até 1º acesso), `recesso` (`natal` \| `ano_novo` \| nulo), `ativo` (bool), `tentativas_falhas` (int), `bloqueado_ate` (timestamptz nulo) |
| `periodos_ferias` | `id`, `procurador_id` → procuradores, `inicio` (date), `fim` (date); `check (fim >= inicio)` |
| `dias_especiais` | `data` (PK), `tipo` (`feriado` \| `facultativo`), `descricao` |
| `config` | linha única: `admin_hash`, `recesso_natal_inicio`, `recesso_natal_fim`, `recesso_ano_novo_inicio`, `recesso_ano_novo_fim` |
| `sessoes` | `token` (PK, aleatório), `procurador_id` (nulo = sessão admin), `expira_em` |

**Seed inicial**
- Feriados nacionais 2027 (`tipo = feriado`): 01/01 Confraternização Universal; 26/03 Sexta-feira Santa; 21/04 Tiradentes; 01/05 Dia do Trabalho; 07/09 Independência; 12/10 Nossa Senhora Aparecida; 02/11 Finados; 15/11 Proclamação da República; 20/11 Dia Nacional de Zumbi e da Consciência Negra; 25/12 Natal.
- Pontos facultativos **não** são pré-carregados (Carnaval 08–09/02, Corpus Christi 27/05 etc. são cadastrados pelo admin).
- Recesso (valores iniciais, editáveis no admin): **Natal** 20/12/2026–26/12/2026; **Ano-Novo** 27/12/2026–02/01/2027.
- Senha admin inicial definida no setup (instruções no README); setores e Procuradores cadastrados pelo admin.

## 4. Regras de negócio

Validadas **no servidor** (autoritativo) e replicadas no cliente para feedback imediato, a partir de um módulo TS de lógica pura.

1. Contagem em **dias corridos**: `fim − inicio + 1`.
2. Períodos de férias dentro de **01/01/2027 a 31/12/2027**.
3. Sem limite de quantidade de períodos; **soma ≤ 30 dias**.
4. Períodos da mesma pessoa não se sobrepõem entre si nem com o recesso que ela escolheu.
5. **Status** do Procurador: `completo` se soma = 30 **e** recesso escolhido; senão `pendente`.
6. Nenhuma outra restrição (sem fração mínima, sem regra de dia de início, sem mínimo por setor). Choques são apenas visualizados, não bloqueados nem alertados.

**Ocupação por setor (por dia):** `presentes = ativos do setor − (em férias ∪ em recesso naquele dia)`. Exibida também em fins de semana/feriados, com estes esmaecidos.

**Alteração de recesso pelo admin:** se o admin alterar as datas de um turno de recesso, marcações existentes que passem a se sobrepor **não** são apagadas; o Procurador afetado aparece com aviso de conflito no admin e no próprio editor até corrigir.

## 5. Telas e fluxos

### 5.1 Tela principal (`/`)
- Cabeçalho: filtro de setor (todos / um) e contador "X de Y completos".
- **Gantt** de 21/12/2026 a 31/12/2027, linhas agrupadas por setor, uma barra por período de férias; recesso em cor distinta hachurada; fins de semana, feriados e pontos facultativos com fundo sombreado (legenda visível).
- Zoom: **Ano / Trimestre / Mês**, com rolagem horizontal.
- **Faixa de ocupação** sob cada setor: heatmap diário com "presentes/total"; intensidade maior quanto menos presentes. Tooltip lista quem está fora.
- Clique em uma barra abre os detalhes dos períodos do Procurador.

### 5.2 Marcar minhas férias
1. Botão "Marcar minhas férias" → selecionar setor → selecionar nome.
2. 1º acesso: criar PIN (4–6 dígitos, com confirmação). Acessos seguintes: digitar PIN.
3. Editor: lista de períodos (início/fim com date picker, nº de dias por período), adicionar/remover; contador "N / 30 dias".
4. Escolha de recesso por rádio (*Natal* / *Ano-Novo*), com as datas configuradas.
5. Pré-visualização: quem do mesmo setor estará fora em cada período escolhido.
6. **Salvar**: RPC atômico substitui todos os períodos + recesso da pessoa; erros exibidos em português.
- Token de sessão guardado no `localStorage` (validade 4 h); botão "Sair".

### 5.3 Admin (`/admin`)
- Login por senha admin (sessão de 4 h).
- CRUD de setores (nome, ordem) e de Procuradores (nome, setor, ativo).
- Resetar PIN de um Procurador (zera `pin_hash`, tentativas e bloqueio).
- CRUD de dias especiais (feriado/facultativo) e edição das datas dos dois turnos de recesso.
- Tabela de status (setor, nome, dias marcados, recesso, pendente/completo, aviso de conflito).
- Editar férias/recesso de qualquer Procurador.
- Exportar CSV (uma linha por período: setor, nome, início, fim, dias, recesso, status).
- Trocar senha admin.

## 6. API (RPCs)

| RPC | Acesso | Efeito |
|---|---|---|
| `dados_publicos()` | público | setores, procuradores (id, nome, setor, recesso, ativo, tem_pin), períodos, dias especiais, datas de recesso |
| `definir_pin(procurador_id, pin)` | público, só se `pin_hash` nulo | grava hash, retorna token |
| `entrar(procurador_id, pin)` | público | valida PIN (bloqueio: 5 falhas → 15 min), retorna token |
| `salvar_minhas_ferias(token, periodos[], recesso)` | token de Procurador | valida regras, substitui períodos e recesso numa transação |
| `admin_entrar(senha)` | público | retorna token admin |
| `admin_*` (setores, procuradores, dias especiais, recesso, reset PIN, salvar férias de terceiros, trocar senha) | token admin | CRUD correspondente |
| `sair(token)` | token | invalida sessão |
| `ping()` | público | usado pelo keep-alive |

Erros: `raise exception` com código/mensagem em português, traduzidos pelo cliente.

## 7. Erros e resiliência

- Mensagens de validação claras (ex.: "Soma ultrapassa 30 dias (32)", "Período sobrepõe o recesso escolhido", "PIN incorreto — 3 tentativas restantes", "Bloqueado até 14:32").
- Falha de rede ou Supabase indisponível: aviso "Não foi possível conectar; tente novamente em instantes".
- Token expirado: volta à tela de PIN preservando o rascunho em edição.

## 8. Testes

- **Vitest:** módulo de lógica pura (contagem de dias, sobreposição, validação, ocupação por setor por dia, status, geração de CSV).
- **Integração do servidor:** como não há Docker local, os testes de RPC rodam contra um **segundo projeto Supabase gratuito ("dev")**, com migrations aplicadas e dados de teste recriados a cada execução. Cobrem: criação/validação de PIN, bloqueio por tentativas, regras de 30 dias/ano/sobreposição, isolamento entre Procuradores, ausência de dados sensíveis na leitura pública e rejeição de escrita direta nas tabelas.
- O projeto "dev" também é mantido ativo pelo keep-alive (ou restaurado sob demanda).

## 9. Deploy e setup

- Repositório público no GitHub; migrations SQL versionadas em `supabase/migrations/`.
- README com passo a passo: criar projeto(s) Supabase, aplicar migrations (SQL Editor ou Supabase CLI sem Docker via `supabase db push`), definir senha admin, cadastrar secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), habilitar Pages.

## 10. Fora de escopo (YAGNI)

- Login institucional/Google, e-mails/notificações.
- Fração mínima, regras de dia de início, mínimo de presentes por setor (podem ser adicionados depois).
- Múltiplos anos/exercícios simultâneos.
- Fluxo de aprovação de férias pela chefia.
